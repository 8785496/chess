import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { computeStatus, createGame, needsPromotion, parseUciMove } from './game';

const stalemateFen = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';

describe('computeStatus', () => {
  it('детектирует мат (детский мат)', () => {
    const chess = new Chess();
    for (const san of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']) chess.move(san);
    const st = computeStatus(chess);
    expect(st.over).toBe(true);
    expect(st.status.kind).toBe('checkmate');
    expect(st.result).toBe('1-0');
  });

  it('детектирует пат', () => {
    const st = computeStatus(new Chess(stalemateFen));
    expect(st.over).toBe(true);
    expect(st.status.kind).toBe('stalemate');
    expect(st.result).toBe('1/2-1/2');
  });

  it('детектирует троекратное повторение', () => {
    const chess = new Chess();
    for (let i = 0; i < 3; i++) {
      for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) chess.move(san);
    }
    const st = computeStatus(chess);
    expect(st.over).toBe(true);
    expect(st.status).toMatchObject({ kind: 'draw', reason: 'repetition' });
  });

  it('детектирует недостаток материала', () => {
    const chess = new Chess('8/8/8/4k3/8/8/8/4K1N1 w - - 0 1');
    expect(computeStatus(chess).status).toMatchObject({ kind: 'draw', reason: 'insufficient' });
  });

  it('детектирует правило 50 ходов', () => {
    const chess = new Chess('8/5nk1/8/8/8/8/1N4K1/8 w - - 99 80');
    chess.move('Nc4');
    const st = computeStatus(chess);
    expect(st.over).toBe(true);
    expect(st.status).toMatchObject({ kind: 'draw', reason: 'fifty' });
  });
});

describe('createGame', () => {
  it('принимает начальные ходы (SAN)', () => {
    const chess = createGame(undefined, ['e4', 'e5', 'Nf3']);
    expect(chess.history()).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('чинит SAN без обязательных суффиксов и уточнений', () => {
    // Здесь Ne7 однозначно выполняет конь c6 (f6-конь на e7 не попадает).
    const kid = ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2', 'e5', 'O-O', 'Nc6', 'd5', 'Ne7'];
    const chess = createGame(undefined, kid);
    expect(chess.history().length).toBe(16);
  });

  it('бросает понятную ошибку на нелегальную линию', () => {
    expect(() => createGame(undefined, ['e4', 'e5', 'Bc5'])).toThrow(/Illegal opening move/);
  });
});

describe('needsPromotion & parseUciMove', () => {
  it('определяет превращение', () => {
    const chess = new Chess('8/P6k/8/8/8/8/8/K7 w - - 0 1');
    expect(needsPromotion(chess, 'a7', 'a8')).toBe(true);
    expect(needsPromotion(chess, 'a1', 'b1')).toBe(false);
  });

  it('разбирает UCI-ходы', () => {
    expect(parseUciMove('e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(parseUciMove('e2e4')).toEqual({ from: 'e2', to: 'e4', promotion: undefined });
  });
});
