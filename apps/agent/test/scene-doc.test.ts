import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const doc = readFileSync(resolve(ROOT, 'docs/tests/scenes.md'), 'utf8');
const plan = readFileSync(resolve(ROOT, 'docs/plans/mvp.md'), 'utf8');

describe('the scene doc states what a student sees', () => {
  it('gives the page numbers for a fresh scene, not the server state', () => {
    expect(doc).not.toMatch(/26\.6 s and 29\.5 s/);
    expect(doc).toMatch(/31\.1 s and 34\.1 s/);
  });

  it('says a p95 over 8 to 10 cues is the worst cue', () => {
    expect(doc).toMatch(/8 to 10 cues/);
    expect(doc).toMatch(/worst cue/);
  });

  it('does not call the service\'s shown event the page, and names what the page measured', () => {
    expect(doc).not.toMatch(/Reached the page at 43\.4 s/);
    expect(doc).toMatch(/what the page first shows/i);
  });

  it('does not say cards open on the plain board, and says a scene saved already opens the lesson', () => {
    expect(doc).toMatch(/opens on it/);
    expect(doc).not.toMatch(/A saved scene waits/);
  });

  it('states the rule the code keeps: about 20 s after the opening, then dropped, with a last chance after the close', () => {
    expect(doc).toMatch(/about 20 s after the opening/i);
    expect(doc).toMatch(/after the close/);
  });

  it('says review is a filter and not a truth gate', () => {
    expect(doc).toMatch(/strict filter and not a truth gate/);
    expect(doc).toMatch(/Not yet checked by a person/);
  });

  it('does not claim a card title is already clean or that a page cannot put words into a lesson', () => {
    expect(doc).not.toMatch(/A card's title is already a clean topic/);
    expect(doc).not.toMatch(/a page cannot put other words into a lesson/);
  });
});

describe('the plan', () => {
  it('does not say M3.14 has not started', () => {
    const row = plan.split('\n').find((line) => line.includes('| M3.14 |'));
    expect(row).toBeDefined();
    expect(row).not.toMatch(/Not started/);
  });

  it('gives the M3.14 section a status that is not "Not started"', () => {
    const section = plan.slice(plan.indexOf('(M3.14)\n'));
    const status = section.split('\n').find((line) => line.startsWith('**Status.**'));
    expect(status).toBeDefined();
    expect(status).not.toMatch(/Not started/);
  });
});
