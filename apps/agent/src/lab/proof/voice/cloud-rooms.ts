import { EgressClient, RoomServiceClient } from 'livekit-server-sdk';
import { readKey } from '../../../keys.ts';

const getClient = () => new RoomServiceClient(readKey('LIVEKIT_URL').replace(/^wss:/, 'https:'), readKey('LIVEKIT_API_KEY'), readKey('LIVEKIT_API_SECRET'));

export async function listRoomNames(): Promise<string[]> {
  return (await getClient().listRooms()).map((room) => room.name);
}

/** A session's rooms all start with its prefix, and each gets a new name. */
export const hasRoom = async (roomPrefix: string) => (await listRoomNames()).some((name) => name.startsWith(roomPrefix));

async function listParticipants(roomPrefix: string) {
  const names = (await listRoomNames()).filter((name) => name.startsWith(roomPrefix));
  return (await Promise.all(names.map((name) => getClient().listParticipants(name)))).flat();
}

export async function listParticipantIdentities(roomPrefix: string): Promise<string[]> {
  return (await listParticipants(roomPrefix)).map((participant) => participant.identity.replace(/^student-.*/, 'student'));
}

/** Where LiveKit placed each person in a room. A stop's delivery moved by about 100 ms between rooms that split across regions, so a measured stop is only comparable beside this. */
export async function listParticipantRegions(roomName: string): Promise<{ who: string; region: string }[]> {
  return (await listParticipants(roomName)).map((participant) => ({ who: participant.identity.replace(/^student-.*/, 'student'), region: participant.region }));
}

/** Removes rooms this lane's proofs left behind, and nothing else. */
export async function deleteProofRooms(prefixes: readonly string[]): Promise<void> {
  const client = getClient();
  const names = (await listRoomNames()).filter((name) => prefixes.some((prefix) => name.startsWith(prefix)));
  await Promise.all(names.map((name) => client.deleteRoom(name).catch(() => {})));
}

export async function countRoomEgresses(roomName: string): Promise<number> {
  const client = new EgressClient(readKey('LIVEKIT_URL').replace(/^wss:/, 'https:'), readKey('LIVEKIT_API_KEY'), readKey('LIVEKIT_API_SECRET'));
  return (await client.listEgress({ roomName })).length;
}
