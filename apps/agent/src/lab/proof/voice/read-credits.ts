import { readKey } from '../../../keys.ts';

// Reads the account, not an estimate, because the count can lag a call by a while.
const response = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': readKey('ELEVENLABS_API_KEY') } });
const { character_count: used, character_limit: limit, tier } = (await response.json()) as { character_count: number; character_limit: number; tier: string };
console.log(JSON.stringify({ at: new Date().toISOString(), tier, used, limit, left: limit - used }));
