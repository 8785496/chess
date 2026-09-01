import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { MASTER_GAMES, playersOf, searchGames } from './masterGames';

describe('датасет реальных партий', () => {
  it('не меньше 8 партий', () => {
    expect(MASTER_GAMES.length).toBeGreaterThanOrEqual(8);
  });

  it('все ходы легальны, объявленные маты — это маты', () => {
    const errors: string[] = [];
    for (const g of MASTER_GAMES) {
      const chess = new Chess();
      for (let i = 0; i < g.moves.length; i++) {
        try {
          chess.move(g.moves[i]);
        } catch {
          errors.push(`${g.id}: нелегальный ход №${i + 1} «${g.moves[i]}» (позиция: ${chess.fen()})`);
          break;
        }
      }
      if (g.moves[g.moves.length - 1].includes('#') && !chess.isCheckmate()) {
        errors.push(`${g.id}: последний ход «${g.moves[g.moves.length - 1]}» объявлен матом, но позиция не мат`);
      }
      if (g.moves[g.moves.length - 1].includes('+') && !chess.inCheck()) {
        errors.push(`${g.id}: последний ход «${g.moves[g.moves.length - 1]}» объявлен шахом, но шаха нет`);
      }
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('комментарии ссылаются на существующие ходы и заполнены в обеих локалях', () => {
    const errors: string[] = [];
    for (const g of MASTER_GAMES) {
      for (const intro of [g.intro.ru, g.intro.en]) {
        if (!intro.trim()) errors.push(`${g.id}: пустое описание партии`);
      }
      for (const [key, note] of Object.entries(g.comments)) {
        const idx = Number(key);
        if (!Number.isInteger(idx) || idx < 0 || idx >= g.moves.length) {
          errors.push(`${g.id}: комментарий «${key}» вне диапазона ходов (0..${g.moves.length - 1})`);
        }
        for (const text of [note.ru, note.en]) {
          if (!text.trim()) errors.push(`${g.id}: пустой комментарий «${key}»`);
        }
      }
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('уникальные id и корректные результаты', () => {
    const ids = MASTER_GAMES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of MASTER_GAMES) {
      expect(['1-0', '0-1', '1/2-1/2'], `${g.id}: результат «${g.result}»`).toContain(g.result);
      expect(g.moves.length).toBeGreaterThanOrEqual(13);
    }
  });

  it('поиск находит по игрокам, названию и году', () => {
    expect(searchGames('Морфи', 'ru')).toHaveLength(1);
    expect(searchGames('Morphy', 'en')).toHaveLength(1);
    expect(searchGames('Fischer', 'en')).toHaveLength(1);
    expect(searchGames('Каспаров', 'ru')[0].id).toBe('kasparov-immortal-1999');
    expect(searchGames('1999', 'ru')).toHaveLength(1);
    expect(searchGames('', 'en')).toHaveLength(MASTER_GAMES.length);
    expect(playersOf(MASTER_GAMES[0], 'en')).toContain('–');
  });
});
