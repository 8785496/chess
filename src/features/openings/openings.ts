import raw from '../../data/openings.json';

export interface Opening {
  eco: string;
  name: string;
  nameEn: string;
  moves: string;
}

export const OPENINGS = raw as Opening[];

export function movesOf(o: Opening): string[] {
  return o.moves.trim().split(/\s+/);
}

export function searchOpenings(query: string, lang: 'ru' | 'en'): Opening[] {
  const q = query.trim().toLowerCase();
  if (!q) return OPENINGS;
  return OPENINGS.filter((o) => {
    const name = (lang === 'en' ? o.nameEn : o.name).toLowerCase();
    return name.includes(q) || o.eco.toLowerCase().includes(q) || o.moves.toLowerCase().includes(q);
  });
}

/** Самое длинное продолжение в библиотеке, совпадающее с данными ходами. */
export function detectOpening(sanMoves: string[]): Opening | null {
  let best: Opening | null = null;
  let bestLen = 0;
  for (const o of OPENINGS) {
    const moves = movesOf(o);
    if (moves.length > sanMoves.length || moves.length <= bestLen) continue;
    let ok = true;
    for (let i = 0; i < moves.length; i++) {
      if (moves[i] !== sanMoves[i]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      best = o;
      bestLen = moves.length;
    }
  }
  return best;
}
