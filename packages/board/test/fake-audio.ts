import type { AgentMessage, BeatId, BrowserMessage, ElementId, SceneCommand, TurnId } from '@astra/contracts';
import { createSampleClock, type SampleClock } from '../src/player/audio-clock.ts';
import { createScenePlayer, type FiredCue, type OutputLevel, type ScenePlayer } from '../src/player/scene-player.ts';
import type { SceneCatalog } from '../src/player/scene.ts';

export const turnId = (id: string) => id as TurnId;
export const beatId = (id: string) => id as BeatId;
export const elementId = (id: string) => id as ElementId;

export interface FakeAudio {
  clock: SampleClock;
  player: ScenePlayer;
  sent: BrowserMessage[];
  fired: FiredCue[];
  levels: OutputLevel[];
  getNowMs(): number;
  advance(ms: number): void;
  /** Time passes with no tick, as under a busy main thread. */
  skip(ms: number): void;
  sound(): void;
  quiet(): void;
  startSound(): void;
  endSound(): void;
  receive(...messages: AgentMessage[]): void;
}

const TICK_MS = 4;

// Drives the real sample clock and player with a pretend audio thread, so a test controls when each sound happens.
export function createFakeAudio({ catalog, outputLatencyMs = 0 }: { catalog?: SceneCatalog; outputLatencyMs?: number } = {}): FakeAudio {
  let nowMs = 1000;
  const sent: BrowserMessage[] = [];
  const fired: FiredCue[] = [];
  const levels: OutputLevel[] = [];
  const clock = createSampleClock({ getGraphTimeMs: () => nowMs, getOutputLatencyMs: () => outputLatencyMs });
  const player = createScenePlayer({
    clock,
    catalog,
    send: (message) => sent.push(message),
    setOutputLevel: (level) => levels.push(level),
    onCueFired: (cue) => fired.push(cue),
  });
  return {
    clock,
    player,
    sent,
    fired,
    levels,
    getNowMs: () => nowMs,
    advance(ms) {
      for (let elapsed = 0; elapsed < ms; elapsed += TICK_MS) {
        nowMs += Math.min(TICK_MS, ms - elapsed);
        player.tick();
      }
    },
    skip(ms) {
      nowMs += ms;
    },
    sound: () => clock.onProbeEvent({ kind: 'sound', atMs: nowMs }),
    quiet: () => clock.onProbeEvent({ kind: 'quiet', atMs: nowMs }),
    startSound() {
      clock.onProbeEvent({ kind: 'onset', atMs: nowMs });
      clock.onProbeEvent({ kind: 'sound', atMs: nowMs });
    },
    endSound() {
      clock.onProbeEvent({ kind: 'quiet', atMs: nowMs });
      clock.onProbeEvent({ kind: 'end', atMs: nowMs });
    },
    receive: (...messages) => messages.forEach((message) => player.receive(message)),
  };
}

export const THREE_WORDS = [
  { text: 'Watch', startMs: 0 },
  { text: 'the', startMs: 300 },
  { text: 'ball', startMs: 500 },
];

export const textCommand = (id: string): SceneCommand => ({ kind: 'text', id: elementId(id), text: id });
