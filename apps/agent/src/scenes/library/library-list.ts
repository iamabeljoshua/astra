import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PICKS_FOLDER = resolve(import.meta.dirname, '../../../../api/src/picks');

export interface LibraryEntry {
  /** A readable name for the run's own files. The scene's id still comes from its title. */
  id: string;
  kind: 'opening' | 'deeper';
  topicId: string;
  title: string;
  subject: string;
}

interface HomeTopics {
  topics: { id: string; title: string; subject: string }[];
}

interface DeeperScenes {
  deeper: { topicId: string; titles: string[] }[];
}

const readPicksFile = <Shape>(name: string) => JSON.parse(readFileSync(resolve(PICKS_FOLDER, name), 'utf8')) as Shape;

/** Openings first, because a card is what most students open. Only these titles may make a scene every student can see. */
export function getLibraryList(): LibraryEntry[] {
  const { topics } = readPicksFile<HomeTopics>('library.json');
  const { deeper } = readPicksFile<DeeperScenes>('deeper-scenes.json');
  const subjects = new Map(topics.map(({ id, subject }) => [id, subject]));
  const openings = topics.map(({ id, title, subject }): LibraryEntry => ({ id, kind: 'opening', topicId: id, title, subject }));
  const deeperEntries = deeper.flatMap(({ topicId, titles }) => titles.map((title, index): LibraryEntry => ({ id: `${topicId}-deeper-${index + 1}`, kind: 'deeper', topicId, title, subject: subjects.get(topicId) ?? '' })));
  return [...openings, ...deeperEntries];
}
