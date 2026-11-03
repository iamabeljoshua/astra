import { describe, expect, it } from 'vitest';
import { getFirstOpenStepFrom, getNextStep, getPreviousStep, getResumeStep, getStepsFor, hasFinishedOnboarding, type Student } from './steps';

const PROFILE: NonNullable<Student['profile']> = { interests: ['Space'], level: 'high_school', goal: 'exam', voice: 'ada', firstQuestion: null };
const ADULT: Student = { id: 'student', name: 'Maya', profile: null, parentConsent: null };
const MINOR: Student = { ...ADULT, parentConsent: { status: 'not_asked', parentEmail: null } };
const WAITING_MINOR: Student = { ...ADULT, parentConsent: { status: 'waiting', parentEmail: 'parent@astra.test' } };
const APPROVED_MINOR: Student = { ...ADULT, parentConsent: { status: 'given', parentEmail: 'parent@astra.test' } };

describe('the onboarding steps', () => {
  it("runs in the prototype's order for an adult", () => {
    expect(getStepsFor(ADULT)).toEqual(['name', 'birthDate', 'into', 'level', 'goal', 'voice', 'hello']);
  });

  it('adds the parent step after the date of birth for a student under 18', () => {
    expect(getStepsFor(MINOR)).toEqual(['name', 'birthDate', 'parent', 'into', 'level', 'goal', 'voice', 'hello']);
  });

  it.each([
    ['an adult', ADULT, false],
    ['a student whose age is not known yet', null, false],
    ['a student under 18', MINOR, true],
    ['a student under 18 who is waiting', WAITING_MINOR, true],
    ['a student under 18 who has consent', APPROVED_MINOR, true],
  ])('shows the parent step only under 18: %s', (_caseName, student, expected) => {
    expect(getStepsFor(student).includes('parent')).toBe(expected);
  });

  it('moves from the date of birth to the parent for a minor, and past it for an adult', () => {
    expect(getFirstOpenStepFrom('birthDate', MINOR)).toBe('parent');
    expect(getFirstOpenStepFrom('birthDate', ADULT)).toBe('into');
  });

  it('holds a waiting minor on the parent step', () => {
    expect(getFirstOpenStepFrom('parent', WAITING_MINOR)).toBe('parent');
    expect(getNextStep('name', WAITING_MINOR)).toBe('parent');
  });

  it('moves on from the parent step once the parent accepts', () => {
    expect(getFirstOpenStepFrom('parent', APPROVED_MINOR)).toBe('into');
  });

  it('moves on from the parent step if the student turns 18 while waiting', () => {
    expect(getFirstOpenStepFrom('parent', ADULT)).toBe('into');
  });

  it('never goes back to a date of birth that has been confirmed', () => {
    expect(getPreviousStep('into', ADULT)).toBe('name');
    expect(getPreviousStep('birthDate', null)).toBe('name');
  });

  it('offers no way back from the parent step', () => {
    expect(getPreviousStep('parent', MINOR)).toBeNull();
  });

  it.each([
    ['a new account', null, 'name'],
    ['an account with a date and no name', { ...ADULT, name: null }, 'name'],
    ['a minor who has not asked', MINOR, 'parent'],
    ['a minor who is waiting', WAITING_MINOR, 'parent'],
    ['a minor whose parent accepted', APPROVED_MINOR, 'into'],
    ['an adult with no profile', ADULT, 'into'],
    ['a student with a profile and no first answer', { ...ADULT, profile: PROFILE }, 'hello'],
  ])('resumes %s at the right step', (_caseName, student, expected) => {
    expect(getResumeStep(student as Student | null)).toBe(expected);
  });

  it('finishes only with an answer to the first question', () => {
    expect(hasFinishedOnboarding(null)).toBe(false);
    expect(hasFinishedOnboarding({ ...ADULT, profile: PROFILE })).toBe(false);
    expect(hasFinishedOnboarding({ ...ADULT, profile: { ...PROFILE, firstQuestion: 'Why is the sky blue?' } })).toBe(true);
  });

  it('holds back a waiting minor who somehow has every answer', () => {
    const profile = { ...PROFILE, firstQuestion: 'Why is the sky blue?' };

    expect(hasFinishedOnboarding({ ...WAITING_MINOR, profile })).toBe(false);
    expect(getResumeStep({ ...WAITING_MINOR, profile })).toBe('parent');
    expect(hasFinishedOnboarding({ ...APPROVED_MINOR, profile })).toBe(true);
  });
});
