import { EgressClient, RoomServiceClient } from 'livekit-server-sdk';
import { readKey } from '../../../keys.ts';

const getClient = () => new RoomServiceClient(readKey('LIVEKIT_URL').replace(/^wss:/, 'https:'), readKey('LIVEKIT_API_KEY'), readKey('LIVEKIT_API_SECRET'));

export async function listRoomNames(): Promise<string[]> {
  return (await getClient().listRooms()).map((room) => room.name);
}

export async function listParticipantIdentities(roomName: string): Promise<string[]> {
  return (await getClient().listParticipants(roomName)).map((participant) => participant.identity.replace(/^student-.*/, 'student'));
}

/** Removes rooms this lane's proofs left behind, and nothing else. */
export async function deleteProofRooms(names: readonly string[]): Promise<void> {
  const client = getClient();
  await Promise.all(names.map((name) => client.deleteRoom(name).catch(() => {})));
}

export async function countRoomEgresses(roomName: string): Promise<number> {
  const client = new EgressClient(readKey('LIVEKIT_URL').replace(/^wss:/, 'https:'), readKey('LIVEKIT_API_KEY'), readKey('LIVEKIT_API_SECRET'));
  return (await client.listEgress({ roomName })).length;
}
