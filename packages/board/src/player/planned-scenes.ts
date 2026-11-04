import { createProjectileScene, resolveProjectileParameters } from '../motion/projectile-scene.ts';
import { createPlotScene } from '../plot/plot-scene.ts';
import { guardSceneCatalog, type SceneCatalog } from './scene.ts';
import { createTakeScene } from './take-scene.ts';

// Only a take goes through the guard, because the figures ask for flights by any number the parser accepts and a refusal there would leave them nothing to draw.
const makeTakeScene = guardSceneCatalog((command) => (command.kind === 'richScene' ? createTakeScene(command) : null));

export const PLANNED_SCENES: SceneCatalog = (command, parameterChanges) => {
  if (command.kind === 'simulate') return createProjectileScene(resolveProjectileParameters(command.simulation.parameters, parameterChanges), parameterChanges);
  if (command.kind === 'plot') return createPlotScene(command, parameterChanges);
  return makeTakeScene(command, parameterChanges);
};
