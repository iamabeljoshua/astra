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

// Anything else, such as the key server failing, says nothing about the token, so it answers 503 and not 401.
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

export function isRefusedToken(thrown: unknown): boolean {
  return TOKEN_ERRORS.some((TokenError) => thrown instanceof TokenError);
}

export class TokenVerifier {
  private readonly keys: JWTVerifyGetKey;
  private readonly issuer: string;

  constructor(supabaseUrl: string) {
    this.keys = createRemoteJWKSet(new URL(KEYS_PATH, supabaseUrl));
    this.issuer = `${supabaseUrl}${ISSUER_PATH}`;
  }

  async getAuthUserId(token: string): Promise<string> {
    const { payload } = await jwtVerify(token, this.keys, {
      algorithms: ACCEPTED_ALGORITHMS,
      issuer: this.issuer,
      audience: SIGNED_IN_AUDIENCE,
      requiredClaims: REQUIRED_CLAIMS,
    });
    if (payload.role !== SIGNED_IN_ROLE || !isUUID(payload.sub)) {
      throw new errors.JWTInvalid('The token is not for a signed-in user.');
    }
    return payload.sub as string;
  }
}
