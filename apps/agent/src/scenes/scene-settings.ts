import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');

export const getSceneStoreRoot = () => process.env.SCENE_STORE_DIR ?? join(REPO_ROOT, '.scene-store');

export const hasKitLive = () => process.env.ASTRA_KIT_LIVE === '1';
