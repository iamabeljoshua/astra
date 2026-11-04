import { getSpeedWays, type ProjectileSimulation, SIMULATION_PARAMETER_RULES, type SimulationMoment, type SimulationParameter } from '@astra/contracts';
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

const isFlightValue = (name: string): name is SimulationParameter => Object.hasOwn(SIMULATION_PARAMETER_RULES, name);

/** Only what a flight has, each inside its rule, so a landing is always a real number. */
function getAllowedChanges(changes: SceneParameters): Partial<Record<SimulationParameter, number>> {
  return Object.fromEntries(Object.entries(changes).flatMap(([name, value]) => {
    if (!isFlightValue(name)) return [];
    const { min, max } = SIMULATION_PARAMETER_RULES[name];
    return [[name, Math.min(max, Math.max(min, value))]];
  }));
}

/** Changes with any speed said the other way from `parameter` said its way instead, using the values the flight runs on now, so the flight does not change. */
export function getChangesSaidLike(parameter: string, changes: SceneParameters, values: SceneParameters = {}): SceneParameters {
  const ways = getSpeedWays(parameter);
  if (!ways?.other.some((name) => name in changes)) return changes;
  const kept = Object.entries(changes).filter(([name]) => !ways.other.includes(name));
  return Object.fromEntries([...kept, ...Object.entries(values).filter(([name]) => ways.own.includes(name))]);
}

export function resolveProjectileParameters(base: ProjectileParameters, changes: SceneParameters): ProjectileParameters {
  const { launchSpeed, launchAngle, ...plain } = getAllowedChanges(changes);
  const parameters = { ...base, ...plain };
  if (launchSpeed === undefined && launchAngle === undefined) return parameters;
  const speed = launchSpeed ?? Math.hypot(parameters.horizontalSpeed, parameters.upwardSpeed);
  const radians = launchAngle === undefined ? Math.atan2(parameters.upwardSpeed, parameters.horizontalSpeed) : launchAngle / DEGREES_PER_RADIAN;
  return { ...parameters, horizontalSpeed: speed * Math.cos(radians), upwardSpeed: speed * Math.sin(radians) };
}

function getProjectileValues(parameters: ProjectileParameters, changes: SceneParameters): SceneParameters {
  const { horizontalSpeed, upwardSpeed } = parameters;
  return { ...parameters, launchSpeed: Math.hypot(horizontalSpeed, upwardSpeed), launchAngle: Math.atan2(upwardSpeed, horizontalSpeed) * DEGREES_PER_RADIAN, ...getAllowedChanges(changes) };
}

/** `changes` are what was set, so a slider shows that exactly, and an angle set while the speed is zero still reads as set. */
export function createProjectileScene(parameters: ProjectileParameters, changes: SceneParameters = {}): Scene<ProjectileFrame> {
  const { horizontalSpeed, upwardSpeed, releaseHeight, gravity } = parameters;
  const landing = getLandingSeconds(parameters);
  const moments: Record<SimulationMoment, number> = { release: 0, peak: Math.max(upwardSpeed / gravity, 0), landing };
  return {
    parts: PROJECTILE_PARTS,
    moments,
    durationSeconds: landing,
    values: getProjectileValues(parameters, changes),
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
