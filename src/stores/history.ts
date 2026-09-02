import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MoveClass } from '../core/classification';

/** Итоги разбора партии движком (по ходам игрока). */
export interface ReviewSummary {
  accuracy: number; // 0..100
  counts: Record<MoveClass, number>;
  analyzedAt: string; // ISO
  depth: 'fast' | 'deep';
}

export interface FinishedGame {
  id: number;
  date: string; // ISO
  pgn: string;
  result: string; // 1-0 | 0-1 | 1/2-1/2
  levelName: string;
  levelId?: number;
  playerColor: 'w' | 'b';
  plies: number;
  review?: ReviewSummary;
}

interface HistoryState {
  games: FinishedGame[];
  add: (g: Omit<FinishedGame, 'id'>) => number;
  /** Сохраняет итоги разбора для партии из истории. */
  setReview: (id: number, review: ReviewSummary) => void;
  clear: () => void;
}

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      games: [],
      add: (g) => {
        const id = Date.now() + Math.floor(Math.random() * 1000);
        set((s) => ({ games: [{ ...g, id }, ...s.games].slice(0, 50) }));
        return id;
      },
      setReview: (id, review) =>
        set((s) => ({ games: s.games.map((g) => (g.id === id ? { ...g, review } : g)) })),
      clear: () => set({ games: [] }),
    }),
    { name: 'chess-history' },
  ),
);
