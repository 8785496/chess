import { beforeEach, describe, expect, it } from 'vitest';
import { useGame } from './game';
import { useHistory } from './history';
import { START_FEN } from '../core/game';

const scholarPgn =
  '[Event "Chess PWA"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0';

const fromFenPgn =
  '[Event "Chess PWA"]\n[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"]\n[Result "0-1"]\n\n1... e5 0-1';

function addGame(pgn: string, opts: { playerColor: 'w' | 'b'; levelId?: number }) {
  return useHistory.getState().add({
    date: '2026-09-03T00:00:00.000Z',
    pgn,
    result: '1-0',
    levelName: 'Новичок',
    levelId: opts.levelId,
    playerColor: opts.playerColor,
    plies: 7,
  });
}

describe('openFromHistory', () => {
  beforeEach(() => {
    useHistory.setState({ games: [] });
    localStorage.clear();
  });

  it('возвращает false для неизвестного id', () => {
    expect(useGame.getState().openFromHistory(12345)).toBe(false);
  });

  it('загружает партию из истории: ходы, мат, флаги архива', () => {
    const id = addGame(scholarPgn, { playerColor: 'w', levelId: 2 });
    expect(useGame.getState().openFromHistory(id)).toBe(true);

    const g = useGame.getState();
    expect(g.history).toHaveLength(7);
    expect(g.history[0]).toMatchObject({ san: 'e4', from: 'e2', to: 'e4' });
    expect(g.over.over).toBe(true);
    expect(g.over.status).toMatchObject({ kind: 'checkmate', winner: 'w' });
    expect(g.fromHistory).toBe(true);
    expect(g.historyId).toBe(id);
    expect(g.playerColor).toBe('w');
    expect(g.startFen).toBe(START_FEN);
    expect(g.lastMove).toEqual({ from: 'h5', to: 'f7' });
  });

  it('восстанавливает fenAfter для навигации по ходам', () => {
    const id = addGame(scholarPgn, { playerColor: 'w' });
    useGame.getState().openFromHistory(id);
    const g = useGame.getState();
    // После 1. e4 e5 пешка e2 ушла с начальной вертикали.
    expect(g.history[1].fenAfter).toContain('PPPP1PPP');
    expect(g.history[0].fenAfter).not.toBe('');
  });

  it('поддерживает партии с начальной позицией (FEN-заголовок)', () => {
    const id = useHistory.getState().add({
      date: '2026-09-03T00:00:00.000Z',
      pgn: fromFenPgn,
      result: '0-1',
      levelName: 'Новичок',
      playerColor: 'b',
      plies: 1,
    });
    expect(useGame.getState().openFromHistory(id)).toBe(true);
    const g = useGame.getState();
    expect(g.startFen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1');
    expect(g.history).toHaveLength(1);
    expect(g.history[0].san).toBe('e5');
    expect(g.playerColor).toBe('b');
    expect(g.orientation).toBe('black');
  });

  it('новая партия сбрасывает флаги архива', () => {
    const id = addGame(scholarPgn, { playerColor: 'w' });
    useGame.getState().openFromHistory(id);
    expect(useGame.getState().fromHistory).toBe(true);
    useGame.getState().newGame();
    const g = useGame.getState();
    expect(g.fromHistory).toBe(false);
    expect(g.historyId).toBeNull();
    expect(g.history).toHaveLength(0);
  });
});
