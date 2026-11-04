/** Twelve seconds at 48 kHz, more than a slow job and a handshake together. */
const MOST_HELD_BLOCKS = 4500;
/** A gap this long stays in the sound, about 80 ms, so words do not run together while the line catches up. */
const QUIET_BLOCKS_KEPT = 30;
const ALWAYS_QUIET_RMS = 0.002;
/** Nothing louder counts as quiet, whatever the room's floor. Losing a soft word is worse than running late, so a loud room only catches up slower. */
const NEVER_QUIET_RMS = 0.015;
const QUIET_OVER_FLOOR = 2.5;
const FIRST_FLOOR_RMS = 0.005;
const LOWEST_FLOOR_RMS = 0.0005;
const FLOOR_RISE_PER_BLOCK = 1.002;
/** A backlog over about 100 ms is worth reading faster. Under it a line just catches up in its next pause. */
const FASTER_OVER_BLOCKS = 38;
/** Nobody hears this, only the transcriber. At 1.25 it lost no more words than at full speed, 17 against 18 of 127, and at 1.5 it lost 23. */
const FASTER_STEP = 1.25;
/** About 50 ms, long enough that a low hum reads as sound through its own zero crossings. */
const NOISE_WINDOW_BLOCKS = 19;
/** About 5 s with every window over the quiet rule. Speech has a gap of 50 ms long before that, and at 3 s with 100 ms windows it did not always. */
const STEADY_NOISE_WINDOWS = 100;

// Keeps a microphone's sound from its first moment until the transcriber can hear it, then plays it out and skips quiet until it has caught up. It reads no words and writes nothing anywhere.
export class HeldAudio {
  isHolding = true;
  queue = [];
  quietRun = 0;
  floorRms = FIRST_FLOOR_RMS;
  hasInputEnded = false;
  windowEnergy = 0;
  windowBlocks = 0;
  loudWindowRun = 0;
  reading = null;
  readOffset = 0;
  isSteadyNoiseDue = false;
  wasSteadyNoiseSaid = false;

  isQuiet(samples) {
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const rms = Math.sqrt(sum / samples.length);
    this.floorRms = Math.max(LOWEST_FLOOR_RMS, Math.min(rms, this.floorRms * FLOOR_RISE_PER_BLOCK));
    this.noteLevel(sum / samples.length);
    return rms < Math.min(NEVER_QUIET_RMS, Math.max(ALWAYS_QUIET_RMS, this.floorRms * QUIET_OVER_FLOOR));
  }

  noteLevel(energy) {
    this.windowEnergy += energy;
    this.windowBlocks += 1;
    if (this.windowBlocks < NOISE_WINDOW_BLOCKS) return;
    const windowRms = Math.sqrt(this.windowEnergy / this.windowBlocks);
    this.windowEnergy = 0;
    this.windowBlocks = 0;
    this.loudWindowRun = windowRms >= NEVER_QUIET_RMS ? this.loudWindowRun + 1 : 0;
    if (this.loudWindowRun < STEADY_NOISE_WINDOWS || this.wasSteadyNoiseSaid) return;
    this.wasSteadyNoiseSaid = true;
    this.isSteadyNoiseDue = true;
  }

  takeSteadyNoise() {
    const isDue = this.isSteadyNoiseDue;
    this.isSteadyNoiseDue = false;
    return isDue;
  }

  hold() {
    this.isHolding = true;
  }

  // Quiet ahead of the first sound holds nothing apart, so it can all go at once.
  release() {
    this.isHolding = false;
    this.quietRun = QUIET_BLOCKS_KEPT;
  }

  drop() {
    this.queue = [];
  }

  /** A hold with no sound in it has nothing to play out. */
  endInput() {
    this.hasInputEnded = true;
    if (this.queue.every((block) => block.isQuiet)) this.queue = [];
  }

  isDrained() {
    return this.hasInputEnded && this.queue.length === 0;
  }

  process(input, output) {
    if (!this.hasInputEnded) this.queue.push({ samples: input.slice(), isQuiet: this.isQuiet(input) });
    if (this.isHolding || this.queue.length === 0) {
      if (this.queue.length > MOST_HELD_BLOCKS) this.queue.shift();
      output.fill(0);
      return;
    }
    if (this.queue.length > FASTER_OVER_BLOCKS) return this.writeFaster(output);
    this.reading = null;
    output.set(this.takeBlock().samples);
  }

  takeBlock() {
    let block = this.queue.shift();
    while (this.queue.length > 0 && block.isQuiet && this.quietRun >= QUIET_BLOCKS_KEPT) block = this.queue.shift();
    this.quietRun = block.isQuiet ? this.quietRun + 1 : 0;
    return block;
  }

  // A room too loud for quiet to skip never catches up otherwise.
  writeFaster(output) {
    for (let index = 0; index < output.length; index += 1) {
      if (!this.reading || this.readOffset >= this.reading.samples.length) {
        if (this.queue.length === 0) return output.fill(0, index);
        this.readOffset = this.reading ? this.readOffset - this.reading.samples.length : 0;
        this.reading = this.takeBlock();
      }
      const { samples } = this.reading;
      const low = Math.floor(this.readOffset);
      const high = Math.min(low + 1, samples.length - 1);
      output[index] = samples[low] + (samples[high] - samples[low]) * (this.readOffset - low);
      this.readOffset += FASTER_STEP;
    }
  }
}

if (typeof registerProcessor === 'function') {
  registerProcessor(
    'held-mic',
    class extends AudioWorkletProcessor {
      held = new HeldAudio();
      isOver = false;
      wasDrainedSaid = false;

      constructor() {
        super();
        this.port.onmessage = ({ data }) => {
          if (data === 'hold') this.held.hold();
          if (data === 'release') this.held.release();
          if (data === 'endInput') this.held.endInput();
          if (data === 'close') {
            this.held.drop();
            this.isOver = true;
          }
        };
      }

      process(inputs, outputs) {
        const input = inputs[0]?.[0];
        const output = outputs[0]?.[0];
        if (output && (input || this.held.hasInputEnded)) this.held.process(input, output);
        if (this.held.takeSteadyNoise()) this.port.postMessage('steadyNoise');
        if (this.held.isDrained() && !this.wasDrainedSaid) {
          this.wasDrainedSaid = true;
          this.port.postMessage('drained');
        }
        return !this.isOver;
      }
    },
  );
}
