import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FinishedGame {
  id: number;
  date: string; // ISO
  pgn: string;
  result: string; // 1-0 | 0-1 | 1/2-1/2
  levelName: string;
  playerColor: 'w' | 'b';
  plies: number;
}

interface HistoryState {
  games: FinishedGame[];
  add: (g: Omit<FinishedGame, 'id'>) => void;
  clear: () => void;
}

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      games: [],
      add: (g) =>
        set((s) => ({
          games: [{ ...g, id: Date.now() + Math.floor(Math.random() * 1000) }, ...s.games].slice(0, 50),
        })),
      clear: () => set({ games: [] }),
    }),
    { name: 'chess-history' },
  ),
);
