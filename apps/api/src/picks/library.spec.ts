import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ARTWORK_NAMES } from '../artwork';
import { STUDENT_GOALS, STUDENT_LEVELS } from '../students/student-profile-options';
import { getPicksForStudent } from './getPicksForStudent';
import { LIBRARY } from './library';

const REPO_ROOT = join(__dirname, '../../../..');
const PICTURES_FOLDER = join(REPO_ROOT, 'apps/web/public/picks');
const CREDITS = readFileSync(join(REPO_ROOT, 'docs/credits.md'), 'utf8');

const MIN_TOPICS = 30;
const LONGEST_TITLE_ON_ONE_LINE = 34;
const REQUIRED_SUBJECTS = ['Math', 'Physics', 'Chemistry', 'Computer science'];
const MIN_CURIOSITY_SUBJECTS = 3;
const ONBOARDING_INTERESTS = ['Basketball', 'Football', 'Movies', 'Gaming', 'Music', 'Art', 'Space', 'Cars', 'Cooking', 'Fashion', 'Coding', 'History'];

const PUBLIC_DOMAIN_SOURCES = /\]\(https:\/\/(www\.metmuseum\.org|images\.nasa\.gov|commons\.wikimedia\.org)\//;
const LONG_DASHES = /[\u2013\u2014]/;

function getPictureRow(artwork: string) {
  return CREDITS.split('\n').find((line) => line.startsWith(`| \`${artwork}.jpg\` |`));
}

function getOwnDrawingNames() {
  const [, ownDrawings] = CREDITS.split('## Our own drawings');
  return [...(ownDrawings ?? '').matchAll(/`([a-z]+)`/g)].map(([, name]) => name);
}

describe('the picks library', () => {
  it('holds enough topics across the subjects the plan names', () => {
    const subjects = new Set(LIBRARY.topics.map((topic) => topic.subject));

    expect(LIBRARY.topics.length).toBeGreaterThanOrEqual(MIN_TOPICS);
    expect([...subjects]).toEqual(expect.arrayContaining(REQUIRED_SUBJECTS));
    expect(subjects.size - REQUIRED_SUBJECTS.length).toBeGreaterThanOrEqual(MIN_CURIOSITY_SUBJECTS);
  });

  it('gives every topic a unique id', () => {
    const ids = LIBRARY.topics.map((topic) => topic.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  describe.each(LIBRARY.topics)('$id', (topic) => {
    it('has a title, a subject, a length, and an opening line that asks something', () => {
      expect(topic.title.trim()).not.toBe('');
      expect(topic.title.length).toBeLessThanOrEqual(LONGEST_TITLE_ON_ONE_LINE);
      expect(topic.subject.trim()).not.toBe('');
      expect(topic.lengthMinutes).toBeGreaterThan(0);
      expect(topic.openingLine).toMatch(/\?$/);
    });

    it('uses only known levels, goals, and interests', () => {
      const interestNames = LIBRARY.interests.map((interest) => interest.name);

      expect(topic.levels.length).toBeGreaterThan(0);
      expect(STUDENT_LEVELS).toEqual(expect.arrayContaining(topic.levels));
      expect(topic.goals.length).toBeGreaterThan(0);
      expect(STUDENT_GOALS).toEqual(expect.arrayContaining(topic.goals));
      expect(interestNames).toEqual(expect.arrayContaining(topic.interests));
    });

    it('has a picture with a file and a credit, or one of our own drawings', () => {
      expect(ARTWORK_NAMES).toContain(topic.artwork);

      const hasPictureFile = existsSync(join(PICTURES_FOLDER, `${topic.artwork}.jpg`));
      if (hasPictureFile) expect(getPictureRow(topic.artwork)).toBeDefined();
      else expect(getOwnDrawingNames()).toContain(topic.artwork);
    });

    it('has no long dash in what a student reads', () => {
      expect(`${topic.title} ${topic.openingLine}`).not.toMatch(LONG_DASHES);
    });
  });

  it('credits every picture file to a public-domain source', () => {
    const pictureFiles = readdirSync(PICTURES_FOLDER);

    expect(pictureFiles.length).toBeGreaterThan(0);
    for (const file of pictureFiles) {
      const [, work, source, status] = (getPictureRow(basename(file, '.jpg')) ?? '').split(' | ');

      expect(work).toBeTruthy();
      expect(source).toMatch(PUBLIC_DOMAIN_SOURCES);
      expect(status).toMatch(/public domain|no copyright/i);
    }
  });

  it('writes down the order of every subject, naming each of its topics once', () => {
    const subjects = [...new Set(LIBRARY.topics.map((topic) => topic.subject))];

    expect(Object.keys(LIBRARY.topicOrder).sort()).toEqual([...subjects].sort());
    for (const subject of subjects) {
      const idsInSubject = LIBRARY.topics.filter((topic) => topic.subject === subject).map((topic) => topic.id);

      expect([...(LIBRARY.topicOrder[subject] ?? [])].sort()).toEqual(idsInSubject.sort());
    }
  });

  it('uses every picture file it ships', () => {
    const artworkInUse = new Set(LIBRARY.topics.map((topic) => topic.artwork as string));

    expect(readdirSync(PICTURES_FOLDER).map((file) => basename(file, '.jpg')).filter((name) => !artworkInUse.has(name))).toEqual([]);
  });

  it.each(ONBOARDING_INTERESTS)('finds a card for the onboarding choice %s at every level', (interest) => {
    for (const level of STUDENT_LEVELS) {
      const fit = { interests: [interest], level, goal: 'class' as const };
      const reasons = getPicksForStudent({ fit, history: [], continueSessionId: null }, LIBRARY).map((pick) => pick.reason);

      expect(reasons).toContain(`Because you're into ${interest.toLowerCase()}`);
    }
  });
});
