import { clampScore } from '../../core/classification';
import { formatCp } from '../../stores/game';
import type { Orientation } from '../../stores/game';

interface EvalBarProps {
  /** Сантипешки от лица белых; null — оценка неизвестна. */
  cp: number | null;
  loading: boolean;
  orientation: Orientation;
}

/** Доля белых по win-probability (как на lichess). */
function whiteShare(cp: number): number {
  const c = clampScore(cp);
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

/** Горизонтальная шкала оценки над доской. */
export function EvalBar({ cp, loading, orientation }: EvalBarProps) {
  const share = cp === null ? 50 : whiteShare(cp);
  const whiteFromLeft = orientation === 'white';
  const decisive = cp !== null && Math.abs(cp) >= 900;
  const label = cp === null ? (loading ? '…' : '–') : decisive ? '∞' : formatCp(cp);
  return (
    <div className="flex items-center gap-1.5" title={`${share.toFixed(0)}%`}>
      <div className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full border border-black/20 bg-gray-800 dark:border-white/20">
        <div
          className="absolute inset-y-0 bg-gray-100 transition-all duration-500"
          style={whiteFromLeft ? { left: 0, width: `${share}%` } : { right: 0, width: `${share}%` }}
        />
        <div className="absolute inset-y-0 left-1/2 w-px bg-amber-500/70" aria-hidden />
        {loading && <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-sky-400/80" />}
      </div>
      <span className="mono w-8 shrink-0 text-right text-[10px] font-bold text-gray-700 dark:text-gray-200">
        {label}
      </span>
    </div>
  );
}
