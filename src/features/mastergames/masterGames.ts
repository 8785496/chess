import raw from '../../data/masterGames.json';

export interface LocalText {
  ru: string;
  en: string;
}

export interface MasterGame {
  id: string;
  white: string;
  whiteEn: string;
  black: string;
  blackEn: string;
  year: number;
  event: string;
  eventEn: string;
  result: '1-0' | '0-1' | '1/2-1/2';
  title: LocalText;
  opening: LocalText;
  intro: LocalText;
  moves: string[];
  /** Ключ — индекс хода (с нуля), комментарий показывается после этого хода. */
  comments: Record<string, LocalText>;
}

export const MASTER_GAMES = raw as unknown as MasterGame[];

/** Имена игроков в текущей локали, «Белые – Чёрные». */
export function playersOf(g: MasterGame, lang: 'ru' | 'en'): string {
  return `${lang === 'en' ? g.whiteEn : g.white} – ${lang === 'en' ? g.blackEn : g.black}`;
}

export function searchGames(query: string, lang: 'ru' | 'en'): MasterGame[] {
  const q = query.trim().toLowerCase();
  if (!q) return MASTER_GAMES;
  return MASTER_GAMES.filter((g) => {
    const white = (lang === 'en' ? g.whiteEn : g.white).toLowerCase();
    const black = (lang === 'en' ? g.blackEn : g.black).toLowerCase();
    return (
      white.includes(q) ||
      black.includes(q) ||
      g.title[lang].toLowerCase().includes(q) ||
      g.opening[lang].toLowerCase().includes(q) ||
      (lang === 'en' ? g.eventEn : g.event).toLowerCase().includes(q) ||
      String(g.year).includes(q)
    );
  });
}
