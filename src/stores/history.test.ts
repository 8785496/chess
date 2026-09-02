import { beforeEach, describe, expect, it } from 'vitest';
import { useHistory, type ReviewSummary } from './history';

const summary: ReviewSummary = {
  accuracy: 82,
  counts: { best: 5, excellent: 2, good: 3, inaccuracy: 1, mistake: 1, blunder: 2 },
  analyzedAt: '2026-09-03T00:00:00.000Z',
  depth: 'fast',
};

describe('useHistory', () => {
  beforeEach(() => {
    useHistory.setState({ games: [] });
    localStorage.clear();
  });

  it('add возвращает id и ставит партию в начало списка', () => {
    const id = useHistory.getState().add({
      date: '2026-09-03T00:00:00.000Z',
      pgn: '[Result "1-0"]',
      result: '1-0',
      levelName: 'Новичок',
      playerColor: 'w',
      plies: 7,
    });
    expect(id).toBeTypeOf('number');
    expect(useHistory.getState().games[0].id).toBe(id);
  });

  it('setReview сохраняет итоги разбора у нужной партии', () => {
    const a = useHistory.getState().add({
      date: '2026-09-03T00:00:00.000Z',
      pgn: '*',
      result: '1-0',
      levelName: 'Новичок',
      playerColor: 'w',
      plies: 10,
    });
    const b = useHistory.getState().add({
      date: '2026-09-03T01:00:00.000Z',
      pgn: '*',
      result: '0-1',
      levelName: 'Любитель',
      playerColor: 'b',
      plies: 20,
    });
    useHistory.getState().setReview(a, summary);
    const games = useHistory.getState().games;
    expect(games.find((g) => g.id === a)?.review).toEqual(summary);
    expect(games.find((g) => g.id === b)?.review).toBeUndefined();
  });
});
