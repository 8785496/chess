import { clampScore } from '../../core/classification';
import { formatCp } from '../../stores/game';
import type { Orientation } from '../../stores/game';

interface EvalBarProps {
  /** Сантипешки от лица белых; null — оценка неизвестна. */
  cp: number | null;
  loading: boolean;
  /** Высота в px; по умолчанию тянется на высоту ряда с доской. */
  height?: number;
  orientation: Orientation;
}

/** Доля белых по win-probability (как на lichess). */
function whiteShare(cp: number): number {
  const c = clampScore(cp);
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

/** Вертикальная шкала оценки рядом с доской. */
export function EvalBar({ cp, loading, height, orientation }: EvalBarProps) {
  const share = cp === null ? 50 : whiteShare(cp);
  const whiteAtBottom = orientation === 'white';
  const decisive = cp !== null && Math.abs(cp) >= 900;
  const label = cp === null ? (loading ? '…' : '–') : decisive ? '∞' : formatCp(cp);
  return (
    <div
      className="relative w-6 shrink-0 overflow-hidden rounded-md border border-black/20 bg-gray-800 dark:border-white/20"
      style={{ height: height ?? '100%' }}
      title={`${share.toFixed(0)}%`}
    >
      <div
        className="absolute left-0 w-full bg-gray-100 transition-all duration-500"
        style={whiteAtBottom ? { bottom: 0, height: `${share}%` } : { top: 0, height: `${share}%` }}
      />
      <div className="absolute left-0 top-1/2 h-px w-full bg-amber-500/70" aria-hidden />
      <span
        className={`absolute left-0 w-full text-center text-[10px] font-bold ${
          share > 50 !== whiteAtBottom ? 'text-gray-800' : 'text-gray-100'
        }`}
        style={whiteAtBottom ? { bottom: 2 } : { top: 2 }}
      >
        {label}
      </span>
      {loading && <div className="absolute inset-x-0 top-0 h-1 animate-pulse bg-sky-400/80" />}
    </div>
  );
}
