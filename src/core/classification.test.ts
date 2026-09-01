import { describe, expect, it } from 'vitest';
import { classifyMove, clampScore, mateToCp } from './classification';

describe('classifyMove', () => {
  it('лучший ход — по флагу движка', () => {
    expect(classifyMove(0, true)).toBe('best');
    expect(classifyMove(300, true)).toBe('best');
  });

  it('пороги потери оценки', () => {
    expect(classifyMove(0, false)).toBe('excellent');
    expect(classifyMove(15, false)).toBe('excellent');
    expect(classifyMove(16, false)).toBe('good');
    expect(classifyMove(50, false)).toBe('good');
    expect(classifyMove(80, false)).toBe('inaccuracy');
    expect(classifyMove(150, false)).toBe('mistake');
    expect(classifyMove(400, false)).toBe('blunder');
  });
});

describe('score utils', () => {
  it('клампит оценку', () => {
    expect(clampScore(5000)).toBe(1000);
    expect(clampScore(-9999)).toBe(-1000);
    expect(clampScore(42)).toBe(42);
  });

  it('мат в сантипешки', () => {
    expect(mateToCp(1)).toBeGreaterThan(500);
    expect(mateToCp(-2)).toBeLessThan(-500);
    expect(mateToCp(50)).toBeGreaterThan(0);
  });
});
