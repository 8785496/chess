import type { UciEngine } from './uci';

export interface BotLevel {
  id: number;
  nameRu: string;
  nameEn: string;
  elo: number;
  skill: number;
  depth: number;
  /** Лимит времени на ход (мс) — отзывчивость на слабых устройствах. */
  movetime: number;
}

export const BOT_LEVELS: BotLevel[] = [
  { id: 1, nameRu: 'Новичок', nameEn: 'Beginner', elo: 1350, skill: 1, depth: 3, movetime: 250 },
  { id: 2, nameRu: 'Легкий', nameEn: 'Easy', elo: 1600, skill: 4, depth: 6, movetime: 500 },
  { id: 3, nameRu: 'Средний', nameEn: 'Medium', elo: 1900, skill: 8, depth: 10, movetime: 900 },
  { id: 4, nameRu: 'Сильный', nameEn: 'Strong', elo: 2300, skill: 14, depth: 14, movetime: 1600 },
  { id: 5, nameRu: 'Мастер', nameEn: 'Master', elo: 2850, skill: 20, depth: 18, movetime: 2500 },
];

export function getLevel(id: number): BotLevel {
  return BOT_LEVELS.find((l) => l.id === id) ?? BOT_LEVELS[2];
}

/** Применяем уровень через UCI-опции (каждая — только если поддерживается сборкой). */
export function applyLevel(engine: UciEngine, level: BotLevel): void {
  const hasLimit = engine.hasOption('UCI_LimitStrength');
  const hasElo = engine.hasOption('UCI_Elo');
  if (hasLimit && hasElo) {
    const eloOpt = engine.options.get('UCI_Elo');
    const elo = clamp(level.elo, Number(eloOpt?.min ?? 1350), Number(eloOpt?.max ?? 2850));
    engine.setOption('UCI_LimitStrength', 'true');
    engine.setOption('UCI_Elo', elo);
  }
  engine.setOption('Skill Level', level.skill);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
