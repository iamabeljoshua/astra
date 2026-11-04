import { SCENE_TOPIC } from '@astra/contracts';
import { Room, RoomEvent } from '@livekit/rtc-node';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { getSceneStoreRoot } from '../scene-settings.ts';
import { createSceneStore, getSceneKey } from '../scene-store.ts';
import { getLibraryList } from './library-list.ts';

const WAIT_FOR_SCENE_MS = 30_000;

const { values: args } = parseArgs({ options: { service: { type: 'string' }, count: { type: 'string', default: '5' } } });
if (!args.service) throw new Error('Name --service, the address of a running lesson service');
const { service } = args;

// Stands in for a page: it joins the room as a new student, says it can play, and clocks the moment the tutor sends the take to load.
async function openCard(title: string, cardLine: string): Promise<{ title: string; loadMs: number | null; sceneId: string | null }> {
  const startedAt = performance.now();
  const sessionId = randomUUID();
  const reply = await fetch(`${service}/lessons`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, studentId: `proof-${randomUUID()}`, request: title, isCard: true, cardLine }) });
  if (!reply.ok) throw new Error(`the lesson service answered ${reply.status}`);
  const { url, token } = (await reply.json()) as { url: string; token: string };
  const room = new Room();
  const load = new Promise<{ loadMs: number; sceneId: string } | null>((resolve) => {
    setTimeout(() => resolve(null), WAIT_FOR_SCENE_MS);
    room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
      if (topic !== SCENE_TOPIC) return;
      const message = JSON.parse(new TextDecoder().decode(payload)) as { type: string; sceneId?: string };
      if (message.type === 'loadScene' && message.sceneId) resolve({ loadMs: performance.now() - startedAt, sceneId: message.sceneId });
    });
  });
  await room.connect(url, token, { autoSubscribe: false, dynacast: false });
  await room.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({ type: 'sceneDevice', canPlay: true })), { reliable: true, topic: SCENE_TOPIC });
  const loaded = await load;
  await room.disconnect();
  return { title, loadMs: loaded ? Math.round(loaded.loadMs) : null, sceneId: loaded?.sceneId ?? null };
}

const store = createSceneStore(getSceneStoreRoot());
const home = getLibraryList().filter(({ kind, title }) => kind === 'opening' && store.find(getSceneKey(title)) !== null);
for (const { title } of home.slice(0, Number(args.count))) console.log(JSON.stringify(await openCard(title, 'What do you already know about this one?')));
process.exit(0);
