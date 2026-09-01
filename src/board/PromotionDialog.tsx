import type { Color } from '../core/game';
import { useT } from '../i18n';

const PIECE_GLYPH: Record<'w' | 'b', Record<string, string>> = {
  w: { q: '♕', r: '♖', b: '♗', n: '♘' },
  b: { q: '♛', r: '♜', b: '♝', n: '♞' },
};

interface PromotionDialogProps {
  color: Color;
  onSelect: (piece: 'q' | 'r' | 'b' | 'n') => void;
  onCancel: () => void;
}

/** Диалог выбора фигуры при превращении пешки. */
export function PromotionDialog({ color, onSelect, onCancel }: PromotionDialogProps) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('promotionTitle')}
        </h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t('promotionChoose')}</p>
        <div className="grid grid-cols-4 gap-2">
          {(['q', 'r', 'b', 'n'] as const).map((p) => (
            <button
              key={p}
              type="button"
              className="flex aspect-square items-center justify-center rounded-xl bg-gray-100 text-5xl leading-none text-gray-800 transition hover:bg-amber-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-amber-700"
              onClick={() => onSelect(p)}
              aria-label={p}
            >
              {PIECE_GLYPH[color][p]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="mt-4 w-full rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          onClick={onCancel}
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}
