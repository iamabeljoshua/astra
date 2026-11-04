import { createProjectileScene, resolveProjectileParameters } from '../motion/projectile-scene.ts';
import { createPlotScene } from '../plot/plot-scene.ts';
import type { SceneCatalog } from './scene.ts';

export const PLANNED_SCENES: SceneCatalog = (command, parameterChanges) => {
  if (command.kind === 'simulate') return createProjectileScene(resolveProjectileParameters(command.simulation.parameters, parameterChanges));
  if (command.kind === 'plot') return createPlotScene(command, parameterChanges);
  return null;
};
