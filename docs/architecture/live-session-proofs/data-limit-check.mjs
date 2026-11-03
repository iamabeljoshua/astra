import { dispose, Room, RoomEvent } from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'ws://127.0.0.1:7880';
const SIZES_BYTES = [1024, 14 * 1024, 15 * 1024, 15 * 1024 + 1, 16 * 1024, 20 * 1024, 70 * 1024];
const SETTLE_MS = 1500;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function joinRoom(identity, roomName) {
  const token = new AccessToken('devkey', 'secret', { identity, ttl: '5m' });
  token.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  const room = new Room();
  await room.connect(LIVEKIT_URL, await token.toJwt(), { autoSubscribe: true, dynacast: false });
  return room;
}

const roomName = `data-limit-${Date.now()}`;
const sender = await joinRoom('sender', roomName);
const listener = await joinRoom('listener', roomName);
const arrived = new Set();
listener.on(RoomEvent.DataReceived, (payload) => arrived.add(payload.byteLength));
await delay(SETTLE_MS);
const rows = [];
for (const bytes of SIZES_BYTES) {
  let sendError = null;
  try {
    await sender.localParticipant.publishData(new Uint8Array(bytes).fill(97), { reliable: true, topic: 'probe' });
  } catch (error) {
    sendError = String(error.message ?? error).slice(0, 120);
  }
  await delay(SETTLE_MS);
  rows.push({ bytes, arrived: arrived.has(bytes), sendError });
}
writeFileSync(join(HERE, 'results', 'data-limit.json'), `${JSON.stringify({ ranAt: new Date().toISOString(), rows }, null, 1)}\n`);
console.log(JSON.stringify(rows));
await sender.disconnect();
await listener.disconnect();
await dispose();
process.exit(0);
