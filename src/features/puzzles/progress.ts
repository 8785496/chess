import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PuzzleProgressState {
  /** id задачи → число ошибок при первом решении. */
  solved: Record<string, number>;
  markSolved: (id: string, mistakes: number) => void;
  reset: () => void;
}

export const usePuzzleProgress = create<PuzzleProgressState>()(
  persist(
    (set) => ({
      solved: {},
      markSolved: (id, mistakes) =>
        set((s) => (s.solved[id] !== undefined ? s : { solved: { ...s.solved, [id]: mistakes } })),
      reset: () => set({ solved: {} }),
    }),
    { name: 'chess-puzzles' },
  ),
);
