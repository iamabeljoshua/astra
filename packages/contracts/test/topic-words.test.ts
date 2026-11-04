import { describe, expect, it } from 'vitest';
import { isDetailOnTheList, isTopicOnTheList } from '../src/topic-words.ts';

const SENSITIVE_WORDS = {
  health: 'sick ill illness disease cancer diabetes asthma hiv aids depression depressed anxiety anxious adhd autism autistic dyslexia suicide suicidal self harm cutting overdose pills medication medicine hospital clinic therapy therapist surgery pregnant pregnancy abortion period periods menstruation puberty disorder anorexia bulimia eating diet dieting weight obesity obese fat pain hurt hurting injury injured wound wounds bruise bruises bleeding insomnia sleep alcohol drunk drinking drugs drug smoking vaping nicotine addiction addicted trauma stress stressed mental disabled disability wheelchair seizure epilepsy allergy allergic sickle vaccine vaccines tumor',
  feelings: 'sad sadness happy unhappy angry anger lonely alone scared afraid fear frightened worried worry upset ashamed shame guilty guilt hate hopeless worthless crying cry embarrassed jealous love loved miserable grief tired exhausted feeling feelings emotion emotions depressing',
  family: 'mom mum mother mothers dad dads father fathers parent parents brother brothers sister sisters sibling siblings family families grandma grandpa grandmother grandfather uncle aunt cousin son daughter wife husband stepmom stepdad stepmother stepfather foster adopted orphan baby divorce divorced boyfriend girlfriend',
  faith: 'god gods jesus christ christian christians muslim muslims islam allah church mosque temple synagogue bible quran koran torah prayer pray praying religion religious faith hindu hinduism buddhist buddhism jewish judaism atheist catholic protestant heaven hell sin',
};

/** School biology and careers. A listed word can still be true of someone, so these are named here and nothing joins them unnoticed. */
const HEALTH_WORDS_ON_THE_LIST_ON_PURPOSE = 'blood body bodies heart lung lungs nervous virus viruses doctor doctors nurse nurses immune';

const getOnTheList = (words: string) => words.split(' ').filter((word) => isTopicOnTheList('cares_about', word));

describe('what the closed list keeps out', () => {
  it.each(Object.entries(SENSITIVE_WORDS))('holds no word naming %s, for any kind of note', (_group, words) => {
    expect(getOnTheList(words)).toEqual([]);
  });

  it('still holds the school words that can also be true of someone, and only those', () => {
    expect(getOnTheList(HEALTH_WORDS_ON_THE_LIST_ON_PURPOSE).join(' ')).toBe(HEALTH_WORDS_ON_THE_LIST_ON_PURPOSE);
  });

  it.each(['s u i c i d e', 's-u-i-c-i-d-e', 'd a d', 'h i v', 'm u m', 'g a y', 'a b u s e'])('refuses %j, spelled out a letter at a time', (spelledOut) => {
    expect(isTopicOnTheList('struggled', spelledOut)).toBe(false);
    expect(isTopicOnTheList('cares_about', spelledOut)).toBe(false);
    expect(isDetailOnTheList(spelledOut)).toBe(false);
  });

  it.each(['x and y', 'x y', 'solve for x', 'a ball on a slope', 'x and y and z', '2x and 3y', 'a squared plus b squared'])('keeps %j, because letters in math are not spelling', (topic) => {
    expect(isTopicOnTheList('showed', topic)).toBe(true);
  });

  it.each(['\u{1F642}', '???', ''])('refuses %j, which holds no word at all', (topic) => {
    expect(isTopicOnTheList('explored', topic)).toBe(false);
  });
});
