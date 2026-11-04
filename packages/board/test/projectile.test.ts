import { describe, expect, it } from 'vitest';
import { createProjectileScene, type ProjectileFrame, resolveProjectileParameters } from '../src/motion/projectile-scene.ts';

const SHOT = { horizontalSpeed: 4.2, upwardSpeed: 5.6, releaseHeight: 2.2, gravity: 9.8 };

// Worked by hand: t = (5.6 + sqrt(5.6^2 + 2 * 9.8 * 2.2)) / 9.8 = (5.6 + sqrt(74.48)) / 9.8.
const WORKED = { peakSeconds: 5.6 / 9.8, peakHeight: 2.2 + (5.6 * 5.6) / (2 * 9.8), landingSeconds: 1.4520, range: 6.0985 };

const frameAt = (seconds: number, parameters = SHOT) => createProjectileScene(parameters).getFrame(seconds) as ProjectileFrame;

describe('the projectile model', () => {
  it('reaches the worked peak at the worked time', () => {
    const scene = createProjectileScene(SHOT);
    expect(scene.moments.peak).toBeCloseTo(WORKED.peakSeconds, 6);
    expect(frameAt(WORKED.peakSeconds).ball.y).toBeCloseTo(WORKED.peakHeight, 6);
    expect(frameAt(WORKED.peakSeconds).velocity.y).toBeCloseTo(0, 6);
  });

  it('lands on the ground at the worked time and range', () => {
    const scene = createProjectileScene(SHOT);
    expect(scene.moments.landing).toBeCloseTo(WORKED.landingSeconds, 3);
    expect(frameAt(scene.durationSeconds).ball.y).toBeCloseTo(0, 6);
    expect(frameAt(scene.durationSeconds).ball.x).toBeCloseTo(WORKED.range, 3);
  });

  it('lands twice as far when the sideways speed doubles, and stays in the air as long', () => {
    const doubled = { ...SHOT, horizontalSpeed: SHOT.horizontalSpeed * 2 };
    const first = createProjectileScene(SHOT);
    const second = createProjectileScene(doubled);
    expect(second.durationSeconds).toBe(first.durationSeconds);
    expect(frameAt(second.durationSeconds, doubled).ball.x).toBeCloseTo(2 * frameAt(first.durationSeconds).ball.x, 9);
  });

  it('keeps its sideways speed and flips its upward speed, as the script says', () => {
    expect(frameAt(0).velocity).toEqual({ x: 4.2, y: 5.6 });
    expect(frameAt(1).velocity.x).toBe(4.2);
    expect(frameAt(1).velocity.y).toBeCloseTo(5.6 - 9.8, 9);
    expect(frameAt(1).acceleration).toEqual({ x: 0, y: -9.8 });
  });

  it('gives the same frame for the same moment, in any order', () => {
    const scene = createProjectileScene(SHOT);
    const later = scene.getFrame(1.2);
    scene.getFrame(0.1);
    expect(scene.getFrame(1.2)).toEqual(later);
  });

  it('turns a launch angle into the two speeds, and keeps the total speed', () => {
    const speed = Math.hypot(4.2, 5.6);
    const flat = resolveProjectileParameters(SHOT, { launchAngle: 0 });
    expect(flat.horizontalSpeed).toBeCloseTo(speed, 9);
    expect(flat.upwardSpeed).toBeCloseTo(0, 9);
    const scene = createProjectileScene(resolveProjectileParameters(SHOT, { launchAngle: 45 }));
    expect(scene.values?.launchAngle).toBeCloseTo(45, 9);
    expect(scene.values?.launchSpeed).toBeCloseTo(speed, 9);
  });

  it('starts on the ground and stays on it when thrown down from no height', () => {
    const scene = createProjectileScene({ ...SHOT, releaseHeight: 0, upwardSpeed: -3 });
    expect(scene.durationSeconds).toBe(0);
    expect((scene.getFrame(5) as ProjectileFrame).ball).toEqual({ x: 0, y: 0 });
  });
});

describe('a value a flight cannot run on', () => {
  const BASE = { horizontalSpeed: 4, upwardSpeed: 6, releaseHeight: 2, gravity: 9.8 };

  it('holds gravity at its lowest allowed, so a flight always lands', () => {
    for (const gravity of [0, -5]) expect(resolveProjectileParameters(BASE, { gravity }).gravity).toBe(0.1);
  });

  it('holds every other value inside its rule', () => {
    expect(resolveProjectileParameters(BASE, { releaseHeight: -1 }).releaseHeight).toBe(0);
    expect(resolveProjectileParameters(BASE, { horizontalSpeed: 1e9 }).horizontalSpeed).toBe(100);
  });

  it('ignores a name a flight does not have', () => {
    expect(resolveProjectileParameters(BASE, { a: 5 })).toEqual(BASE);
  });
});
