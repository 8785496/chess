import { useState } from 'react';
import { CLASS_COLOR, CLASS_GLYPH } from '../../core/classification';
import { useGame } from '../../stores/game';
import { useHistory } from '../../stores/history';
import { useSettings } from '../../stores/settings';
import { getLevel } from '../../engine/levels';
import { format, useT } from '../../i18n';

/**
 * Главный экран: старт новой партии, продолжение текущей
 * и история сыгранных партий (перенесена из настроек).
 */
export function HomeScreen({
  onNewGame,
  onResume,
  onAnalyze,
}: {
  onNewGame: () => void;
  onResume: () => void;
  /** Открыть загруженную из истории партию с запущенным разбором. */
  onAnalyze: () => void;
}) {
  const t = useT();
  const settings = useSettings();
  const history = useHistory();
  const game = useGame();
  const [copied, setCopied] = useState<number | null>(null);

  const inProgress = game.history.length > 0 && !game.over.over;
  const level = getLevel(settings.botLevelId);

  /** Загружает партию из истории на доску и сразу запускает разбор. */
  const analyze = (id: number) => {
    if (!useGame.getState().openFromHistory(id)) return;
    void useGame.getState().startReview();
    onAnalyze();
  };

  return (
    <div className="thin-scroll h-full overflow-y-auto p-3 sm:p-4">
      <div className="mx-auto flex min-h-full max-w-xl flex-col gap-3">
        <section className="card flex flex-col gap-2">
          <h2 className="font-semibold">{t('appTitle')}</h2>
          <button type="button" className="btn-primary" onClick={onNewGame}>
            ♟ {t('newGame')}
          </button>
          {inProgress && (
            <button type="button" className="btn" onClick={onResume}>
              ▶ {t('resume')}
            </button>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('modeBot')} · {settings.lang === 'en' ? level.nameEn : level.nameRu}
          </p>
        </section>

        <section
          className={`card ${history.games.length ? 'flex min-h-0 flex-1 flex-col' : ''}`}
        >
          <h2 className="mb-1 font-semibold">{t('sHistory')}</h2>
          {!history.games.length && <p className="text-sm text-gray-400">{t('sHistoryEmpty')}</p>}
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
            {history.games.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-2 border-b border-gray-100 py-1.5 text-sm last:border-0 dark:border-gray-700"
              >
                <div className="min-w-0">
                  <span className="mono mr-2 font-semibold">{g.result}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(g.date).toLocaleDateString()} · {g.levelName} ·{' '}
                    {Math.ceil(g.plies / 2)} х
                  </span>
                  {g.review && (
                    <span className="ml-2 whitespace-nowrap text-xs">
                      <span
                        className="font-semibold"
                        title={format(t('accuracy'), { percent: g.review.accuracy })}
                      >
                        🎯 {g.review.accuracy}%
                      </span>
                      {g.review.counts.blunder > 0 && (
                        <span
                          className="ml-1.5 font-semibold"
                          style={{ color: CLASS_COLOR.blunder }}
                          title={t('clsBlunder')}
                        >
                          {CLASS_GLYPH.blunder} {g.review.counts.blunder}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="btn px-2 py-1 text-xs"
                    aria-label={t('review')}
                    title={t('review')}
                    onClick={() => analyze(g.id)}
                  >
                    🔍
                  </button>
                  <button
                    type="button"
                    className="btn px-2 py-1 text-xs"
                    onClick={() => {
                      void navigator.clipboard.writeText(g.pgn);
                      setCopied(g.id);
                      setTimeout(() => setCopied(null), 1200);
                    }}
                  >
                    {copied === g.id ? t('copied') : 'PGN'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {history.games.length > 0 && (
            <button
              type="button"
              className="btn mt-2 w-full text-xs"
              onClick={() => history.clear()}
            >
              {t('sClearHistory')}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
