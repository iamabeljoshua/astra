const STALL_TOLERANCE_MS = 40;
const MINIMUM_RTP_ADVANCE_MS = 20;
const RTP_EDGE_MS = 30;
const PACKET_MS = 20;

// After a silence the count moves back to the next word, unless the silence is judged to be lost audio.
export function createGuessingClock(wordStartsMs) {
  let firstSoundAtMs = null;
  let positionZeroAtMs = null;
  let stoppedAtPositionMs = 0;
  const getPositionMs = (atMs) => (positionZeroAtMs === null ? null : atMs - positionZeroAtMs);
  return {
    getPositionMs,
    onOnset(atMs, { isAudioLost = false } = {}) {
      if (firstSoundAtMs === null) {
        firstSoundAtMs = atMs;
        positionZeroAtMs = atMs;
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

export function getIsLostByRtp({ silenceStartMs, silenceEndMs, rtpPolls, rtpClockHz }) {
  const during = rtpPolls.filter((poll) => poll.atMs >= silenceStartMs + RTP_EDGE_MS && poll.atMs <= silenceEndMs - RTP_EDGE_MS);
  if (during.length < 2) return false;
  const advanceMs = ((during.at(-1).rtpTimestamp - during[0].rtpTimestamp) / rtpClockHz) * 1000;
  return advanceMs < MINIMUM_RTP_ADVANCE_MS;
}

export function getIsLostBySequence({ packetsLostDuringSilence, silenceMs }) {
  return packetsLostDuringSilence * PACKET_MS >= silenceMs / 2;
}
