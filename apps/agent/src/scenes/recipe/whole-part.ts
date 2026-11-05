import type { PartDefinition } from './catalogue.ts';
import type { SceneRecipe } from './recipe.ts';

const MOST_LABELS = 5;

/** Runs every motion a part has, so a part that only misbehaves while moving is caught. */
export function getWholePartRecipe(part: PartDefinition): SceneRecipe {
  const motions = Object.keys(part.motions);
  return {
    topic: part.name,
    stage: part.stage ?? 'studio',
    says: [{ m: 'first', text: 'A line that gives the part a moment to stand still before it moves.' }, { m: 'second', text: 'A line long enough to run its motions for a good while, so they go round.' }, { m: 'third', text: 'A last line, so the part settles back on the whole thing in the frame.' }],
    items: [{ id: 'main', part: part.name }],
    moves: motions.map((motion) => ({ item: 'main', motion, on: 'second' })),
    labels: part.anchors.slice(0, MOST_LABELS).map((anchor) => ({ text: anchor, at: `main.${anchor}`, show: 'first' })),
    arrows: [],
    flows: [],
    gauges: [],
    cams: [{ on: 'first', look: 'main', view: 'front', zoom: 1 }],
  };
}
