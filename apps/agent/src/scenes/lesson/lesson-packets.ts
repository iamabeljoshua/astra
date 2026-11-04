import { type BrowserMessage, parseBrowserMessage, parseSceneBrowserMessage, SCENE_TOPIC, type SceneBrowserMessage } from '@astra/contracts';
import { readDataMessage } from '../../live/read-data-message.ts';

export const LIVE_TOPIC = 'astra.live';
export const LAB_TOPIC = 'astra.lab';
const LAB_TYPES = ['hello', 'interrupt', 'resume'] as const;

export type LabMessage = { type: (typeof LAB_TYPES)[number] };
export type LessonPacket = { topic: 'lab'; message: LabMessage } | { topic: 'scene'; message: SceneBrowserMessage } | { topic: 'live'; message: BrowserMessage };

function parseLabMessage(value: unknown): LabMessage | null {
  const type = typeof value === 'object' && value !== null ? (value as { type?: unknown }).type : undefined;
  return LAB_TYPES.find((known) => known === type) ? ({ type } as LabMessage) : null;
}

/** A packet comes from a browser, so anything but a good message of a known topic is dropped here. */
export function readLessonPacket(payload: Uint8Array, topic: string | undefined): LessonPacket | null {
  const read = readDataMessage(payload);
  if (!read.ok) return null;
  if (topic === LAB_TOPIC) {
    const message = parseLabMessage(read.value);
    return message && { topic: 'lab', message };
  }
  if (topic === SCENE_TOPIC) {
    const parsed = parseSceneBrowserMessage(read.value);
    return parsed.ok ? { topic: 'scene', message: parsed.value } : null;
  }
  if (topic === LIVE_TOPIC) {
    const parsed = parseBrowserMessage(read.value);
    return parsed.ok ? { topic: 'live', message: parsed.value } : null;
  }
  return null;
}
