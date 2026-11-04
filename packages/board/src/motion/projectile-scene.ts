import type { ProjectileSimulation, SimulationMoment } from '@astra/contracts';
import type { Scene, SceneParameters } from '../player/scene.ts';

export interface ProjectileFrame {
  /** In metres, from the point under the release. */
  ball: { x: number; y: number };
  velocity: { x: number; y: number };
  acceleration: { x: number; y: number };
}

type ProjectileParameters = ProjectileSimulation['parameters'];

const PROJECTILE_PARTS = ['ball', 'path'] as const;
const DEGREES_PER_RADIAN = 180 / Math.PI;

function getLandingSeconds({ upwardSpeed, releaseHeight, gravity }: ProjectileParameters): number {
  return (upwardSpeed + Math.sqrt(upwardSpeed * upwardSpeed + 2 * gravity * releaseHeight)) / gravity;
}

function applyParameterChange(parameters: ProjectileParameters, [name, value]: [string, number]): ProjectileParameters {
  if (name !== 'launchAngle' && name !== 'launchSpeed') return { ...parameters, [name]: value };
  const speed = name === 'launchSpeed' ? value : Math.hypot(parameters.horizontalSpeed, parameters.upwardSpeed);
  const radians = (name === 'launchAngle' ? value : Math.atan2(parameters.upwardSpeed, parameters.horizontalSpeed) * DEGREES_PER_RADIAN) / DEGREES_PER_RADIAN;
  return { ...parameters, horizontalSpeed: speed * Math.cos(radians), upwardSpeed: speed * Math.sin(radians) };
}

/** In the order they were set, so the student sees the value they set last. An angle or a total speed changes the two speeds it stands for and leaves the other one as it was. */
export function resolveProjectileParameters(base: ProjectileParameters, changes: SceneParameters): ProjectileParameters {
  return Object.entries(changes).reduce(applyParameterChange, base);
}

function getProjectileValues(parameters: ProjectileParameters): SceneParameters {
  const { horizontalSpeed, upwardSpeed } = parameters;
  return { ...parameters, launchSpeed: Math.hypot(horizontalSpeed, upwardSpeed), launchAngle: Math.atan2(upwardSpeed, horizontalSpeed) * DEGREES_PER_RADIAN };
}

export function createProjectileScene(parameters: ProjectileParameters): Scene<ProjectileFrame> {
  const { horizontalSpeed, upwardSpeed, releaseHeight, gravity } = parameters;
  const landing = getLandingSeconds(parameters);
  const moments: Record<SimulationMoment, number> = { release: 0, peak: Math.max(upwardSpeed / gravity, 0), landing };
  return {
    parts: PROJECTILE_PARTS,
    moments,
    durationSeconds: landing,
    values: getProjectileValues(parameters),
    getFrame(seconds) {
      const time = Math.min(seconds, landing);
      return {
        ball: { x: horizontalSpeed * time, y: releaseHeight + upwardSpeed * time - (gravity * time * time) / 2 },
        velocity: { x: horizontalSpeed, y: upwardSpeed - gravity * time },
        acceleration: { x: 0, y: -gravity },
      };
    },
  };
}
