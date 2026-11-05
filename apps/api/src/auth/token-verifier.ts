import { isUUID } from 'class-validator';
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

const KEYS_PATH = '/auth/v1/.well-known/jwks.json';
const ISSUER_PATH = '/auth/v1';
const SIGNED_IN_AUDIENCE = 'authenticated';
const SIGNED_IN_ROLE = 'authenticated';

// Never a shared-secret algorithm. The local stack's secret is public, and its anon key is signed with it.
const ACCEPTED_ALGORITHMS = ['ES256', 'RS256'];
const REQUIRED_CLAIMS = ['sub', 'exp'];
const SIGNING_KEYS_MAX_AGE_MS = 3_600_000;

// Students have no passwords. Auth still accepts them, so anyone could plant one on an address they do not own.
const STUDENT_SIGN_IN_METHODS: ReadonlySet<string> = new Set(['otp', 'magiclink', 'email/signup', 'oauth']);
const DEVELOPMENT_SIGN_IN_METHODS: ReadonlySet<string> = new Set([...STUDENT_SIGN_IN_METHODS, 'password']);
const DEVELOPMENT = 'development';

const TOKEN_ERRORS = [
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
  errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JWTClaimValidationFailed,
  errors.JWTExpired,
  errors.JWTInvalid,
  errors.JWKSMultipleMatchingKeys,
  errors.JWKSNoMatchingKey,
];

export function isRefusedToken(thrown: unknown): thrown is errors.JOSEError {
  return TOKEN_ERRORS.some((TokenError) => thrown instanceof TokenError);
}

// Holds only fixed codes and claim names, because a message can repeat text from the token.
export function describeRefusal(refusal: errors.JOSEError): string {
  return refusal instanceof errors.JWTClaimValidationFailed ? `${refusal.code} ${refusal.claim}` : refusal.code;
}

export function getAcceptedSignInMethods(nodeEnv: string | undefined): ReadonlySet<string> {
  return nodeEnv === DEVELOPMENT ? DEVELOPMENT_SIGN_IN_METHODS : STUDENT_SIGN_IN_METHODS;
}

function usedOnlyAcceptedMethods(amr: unknown, acceptedMethods: ReadonlySet<string>): boolean {
  return (
    Array.isArray(amr) &&
    amr.length > 0 &&
    amr.every((entry: { method?: string } | null) => acceptedMethods.has(entry?.method ?? ''))
  );
}

export interface SignedInUser {
  authUserId: string;
  email: string | null;
}

export class TokenVerifier {
  private readonly keys: JWTVerifyGetKey;
  private readonly issuer: string;

  constructor(
    supabaseUrl: string,
    private readonly acceptedSignInMethods: ReadonlySet<string>,
  ) {
    this.keys = createRemoteJWKSet(new URL(KEYS_PATH, supabaseUrl), { cacheMaxAge: SIGNING_KEYS_MAX_AGE_MS });
    this.issuer = `${supabaseUrl}${ISSUER_PATH}`;
  }

  async getSignedInUser(token: string): Promise<SignedInUser> {
    const { payload } = await jwtVerify(token, this.keys, {
      algorithms: ACCEPTED_ALGORITHMS,
      issuer: this.issuer,
      audience: SIGNED_IN_AUDIENCE,
      requiredClaims: REQUIRED_CLAIMS,
    });
    if (payload.role !== SIGNED_IN_ROLE || !isUUID(payload.sub)) {
      throw new errors.JWTInvalid('The token is not for a signed-in user.');
    }
    if (!usedOnlyAcceptedMethods(payload.amr, this.acceptedSignInMethods)) {
      throw new errors.JWTClaimValidationFailed('The token came from a sign-in method that is not accepted.', payload, 'amr');
    }
    return { authUserId: payload.sub as string, email: typeof payload.email === 'string' && payload.email ? payload.email : null };
  }
}
