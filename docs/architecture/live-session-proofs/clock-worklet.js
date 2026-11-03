const AUDIBLE = 0.01;
const BURST = 0.2;
const SILENCE_BEFORE_ONSET_BLOCKS = 40;
const QUIET_BEFORE_BURST_BLOCKS = 20;

class ClockProbe extends AudioWorkletProcessor {
  silentBlocks = SILENCE_BEFORE_ONSET_BLOCKS;
  quietBlocks = QUIET_BEFORE_BURST_BLOCKS;
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
    if (isAudible !== this.isBlockAudible) {
      this.isBlockAudible = isAudible;
      this.port.postMessage({ kind: isAudible ? 'sound' : 'quiet', frame: currentFrame });
    }
    if (peak >= BURST) {
      if (this.quietBlocks >= QUIET_BEFORE_BURST_BLOCKS) {
        this.port.postMessage({ kind: 'burst', frame: currentFrame + channel.findIndex((sample) => Math.abs(sample) >= BURST) });
      }
      this.quietBlocks = 0;
    } else {
      this.quietBlocks += 1;
    }
    return true;
  }
}

registerProcessor('clock-probe', ClockProbe);
