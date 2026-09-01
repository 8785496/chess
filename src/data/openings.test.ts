import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { OPENINGS, detectOpening, movesOf, searchOpenings } from '../features/openings/openings';

describe('датасет дебютов', () => {
  it('не меньше 100 дебютов', () => {
    expect(OPENINGS.length).toBeGreaterThanOrEqual(100);
  });

  it('все линии легальны с начальной позиции', () => {
    const errors: string[] = [];
    for (const o of OPENINGS) {
      const chess = new Chess();
      const moves = movesOf(o);
      if (moves.length < 2) errors.push(`${o.eco} ${o.name}: слишком короткая линия`);
      for (let i = 0; i < moves.length; i++) {
        try {
          chess.move(moves[i]);
        } catch {
          errors.push(`${o.eco} ${o.name}: нелегальный ход №${i + 1} «${moves[i]}» (позиция: ${chess.fen()})`);
          break;
        }
      }
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('уникальные записи', () => {
    const keys = OPENINGS.map((o) => `${o.eco}|${o.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('поиск находит по имени и ECO', () => {
    expect(searchOpenings('Сицилианская', 'ru').length).toBeGreaterThan(3);
    expect(searchOpenings('Sicilian', 'en').length).toBeGreaterThan(3);
    expect(searchOpenings('B90', 'ru')).toHaveLength(1);
    expect(searchOpenings('', 'en')).toHaveLength(OPENINGS.length);
  });

  it('detectOpening находит самое длинное совпадение', () => {
    const najdorf = movesOf(OPENINGS.find((o) => o.eco === 'B90')!);
    expect(detectOpening(najdorf)?.eco).toBe('B90');
    expect(detectOpening(['d4', 'd5'])).toBeNull();
  });
});
