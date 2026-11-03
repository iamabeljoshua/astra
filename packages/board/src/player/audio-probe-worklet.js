const AUDIBLE = 0.01;
const SILENCE_BEFORE_ONSET_BLOCKS = 40;

// Taps the tutor's audio on the audio thread, so a first sound and a silent block are read in samples and not guessed from timers.
class AudioProbe extends AudioWorkletProcessor {
  silentBlocks = SILENCE_BEFORE_ONSET_BLOCKS;
  lastAudibleFrame = 0;
  isSounding = false;
  isBlockAudible = false;

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    let peak = 0;
    for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
    const isAudible = peak >= AUDIBLE;
    if (isAudible) {
      if (!this.isSounding && this.silentBlocks >= SILENCE_BEFORE_ONSET_BLOCKS) {
        this.port.postMessage({ kind: 'onset', frame: currentFrame + channel.findIndex((sample) => Math.abs(sample) >= AUDIBLE) });
        this.isSounding = true;
      }
      this.silentBlocks = 0;
      this.lastAudibleFrame = currentFrame + channel.length;
    } else {
      this.silentBlocks += 1;
      if (this.isSounding && this.silentBlocks >= SILENCE_BEFORE_ONSET_BLOCKS) {
        this.port.postMessage({ kind: 'end', frame: this.lastAudibleFrame });
        this.isSounding = false;
      }
    }
    // Sent after `onset`, so a cue cannot fire on the first sound before the page has handled the silence.
    if (isAudible !== this.isBlockAudible) {
      this.isBlockAudible = isAudible;
      this.port.postMessage({ kind: isAudible ? 'sound' : 'quiet', frame: currentFrame });
    }
    return true;
  }
}

registerProcessor('audio-probe', AudioProbe);
