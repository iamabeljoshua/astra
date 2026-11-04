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
/** Three seconds at 48 kHz with the floor over the quiet rule, which a voice with gaps never gives. */
const STEADY_NOISE_BLOCKS = 1125;

// Keeps a microphone's sound from its first moment until the transcriber can hear it, then plays it out and skips quiet until it has caught up. It reads no words and writes nothing anywhere.
export class HeldAudio {
  isHolding = true;
  queue = [];
  quietRun = 0;
  floorRms = FIRST_FLOOR_RMS;
  hasInputEnded = false;
  loudFloorRun = 0;
  isSteadyNoiseDue = false;
  wasSteadyNoiseSaid = false;

  isQuiet(samples) {
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const rms = Math.sqrt(sum / samples.length);
    this.floorRms = Math.max(LOWEST_FLOOR_RMS, Math.min(rms, this.floorRms * FLOOR_RISE_PER_BLOCK));
    this.noteFloor();
    return rms < Math.min(NEVER_QUIET_RMS, Math.max(ALWAYS_QUIET_RMS, this.floorRms * QUIET_OVER_FLOOR));
  }

  noteFloor() {
    this.loudFloorRun = this.floorRms >= NEVER_QUIET_RMS ? this.loudFloorRun + 1 : 0;
    if (this.loudFloorRun < STEADY_NOISE_BLOCKS || this.wasSteadyNoiseSaid) return;
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

  /** The capture has ended, so what is held plays out and nothing new comes in. */
  endInput() {
    this.hasInputEnded = true;
  }

  isDrained() {
    return this.hasInputEnded && this.queue.length === 0;
  }

  /** Takes one block in and writes one block out. Once the input has ended, it only writes. */
  process(input, output) {
    if (!this.hasInputEnded) this.queue.push({ samples: input.slice(), isQuiet: this.isQuiet(input) });
    if (this.isHolding || this.queue.length === 0) {
      if (this.queue.length > MOST_HELD_BLOCKS) this.queue.shift();
      output.fill(0);
      return;
    }
    let block = this.queue.shift();
    while (this.queue.length > 0 && block.isQuiet && this.quietRun >= QUIET_BLOCKS_KEPT) block = this.queue.shift();
    this.quietRun = block.isQuiet ? this.quietRun + 1 : 0;
    output.set(block.samples);
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
