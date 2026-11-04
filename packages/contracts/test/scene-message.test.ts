import { describe, expect, it } from 'vitest';
import { parseSceneAgentMessage } from '../src/scene-language/parse-message.ts';

describe('a load message', () => {
  const load = { type: 'loadScene', sceneId: 'scene-abc', durationSeconds: 5 };

  it('reads with no engine, as every 2D scene has always sent it', () => {
    expect(parseSceneAgentMessage(load)).toMatchObject({ value: load });
  });

  it('reads the kit', () => {
    expect(parseSceneAgentMessage({ ...load, engine: 'kit' })).toMatchObject({ value: { ...load, engine: 'kit' } });
  });

  it('refuses an engine nobody knows', () => {
    expect(parseSceneAgentMessage({ ...load, engine: 'unity' })).not.toHaveProperty('value');
  });

  it('reads the kit on a scene being held for later', () => {
    expect(parseSceneAgentMessage({ type: 'prepareScene', sceneId: 'scene-abc', engine: 'kit' })).toMatchObject({ value: { type: 'prepareScene', sceneId: 'scene-abc', engine: 'kit' } });
  });
});
