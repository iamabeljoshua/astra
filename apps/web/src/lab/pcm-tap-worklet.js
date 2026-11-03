const POST_EVERY_BLOCKS = 64;
const KEEP_EVERY_SAMPLES = 2;

// Proof runs only. Keeps a copy of what passes this point, tagged with its frame, so a run can compare what was heard with what was sent.
class PcmTap extends AudioWorkletProcessor {
  buffer = [];
  blocks = 0;
  firstFrame = null;

  process(inputs) {
    const channel = inputs[0]?.[0];
    this.firstFrame ??= currentFrame;
    for (let index = 0; index < 128; index += KEEP_EVERY_SAMPLES) this.buffer.push(channel ? channel[index] : 0);
    this.blocks += 1;
    if (this.blocks >= POST_EVERY_BLOCKS) {
      const samples = Float32Array.from(this.buffer);
      this.port.postMessage({ firstFrame: this.firstFrame, samples }, [samples.buffer]);
      this.buffer = [];
      this.blocks = 0;
      this.firstFrame = null;
    }
    return true;
  }
}

registerProcessor('pcm-tap', PcmTap);
