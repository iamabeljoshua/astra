import { describe, expect, it } from 'vitest';
import { getFirstOpenStepFrom, getNextStep, getPreviousStep, getResumeStep, getSteps, hasFinishedOnboarding, showsChangeLaterNote, type Student } from './steps';

const PROFILE: NonNullable<Student['profile']> = { interests: ['space'], level: 'high_school', goal: 'exam' };
const STUDENT: Student = { id: 'student', name: 'Maya', profile: null };

describe('the onboarding steps', () => {
  it('runs name, date of birth, level, interests, goal, and stops there', () => {
    expect(getSteps()).toEqual(['name', 'birthDate', 'level', 'interests', 'goal']);
    expect(getNextStep('goal', STUDENT)).toBeNull();
  });

  it('moves past the date of birth once it is confirmed', () => {
    expect(getFirstOpenStepFrom('birthDate', null)).toBe('birthDate');
    expect(getFirstOpenStepFrom('birthDate', STUDENT)).toBe('level');
  });

  it('never goes back to a date of birth that has been confirmed', () => {
    expect(getPreviousStep('level', STUDENT)).toBe('name');
    expect(getPreviousStep('birthDate', null)).toBe('name');
    expect(getPreviousStep('name', STUDENT)).toBeNull();
  });

  it.each([
    ['a new account', null, 'name'],
    ['an account with a date and no name', { ...STUDENT, name: null }, 'name'],
    ['a student with a name and no profile', STUDENT, 'level'],
  ])('resumes %s at the right step', (_caseName, student, expected) => {
    expect(getResumeStep(student)).toBe(expected);
  });

  it('finishes once there is a profile, so an existing student is not sent back', () => {
    expect(hasFinishedOnboarding(null)).toBe(false);
    expect(hasFinishedOnboarding(STUDENT)).toBe(false);
    expect(hasFinishedOnboarding({ ...STUDENT, profile: PROFILE })).toBe(true);
    expect(hasFinishedOnboarding({ ...STUDENT, name: null, profile: PROFILE })).toBe(true);
  });

  it('promises a later change on every step but the date of birth', () => {
    expect(getSteps().filter((step) => !showsChangeLaterNote(step))).toEqual(['birthDate']);
  });
});
