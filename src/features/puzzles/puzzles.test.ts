import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  PUZZLES,
  filterPuzzles,
  solverColorOf,
  solverMovesOf,
  type Puzzle,
} from './puzzles';
import { canForceMate } from './mate';

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Баланс «решающий − соперник» в пешках. */
function materialBalance(chess: Chess, solver: 'w' | 'b'): number {
  let total = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const sign = piece.color === solver ? 1 : -1;
      total += sign * (VALUE[piece.type] ?? 0);
    }
  }
  return total;
}

function playSolution(p: Puzzle): Chess {
  const chess = new Chess(p.fen);
  for (const san of p.solution) {
    expect(() => chess.move(san), `${p.id}: illegal move ${san}`).not.toThrow();
  }
  return chess;
}

describe('puzzle dataset', () => {
  it('все задачи имеют корректный FEN и легальную линию решения', () => {
    expect(PUZZLES.length).toBeGreaterThanOrEqual(10);
    for (const p of PUZZLES) {
      const chess = playSolution(p);
      // Линия начинается ходом решающего и чередуется.
      expect(p.solution.length, p.id).toBeGreaterThanOrEqual(1);
      expect(new Chess(p.fen).turn(), p.id).toBe(solverColorOf(p));
      // Последний ход линии — всегда ход решающего.
      expect(p.solution.length % 2, p.id).toBe(1);
      expect(chess.isGameOver() || p.kind === 'tactic', p.id).toBe(true);
    }
  });

  it('матовые задачи: линия кончается матом, мат форсирован, в начале нет более короткого мата', () => {
    for (const p of PUZZLES.filter((x) => x.kind === 'mate')) {
      const end = playSolution(p);
      expect(end.isCheckmate(), `${p.id}: линия должна кончаться матом`).toBe(true);

      const n = solverMovesOf(p);
      if (n <= 2) {
        // Полный перебор посилен: доказываем форсированность перебором.
        expect(canForceMate(new Chess(p.fen), n), `${p.id}: мат должен быть форсирован за ${n}`).toBe(true);
      } else {
        // Для n ≥ 3 перебор слишком дорог — форсированность доказывает движок
        // (puzzles.engine.test.ts). Здесь дёшево отрицаем более короткие маты.
        expect(canForceMate(new Chess(p.fen), 2), `${p.id}: не должно быть мата в 2`).toBe(false);
      }
      if (n > 1) {
        expect(canForceMate(new Chess(p.fen), 1), `${p.id}: неожиданный мат в 1`).toBe(false);
      }
    }
  });

  it('мат в 1: сохранённый ход действительно матует', () => {
    for (const p of PUZZLES.filter((x) => x.kind === 'mate' && x.solution.length === 1)) {
      const chess = new Chess(p.fen);
      const mates = chess.moves().filter((m) => {
        chess.move(m);
        const mate = chess.isCheckmate();
        chess.undo();
        return mate;
      });
      expect(mates.length, `${p.id}: мата нет`).toBeGreaterThanOrEqual(1);
      expect(mates, `${p.id}: ${p.solution[0]} не матует`).toContain(p.solution[0]);
    }
  });

  it('тактические задачи: решение выигрывает материал (от 2 пешек)', () => {
    for (const p of PUZZLES.filter((x) => x.kind === 'tactic')) {
      const solver = solverColorOf(p);
      const before = materialBalance(new Chess(p.fen), solver);
      const after = materialBalance(playSolution(p), solver);
      expect(after - before, `${p.id}: выигрыш должен быть не меньше 2 пешек`).toBeGreaterThanOrEqual(2);
    }
  });

  it('id задач уникальны', () => {
    expect(new Set(PUZZLES.map((p) => p.id)).size).toBe(PUZZLES.length);
  });

  it('фильтр по числу ходов отбирает задачи нужной длины', () => {
    expect(filterPuzzles(PUZZLES, 'all', new Set(), 1).map((p) => p.id)).toHaveLength(7);
    expect(filterPuzzles(PUZZLES, 'all', new Set(), 2).every((p) => solverMovesOf(p) === 2)).toBe(true);
    expect(filterPuzzles(PUZZLES, 'all', new Set(), 3).map((p) => p.id)).toHaveLength(3);
    expect(filterPuzzles(PUZZLES, 'all', new Set(), 4).map((p) => p.id)).toEqual(['philidor-legacy']);
    expect(filterPuzzles(PUZZLES, 'all', new Set(), 'all')).toHaveLength(PUZZLES.length);
    // Фильтры по статусу и длине применяются вместе.
    const solvedOne = filterPuzzles(PUZZLES, 'solved', new Set(['reti-mirror']), 3);
    expect(solvedOne.map((p) => p.id)).toEqual(['reti-mirror']);
  });
});

describe('canForceMate', () => {
  it('видит мат в 1 и отказывает в отсутствии мата', () => {
    expect(canForceMate(new Chess('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'), 1)).toBe(true);
    expect(canForceMate(new Chess('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'), 0)).toBe(false);
    // Из начальной позиции мата за 2 хода нет.
    expect(canForceMate(new Chess(), 2)).toBe(false);
  });

  it('ищет мат в 2 хода и отказывает там, где мата нет', () => {
    // Ладья ставит мат в 2: ожидание, затем мат на восьмой горизонтали.
    expect(canForceMate(new Chess('7k/8/6K1/8/8/8/8/7R w - - 0 1'), 2)).toBe(true);
    // Голые короли — мата не существует ни за какое число ходов.
    expect(canForceMate(new Chess('8/8/8/8/8/8/8/K6k w - - 0 1'), 3)).toBe(false);
  });
});
