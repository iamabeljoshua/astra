import { createProjectileScene, resolveProjectileParameters } from '../motion/projectile-scene.ts';
import { createPlotScene } from '../plot/plot-scene.ts';
import { guardSceneCatalog, type SceneCatalog } from './scene.ts';
import { createTakeScene } from './take-scene.ts';

// A take comes from a model by way of a store, so a bad one costs that scene and leaves its element still.
const getTakeScene = guardSceneCatalog((command) => (command.kind === 'richScene' ? createTakeScene(command) : null));

export const PLANNED_SCENES: SceneCatalog = (command, parameterChanges) => {
  if (command.kind === 'richScene') return getTakeScene(command, parameterChanges);
  if (command.kind === 'simulate') return createProjectileScene(resolveProjectileParameters(command.simulation.parameters, parameterChanges), parameterChanges);
  if (command.kind === 'plot') return createPlotScene(command, parameterChanges);
  return null;
};
