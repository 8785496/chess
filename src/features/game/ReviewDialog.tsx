import { useMemo } from 'react';
import { CLASS_COLOR, CLASS_GLYPH, MOVE_CLASS_ORDER, type MoveClass } from '../../core/classification';
import { format, useT } from '../../i18n';
import { useGame } from '../../stores/game';
import { useSettings } from '../../stores/settings';

interface ReviewDialogProps {
  onClose: () => void;
}

/** Модальное окно разбора партии: запуск, прогресс и итоги. */
export function ReviewDialog({ onClose }: ReviewDialogProps) {
  const t = useT();
  const settings = useSettings();
  const game = useGame();
  const review = game.review;

  const counts = useMemo(() => {
    if (!review) return null;
    const out: Record<MoveClass, number> = {
      best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0,
    };
    let lossSum = 0;
    let n = 0;
    for (const item of review.items.values()) {
      if (game.mode === 'bot' && game.history[item.ply - 1]?.color !== game.playerColor) continue;
      out[item.cls]++;
      lossSum += Math.min(100, item.lossCp / 6);
      n++;
    }
    return { counts: out, accuracy: n ? Math.max(0, Math.round(100 - lossSum / n)) : null, n };
  }, [review, game.mode, game.playerColor, game.history]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl dark:bg-gray-800">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">🔍 {t('review')}</h2>
          <button
            type="button"
            aria-label={t('close')}
            className="rounded-lg px-2 py-1 text-gray-400 transition hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {review?.running ? (
          <div className="flex flex-col gap-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-600">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${Math.round(review.progress * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{format(t('reviewRunning'), { percent: Math.round(review.progress * 100) })}</span>
              <button type="button" className="underline" onClick={() => useGame.getState().cancelReview()}>
                {t('reviewCancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <select
              className="select flex-1"
              value={settings.reviewDepth}
              onChange={(e) => settings.set('reviewDepth', e.target.value as 'fast' | 'deep')}
              aria-label={t('reviewDepth')}
            >
              <option value="fast">{t('reviewFast')}</option>
              <option value="deep">{t('reviewDeep')}</option>
            </select>
            <button
              type="button"
              className="btn-primary flex-1 whitespace-nowrap text-xs"
              disabled={!game.history.length || (game.mode === 'bot' && !game.over.over)}
              title={game.mode === 'bot' && !game.over.over ? t('reviewNavigateHint') : t('reviewRun')}
              onClick={() => void useGame.getState().startReview()}
            >
              {t('reviewRun')}
            </button>
          </div>
        )}

        {review && !review.running && !review.error && counts && (
          <div className="mt-3 border-t border-gray-200 pt-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
            <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1">
              {MOVE_CLASS_ORDER.map((cls) => (
                <span key={cls} style={{ color: CLASS_COLOR[cls] }} className="font-semibold">
                  {CLASS_GLYPH[cls]} {counts.counts[cls]}
                </span>
              ))}
            </div>
            {counts.accuracy !== null && (
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {format(t('accuracy'), { percent: counts.accuracy })}
              </div>
            )}
          </div>
        )}
        {review?.error && <div className="mt-3 text-xs text-red-500">{t('reviewError')}</div>}
      </div>
    </div>
  );
}
