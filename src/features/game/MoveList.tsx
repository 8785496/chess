import { useMemo } from 'react';
import { CLASS_COLOR, CLASS_GLYPH, type MoveClass } from '../../core/classification';
import type { MoveRecord } from '../../core/game';
import type { ReviewItem } from '../../core/classification';

interface MoveListProps {
  history: MoveRecord[];
  /** Текущий просматриваемый ply (null = живая позиция). */
  viewPly: number | null;
  reviewItems: Map<number, ReviewItem> | null;
  onPlyClick: (ply: number) => void;
}

/** История ходов парами с аннотациями разбора и переходом по клику. */
export function MoveList({ history, viewPly, reviewItems, onPlyClick }: MoveListProps) {
  const rows = useMemo(() => {
    const out: { number: number; white?: MoveRecord; black?: MoveRecord }[] = [];
    for (let i = 0; i < history.length; i += 2) {
      out.push({ number: i / 2 + 1, white: history[i], black: history[i + 1] });
    }
    return out;
  }, [history]);

  const current = viewPly ?? history.length;

  if (!history.length) return null;

  const renderMove = (rec: MoveRecord | undefined, ply: number) => {
    if (!rec) return <span className="flex-1" />;
    const review = reviewItems?.get(ply);
    return (
      <button
        type="button"
        className={`mono flex-1 truncate rounded px-1.5 py-0.5 text-left text-sm transition ${
          current === ply
            ? 'bg-amber-400/90 font-semibold text-gray-900'
            : 'hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        onClick={() => onPlyClick(ply)}
      >
        {rec.san}
        {review && (
          <span
            className="ml-1 text-xs font-bold"
            style={{ color: CLASS_COLOR[review.cls as MoveClass] }}
            title={`${review.cls} (−${Math.round(review.lossCp)})`}
          >
            {CLASS_GLYPH[review.cls as MoveClass]}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="thin-scroll min-h-0 flex-1 overflow-y-auto" data-testid="move-list">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.number} className="align-top">
              <td className="w-8 select-none py-0.5 pr-1 text-right text-xs text-gray-400">{row.number}.</td>
              <td className="py-0.5">{renderMove(row.white, (row.number - 1) * 2 + 1)}</td>
              <td className="py-0.5">{renderMove(row.black, row.number * 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
