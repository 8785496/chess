export type MoveClass = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export const MOVE_CLASS_ORDER: MoveClass[] = [
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
];

export const CLASS_GLYPH: Record<MoveClass, string> = {
  best: '★',
  excellent: '!',
  good: '✓',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

export const CLASS_COLOR: Record<MoveClass, string> = {
  best: '#2e7d32',
  excellent: '#43a047',
  good: '#9e9e9e',
  inaccuracy: '#f9a825',
  mistake: '#ef6c00',
  blunder: '#c62828',
};

/** Клампим оценку, чтобы матовые/огромные значения не доминировали в классификации. */
export const SCORE_CLAMP = 1000;

export function clampScore(cp: number): number {
  return Math.max(-SCORE_CLAMP, Math.min(SCORE_CLAMP, cp));
}

/** Оценку «мат через N» переводим в условные сантипешки. */
export function mateToCp(mate: number): number {
  const sign = mate > 0 ? 1 : -1;
  return sign * (SCORE_CLAMP - Math.min(100, Math.abs(mate) * 20));
}

/** Классификация хода по потере оценки (сантипешки, с точки зрения сходящего). */
export function classifyMove(lossCp: number, isEngineBest: boolean): MoveClass {
  if (isEngineBest) return 'best';
  if (lossCp <= 15) return 'excellent';
  if (lossCp <= 50) return 'good';
  if (lossCp <= 100) return 'inaccuracy';
  if (lossCp <= 250) return 'mistake';
  return 'blunder';
}

export interface ReviewItem {
  ply: number;
  san: string;
  /** Потеря оценки в сантипешках. */
  lossCp: number;
  cls: MoveClass;
  /** Оценка позиции до хода (cp, от лица белых). */
  evalBefore: number;
  /** Оценка после сыгранного хода (cp, от лица белых). */
  evalAfter: number;
  /** Лучший ход по мнению движка (UCI). */
  best: string;
}

export interface ReviewResult {
  items: ReviewItem[];
  /** Оценка для каждого ply: 0 — начальная позиция, i — после i-го хода. От лица белых. */
  evals: number[];
  /** Сантипешки от лица белых из оценки с точки зрения сходящего. */
  mateInfo?: { ply: number; mateIn: number }[];
}

export function toWhiteCp(cpFromSideToMove: number, sideToMove: 'w' | 'b'): number {
  return sideToMove === 'w' ? cpFromSideToMove : -cpFromSideToMove;
}
