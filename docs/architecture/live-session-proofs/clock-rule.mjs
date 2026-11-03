const STALL_TOLERANCE_MS = 40;
const MINIMUM_RTP_ADVANCE_MS = 20;
const RTP_EDGE_MS = 30;

// After a silence the clock moves back only if the audio came late, because lost audio took its words with it.
export function createWordClock(wordStartsMs) {
  let positionZeroAtMs = null;
  let stoppedAtPositionMs = 0;
  const getPositionMs = (atMs) => (positionZeroAtMs === null ? null : atMs - positionZeroAtMs);

  return {
    getPositionMs,
    onOnset(atMs, { isAudioLost = false } = {}) {
      if (positionZeroAtMs === null) {
        positionZeroAtMs = atMs - wordStartsMs[0];
        return;
      }
      if (isAudioLost) return;
      const nextWordMs = wordStartsMs.find((startMs) => startMs >= stoppedAtPositionMs - STALL_TOLERANCE_MS);
      if (nextWordMs !== undefined && getPositionMs(atMs) > nextWordMs + STALL_TOLERANCE_MS) positionZeroAtMs = atMs - nextWordMs;
    },
    onEnd(atMs) {
      stoppedAtPositionMs = getPositionMs(atMs);
    },
  };
}

// RTP moves through a late stall because packets keep arriving, and stands still through a loss.
export function getIsAudioLost({ silenceStartMs, silenceEndMs, rtpPolls, rtpClockHz }) {
  const during = rtpPolls.filter((poll) => poll.atMs >= silenceStartMs + RTP_EDGE_MS && poll.atMs <= silenceEndMs - RTP_EDGE_MS);
  if (during.length < 2) return false;
  const advanceMs = ((during.at(-1).rtpTimestamp - during[0].rtpTimestamp) / rtpClockHz) * 1000;
  return advanceMs < MINIMUM_RTP_ADVANCE_MS;
}
