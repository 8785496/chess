import { useGame } from '../../stores/game';
import { useT } from '../../i18n';

interface GameOverDialogProps {
  onReview: () => void;
  onClose: () => void;
}

export function gameEndText(over: ReturnType<typeof useGame.getState>['over'], t: ReturnType<typeof useT>): string {
  switch (over.status.kind) {
    case 'checkmate':
      return over.status.winner === 'w' ? t('gameEndCheckmateWhite') : t('gameEndCheckmateBlack');
    case 'stalemate':
      return t('gameEndStalemate');
    case 'draw':
      if (over.status.reason === 'repetition') return t('gameEndDrawRepetition');
      if (over.status.reason === 'fifty') return t('gameEndDrawFifty');
      if (over.status.reason === 'insufficient') return t('gameEndDrawInsufficient');
      return t('gameEndDrawGeneric');
    default:
      return '';
  }
}

export function GameOverDialog({ onReview, onClose }: GameOverDialogProps) {
  const t = useT();
  const over = useGame((s) => s.over);
  if (!over.over) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-2xl dark:bg-gray-800">
        <div className="mb-2 text-4xl">♟</div>
        <h2 className="mb-5 text-lg font-semibold text-gray-900 dark:text-gray-100">{gameEndText(over, t)}</h2>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
            onClick={onReview}
          >
            {t('review')}
          </button>
          <button
            type="button"
            className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-gray-900 hover:bg-amber-600"
            onClick={() => useGame.getState().newGame()}
          >
            {t('newGame')}
          </button>
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            onClick={onClose}
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
