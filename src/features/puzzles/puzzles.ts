import raw from '../../data/puzzles.json';
import { format, type Dict } from '../../i18n';

export interface LocalText {
  ru: string;
  en: string;
}

export type PuzzleKind = 'mate' | 'tactic';

export type PuzzleTheme =
  | 'backrank'
  | 'basic-mate'
  | 'opening'
  | 'promotion'
  | 'deflection'
  | 'fork'
  | 'skewer'
  | 'smothered';

export interface Puzzle {
  id: string;
  fen: string;
  kind: PuzzleKind;
  theme: PuzzleTheme;
  difficulty: 1 | 2 | 3;
  /** Линия решения в SAN: чётные индексы — ходы решающего, нечётные — ответы соперника. */
  solution: string[];
  title: LocalText;
  hint: LocalText;
}

export const PUZZLES = raw as unknown as Puzzle[];

/** Ключ словаря с названием темы — для бейджа в каталоге и решателе. */
export const THEME_LABEL_KEY: Record<PuzzleTheme, keyof Dict> = {
  backrank: 'pThemeBackrank',
  'basic-mate': 'pThemeBasicMate',
  opening: 'pThemeOpening',
  promotion: 'pThemePromotion',
  deflection: 'pThemeDeflection',
  fork: 'pThemeFork',
  skewer: 'pThemeSkewer',
  smothered: 'pThemeSmothered',
};

/** Цвет решающего — сторона, чей ход в начальной позиции. */
export function solverColorOf(p: Puzzle): 'w' | 'b' {
  return p.fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

/** Сколько своих ходов у решающего в линии решения (для заголовка «мат в 2»). */
export function solverMovesOf(p: Puzzle): number {
  return Math.ceil(p.solution.length / 2);
}

/** Текст цели задачи: «Мат в 1 ход», «Мат в {n} хода» или «Выигрыш материала». */
export function goalTextOf(p: Puzzle, t: (key: keyof Dict) => string): string {
  if (p.kind === 'tactic') return t('pFindMaterial');
  const n = solverMovesOf(p);
  return n === 1 ? t('pFindMate1') : format(t('pFindMateN'), { n });
}

export type PuzzleFilter = 'all' | 'todo' | 'solved';

/** Фильтр по числу ходов решающего: «все» или конкретное число 1–4. */
export type MovesFilter = 'all' | 1 | 2 | 3 | 4;

export const MOVES_FILTER_VALUES: MovesFilter[] = ['all', 1, 2, 3, 4];

export function filterPuzzles(
  list: Puzzle[],
  filter: PuzzleFilter,
  solvedIds: ReadonlySet<string>,
  moves: MovesFilter = 'all',
): Puzzle[] {
  let result = list;
  if (filter !== 'all') {
    result = result.filter((p) => (filter === 'solved' ? solvedIds.has(p.id) : !solvedIds.has(p.id)));
  }
  if (moves !== 'all') {
    result = result.filter((p) => solverMovesOf(p) === moves);
  }
  return result;
}
