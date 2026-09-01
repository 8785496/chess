import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Lang = 'ru' | 'en';
export type ThemeMode = 'system' | 'light' | 'dark';
export type PlayerColorPref = 'white' | 'black' | 'random';
export type ReviewDepth = 'fast' | 'deep';

export interface BoardTheme {
  key: string;
  nameRu: string;
  nameEn: string;
  light: string;
  dark: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  { key: 'classic', nameRu: 'Классическая', nameEn: 'Classic', light: '#f0d9b5', dark: '#b58863' },
  { key: 'green', nameRu: 'Зелёная', nameEn: 'Green', light: '#eeeed2', dark: '#769656' },
  { key: 'blue', nameRu: 'Синяя', nameEn: 'Blue', light: '#dee3e6', dark: '#8ca2ad' },
  { key: 'walnut', nameRu: 'Орех', nameEn: 'Walnut', light: '#e8d3b5', dark: '#7a5230' },
  { key: 'gray', nameRu: 'Серая', nameEn: 'Gray', light: '#e8e8e8', dark: '#7d7d7d' },
];

interface SettingsState {
  lang: Lang;
  themeMode: ThemeMode;
  boardTheme: string;
  sound: boolean;
  showEval: boolean;
  animate: boolean;
  botLevelId: number;
  playerColor: PlayerColorPref;
  reviewDepth: ReviewDepth;
  set: <K extends keyof Omit<SettingsState, 'set' | 'reset'>>(key: K, value: SettingsState[K]) => void;
  reset: () => void;
}

const DEFAULTS = {
  lang: 'ru' as Lang,
  themeMode: 'system' as ThemeMode,
  boardTheme: 'classic',
  sound: true,
  showEval: true,
  animate: true,
  botLevelId: 2,
  playerColor: 'white' as PlayerColorPref,
  reviewDepth: 'fast' as ReviewDepth,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
      reset: () => set({ ...DEFAULTS }),
    }),
    { name: 'chess-settings' },
  ),
);

export function boardThemeByKey(key: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.key === key) ?? BOARD_THEMES[0];
}
