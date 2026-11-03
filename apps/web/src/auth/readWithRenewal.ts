import { ApiError } from '../api/apiError';
import { forgetSession, renewSession } from './session';

const TOKEN_REFUSED_STATUS = 401;

type AskApi<Answer> = () => Promise<Answer>;

function isTokenRefusal(thrown: unknown) {
  return thrown instanceof ApiError && thrown.status === TOKEN_REFUSED_STATUS;
}

// Each function is a state of one read and each call a transition. No path leads back, so a read renews at most once and its state ends with its answer.
export async function readWithRenewal<Answer>(askApi: AskApi<Answer>): Promise<Answer> {
  try {
    return await askApi();
  } catch (thrown) {
    if (!isTokenRefusal(thrown)) throw thrown;
    return renewing(askApi);
  }
}

async function renewing<Answer>(askApi: AskApi<Answer>): Promise<Answer> {
  const renewal = await renewSession();
  if (renewal === 'renewed') return askingWithNewToken(askApi);
  if (renewal === 'unreachable') throw new ApiError({ kind: 'authUnreachable' });
  forgetSession();
  throw new ApiError({ kind: 'rejected', status: TOKEN_REFUSED_STATUS });
}

// Auth has just confirmed the session, so a refusal now is a fault on the API side, and only Auth can end a session.
async function askingWithNewToken<Answer>(askApi: AskApi<Answer>): Promise<Answer> {
  try {
    return await askApi();
  } catch (thrown) {
    throw isTokenRefusal(thrown) ? new ApiError({ kind: 'tokenRefusedAfterRenewal', status: TOKEN_REFUSED_STATUS }) : thrown;
  }
}
