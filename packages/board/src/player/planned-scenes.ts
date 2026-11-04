import { createProjectileScene, resolveProjectileParameters } from '../motion/projectile-scene.ts';
import { createPlotScene } from '../plot/plot-scene.ts';
import { guardSceneCatalog, type SceneCatalog } from './scene.ts';
import { createTakeScene } from './take-scene.ts';

export const PLANNED_SCENES: SceneCatalog = guardSceneCatalog((command, parameterChanges) => {
  if (command.kind === 'richScene') return createTakeScene(command);
  if (command.kind === 'simulate') return createProjectileScene(resolveProjectileParameters(command.simulation.parameters, parameterChanges), parameterChanges);
  if (command.kind === 'plot') return createPlotScene(command, parameterChanges);
  return null;
});
