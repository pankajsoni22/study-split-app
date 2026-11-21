import { describe, expect, it } from 'vitest';
import { normalizeUsernameInput, usernameProblem } from './username.ts';

describe('usernameProblem', () => {
  it.each([
    ['pankaj', null],
    ['pankaj-soni', null],
    ['a1b', null],
    ['', 'empty'],
    ['ab', 'too-short'],
    ['a'.repeat(31), 'too-long'],
    ['1abc', 'start'],
    ['-abc', 'start'],
    ['ab_c', 'chars'],
    ['ab--c', 'double-hyphen'],
    ['abc-', 'end-hyphen']
  ])('%s → %s', (name, problem) => {
    expect(usernameProblem(name)).toBe(problem);
  });

  it('is case-insensitive', () => {
    expect(usernameProblem('Pankaj')).toBeNull();
  });
});

describe('normalizeUsernameInput', () => {
  it('lowercases and hyphenates', () => {
    expect(normalizeUsernameInput('Pankaj Soni_dev')).toBe('pankaj-soni-dev');
  });
  it('drops other characters and caps length', () => {
    expect(normalizeUsernameInput('héllo!@#')).toBe('hllo');
    expect(normalizeUsernameInput('x'.repeat(40))).toHaveLength(30);
  });
});
