import type { ProjectileSimulation, SimulationMoment } from '@astra/contracts';
import { guardSceneCatalog, type Scene, type SceneCatalog, type SceneParameters } from './scene.ts';
import { createTakeScene } from './take-scene.ts';

export interface ProjectileFrame {
  /** In metres, from the point under the release. */
  ball: { x: number; y: number };
  velocity: { x: number; y: number };
}

const PROJECTILE_PARTS = ['ball', 'path'] as const;

function getLandingSeconds(upwardSpeed: number, releaseHeight: number, gravity: number): number {
  return (upwardSpeed + Math.sqrt(upwardSpeed * upwardSpeed + 2 * gravity * releaseHeight)) / gravity;
}

export function createProjectileScene(parameters: ProjectileSimulation['parameters']): Scene<ProjectileFrame> {
  const { horizontalSpeed, upwardSpeed, releaseHeight, gravity } = parameters;
  const landing = getLandingSeconds(upwardSpeed, releaseHeight, gravity);
  const moments: Record<SimulationMoment, number> = { release: 0, peak: Math.max(upwardSpeed / gravity, 0), landing };
  return {
    parts: PROJECTILE_PARTS,
    moments,
    durationSeconds: landing,
    getFrame(seconds) {
      const time = Math.min(seconds, landing);
      return {
        ball: { x: horizontalSpeed * time, y: releaseHeight + upwardSpeed * time - (gravity * time * time) / 2 },
        velocity: { x: horizontalSpeed, y: upwardSpeed - gravity * time },
      };
    },
  };
}

export const PLANNED_SCENES: SceneCatalog = guardSceneCatalog((command, parameterChanges: SceneParameters) => {
  if (command.kind === 'richScene') return createTakeScene(command);
  if (command.kind !== 'simulate') return null;
  return createProjectileScene({ ...command.simulation.parameters, ...parameterChanges });
});
