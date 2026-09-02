import { describe, expect, it } from 'vitest';
import { classifyMove, clampScore, mateToCp, tallyReview, type ReviewItem } from './classification';

function item(ply: number, cls: ReviewItem['cls'], lossCp = 0): ReviewItem {
  return { ply, san: 'e4', lossCp, cls, evalBefore: 0, evalAfter: 0, best: '' };
}

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

describe('tallyReview', () => {
  it('считает классы и точность', () => {
    const tally = tallyReview([
      item(1, 'best', 0),
      item(2, 'blunder', 400),
      item(3, 'good', 40),
      item(4, 'inaccuracy', 90),
    ]);
    expect(tally.counts).toEqual({
      best: 1, excellent: 0, good: 1, inaccuracy: 1, mistake: 0, blunder: 1,
    });
    expect(tally.n).toBe(4);
    // потери: 0, 100 (кламп 400/6=66.7→66.7? нет: min(100, 66.7)=66.7), 6.7, 15 → средняя 22.1 → 78%
    expect(tally.accuracy).toBe(78);
  });

  it('keep отбирает ходы игрока', () => {
    const tally = tallyReview([item(1, 'best'), item(2, 'blunder', 400)], (i) => i.ply % 2 === 1);
    expect(tally.n).toBe(1);
    expect(tally.counts.best).toBe(1);
    expect(tally.counts.blunder).toBe(0);
    expect(tally.accuracy).toBe(100);
  });

  it('пустой набор — точность 0', () => {
    expect(tallyReview([]).accuracy).toBe(0);
  });
});
