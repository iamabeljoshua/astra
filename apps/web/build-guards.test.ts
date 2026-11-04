import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findProofHookInFolder, findProofHookText } from './build-guards';

describe('the check for proof hooks in a build', () => {
  it.each(['window.sceneLesson=e', 'window.sceneStage=null', 'window.holdLessonFrame=t', 'n.sceneLesson=e', 'localStorage.getItem("astra.lesson.record")'])('finds %s', (text) => {
    expect(findProofHookText(text)).toBeDefined();
  });

  it('passes a chunk with none, including a scene stage only by its own name', () => {
    expect(findProofHookText('const e=createSceneStage(t);function loadScene(){}')).toBeUndefined();
  });

  it('looks in every file a build emits, so a chunk the flag leaves unused cannot hold one', () => {
    const folder = mkdtempSync(join(tmpdir(), 'build-'));
    writeFileSync(join(folder, 'index.js'), 'const clean = 1;');
    writeFileSync(join(folder, 'LessonSession-abc.js'), 'window.holdLessonFrame=e=>{}');
    expect(findProofHookInFolder(folder)).toBe('LessonSession-abc.js');
  });
});
