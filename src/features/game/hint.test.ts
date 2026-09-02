import { describe, expect, it } from 'vitest';
import { START_FEN } from '../../core/game';
import {
  buildHintData,
  formatSanLine,
  pvToSan,
  winPercent,
  type HintData,
} from './hint';
import type { AnalysisResult } from '../../engine/manager';

function analysis(partial: Partial<AnalysisResult>): AnalysisResult {
  return { best: null, cp: 0, mate: null, lines: [], ...partial };
}

describe('winPercent', () => {
  it('равный перевод — 50%, крайние значения ограничены', () => {
    expect(winPercent(0)).toBe(50);
    expect(winPercent(500)).toBeGreaterThan(85);
    expect(winPercent(-500)).toBeLessThan(15);
    expect(winPercent(10000)).toBeLessThanOrEqual(100);
    expect(winPercent(-10000)).toBeGreaterThanOrEqual(0);
  });
});

describe('pvToSan', () => {
  it('переводит uci-pv в SAN', () => {
    expect(pvToSan(START_FEN, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('обрезает некорректный хвост', () => {
    expect(pvToSan(START_FEN, ['e2e4', 'e7e5', 'e5e6'])).toEqual(['e4', 'e5']);
  });
});

describe('formatSanLine', () => {
  it('нумерует ходы белых', () => {
    expect(formatSanLine(START_FEN, ['e4', 'e5', 'Nf3'])).toBe('1.e4 e5 2.Nf3');
  });

  it('начинает с хода чёрных', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(formatSanLine(fen, ['e5', 'Nf3'])).toBe('1...e5 2.Nf3');
  });
});

describe('buildHintData', () => {
  const fenBlack = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

  it('строит линии с оценками, вероятностями и дебютом', () => {
    const data = buildHintData({
      fen: fenBlack,
      sanHistory: ['e4'],
      analysis: analysis({
        best: 'g8f6',
        cp: -28,
        lines: [
          { depth: 12, multipv: 1, uci: 'g8f6', cp: -28, pv: ['g8f6', 'b1c3', 'e7e6'] },
          { depth: 12, multipv: 2, uci: 'e7e5', cp: -30, pv: ['e7e5', 'g1f3'] },
          { depth: 12, multipv: 3, uci: 'c7c5', cp: -35, pv: ['c7c5'] },
        ],
      }),
    })!;
    expect(data).not.toBeNull();
    expect(data.san).toBe('Nf6');
    // Оценка чёрных −28 → от лица белых +0.3.
    expect(data.evalText).toBe('+0.3');
    expect(data.winPct).toBeGreaterThan(50);
    expect(data.lines).toHaveLength(3);
    expect(data.lines[0].continuation).toContain('2.Nc3');
    // UCI-ходы линии соответствуют SAN — по ним строится проигрывание.
    expect(data.lines[0].uciMoves).toEqual(['g8f6', 'b1c3', 'e7e6']);
    expect(data.fen).toBe(fenBlack);
    expect(data.lines[0].sharePct).toBeGreaterThanOrEqual(data.lines[1].sharePct);
    expect(data.lines.reduce((sum, l) => sum + l.sharePct, 0)).toBe(100);
    // После одного хода в библиотеке ещё нет совпадений.
    expect(data.opening).toBeNull();
  });

  it('определяет дебют по сыгранным ходам', () => {
    const data = buildHintData({
      fen: START_FEN,
      sanHistory: ['g4', 'd5', 'Bg2', 'c6'],
      analysis: analysis({
        best: 'e2e4',
        cp: 30,
        lines: [{ depth: 10, multipv: 1, uci: 'e2e4', cp: 30, pv: ['e2e4'] }],
      }),
    })!;
    expect(data.opening?.nameEn).toBe("Grob's Attack");
  });

  it('показывает мат в evalText и причине', () => {
    const data = buildHintData({
      fen: '6k1/8/8/8/8/8/8/4K2R w - - 0 1',
      sanHistory: [],
      analysis: analysis({
        best: 'h1h8',
        cp: 0,
        mate: 1,
        lines: [{ depth: 10, multipv: 1, uci: 'h1h8', mate: 1, pv: ['h1h8'] }],
      }),
    })!;
    expect(data.evalText).toBe('#1');
    expect(data.mateIn).toBe(1);
    expect(data.winPct).toBe(100);
    expect(data.reasons[0].key).toBe('reasonMateIn');
  });

  it('возвращает null без линий', () => {
    expect(buildHintData({ fen: START_FEN, sanHistory: [], analysis: analysis({}) })).toBeNull();
  });

  it('объясняет взятие', () => {
    const data = buildHintData({
      fen: 'k7/8/8/3p4/4P3/8/8/K7 w - - 0 1',
      sanHistory: [],
      analysis: analysis({
        best: 'e4d5',
        cp: 300,
        lines: [{ depth: 10, multipv: 1, uci: 'e4d5', cp: 300, pv: ['e4d5'] }],
      }),
    })!;
    const capture = data.reasons.find((r) => r.key === 'reasonCapture');
    expect(capture?.params).toMatchObject({ piece: '♟', square: 'd5' });
  });

  it('объясняет вилку конём', () => {
    const data = buildHintData({
      fen: 'k7/2r5/3q4/8/8/2N5/8/K7 w - - 0 1',
      sanHistory: [],
      analysis: analysis({
        best: 'c3b5',
        cp: 50,
        lines: [{ depth: 10, multipv: 1, uci: 'c3b5', cp: 50, pv: ['c3b5'] }],
      }),
    })!;
    const fork = data.reasons.find((r) => r.key === 'reasonFork');
    expect(fork?.params).toMatchObject({ piece1: '♛', piece2: '♜' });
  });

  it('объясняет защиту фигуры под ударом', () => {
    const data = buildHintData({
      fen: 'k7/3r4/8/8/8/8/3Q4/K6R w - - 0 1',
      sanHistory: [],
      analysis: analysis({
        best: 'h1d1',
        cp: 100,
        lines: [{ depth: 10, multipv: 1, uci: 'h1d1', cp: 100, pv: ['h1d1'] }],
      }),
    })!;
    const defend = data.reasons.find((r) => r.key === 'reasonDefend');
    expect(defend?.params).toMatchObject({ piece: '♛', square: 'd2' });
  });

  it('находит угрозу взятия после нашего хода', () => {
    const data = buildHintData({
      fen: '3r2k1/8/8/8/8/8/3Q4/6K1 w - - 0 1',
      sanHistory: [],
      analysis: analysis({
        best: 'd2d7',
        cp: 0,
        lines: [{ depth: 10, multipv: 1, uci: 'd2d7', cp: 0, pv: ['d2d7'] }],
      }),
    })!;
    const threat = data.threats.find((r) => r.key === 'threatCapture');
    expect(threat?.params).toMatchObject({ piece: '♛', square: 'd7' });
  });

  it('находит мат в 1 от противника', () => {
    const data = buildHintData({
      fen: '4r1k1/R4ppp/8/8/8/8/5PPP/6K1 w - - 0 1',
      sanHistory: [],
      analysis: analysis({
        best: 'a7a6',
        cp: 10,
        lines: [{ depth: 10, multipv: 1, uci: 'a7a6', cp: 10, pv: ['a7a6'] }],
      }),
    })!;
    expect(data.threats[0].key).toBe('threatMate1');
  });
});

describe('HintData совместимость', () => {
  it('главная линия первая в списке', () => {
    const data: HintData | null = buildHintData({
      fen: START_FEN,
      sanHistory: [],
      analysis: analysis({
        best: 'e2e4',
        cp: 30,
        lines: [
          { depth: 10, multipv: 1, uci: 'e2e4', cp: 30, pv: ['e2e4', 'e7e5'] },
          { depth: 10, multipv: 2, uci: 'g1f3', cp: 25, pv: ['g1f3'] },
        ],
      }),
    });
    expect(data?.lines[0].san).toBe('e4');
    expect(data?.from).toBe('e2');
  });
});
