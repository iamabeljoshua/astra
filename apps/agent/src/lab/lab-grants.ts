import type { VideoGrant } from 'livekit-server-sdk';

/** The least each side of the lab needs: the page only listens and sends data, and the agent only publishes. */
export function getLabGrant(roomName: string, side: 'page' | 'agent'): VideoGrant {
  const shared = { room: roomName, roomJoin: true, canPublishData: true };
  return side === 'page' ? { ...shared, canPublish: false, canSubscribe: true } : { ...shared, canPublish: true, canSubscribe: false };
}
