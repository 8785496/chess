import { format, useT, type Dict } from '../../i18n';
import { useSettings } from '../../stores/settings';
import type { HintData, HintMsg } from './hint';

function renderMsg(t: (key: keyof Dict) => string, msg: HintMsg): string {
  return format(t(msg.key as keyof Dict), msg.params ?? {});
}

interface HintPanelProps {
  hint: HintData;
  expanded: boolean;
  onToggle: () => void;
  /** Индекс линии, которая сейчас проигрывается на доске. */
  playingLine: number | null;
  onPlayLine: (lineIndex: number) => void;
  onStopPlayback: () => void;
}

/**
 * Панель подсказки под доской: в свёрнутом виде — ход и оценка, в развёрнутом —
 * варианты движка (с кнопкой проигрывания линии на доске), угрозы противника,
 * объяснение хода и название дебюта.
 */
export function HintPanel({ hint, expanded, onToggle, playingLine, onPlayLine, onStopPlayback }: HintPanelProps) {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const heading = 'text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';

  return (
    <div className="mt-1 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950/50 dark:text-sky-100">
      <div className="flex items-center justify-between gap-2">
        <span className="mono font-semibold">
          {hint.san} · {hint.evalText} ·{' '}
          <span title={t('hintWinTitle')}>{Math.round(hint.winPct)}%</span>
        </span>
        <button
          type="button"
          className="shrink-0 text-xs text-sky-700 underline dark:text-sky-300"
          onClick={onToggle}
        >
          {expanded ? `▴ ${t('hintHide')}` : `▾ ${t('hintDetails')}`}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 flex flex-col gap-2.5 border-t border-sky-200 pt-2 text-left dark:border-sky-800">
          {hint.lines.length > 1 && (
            <section>
              <h4 className={heading}>{t('hintVariants')}</h4>
              <div className="mt-1 flex flex-col gap-1.5">
                {hint.lines.map((line, i) => (
                  <div key={`${line.from}${line.to}${i}`}>
                    <div className="mono flex flex-wrap items-baseline gap-x-2">
                      <button
                        type="button"
                        className="text-sky-600 dark:text-sky-300"
                        title={playingLine === i ? t('hintStopPlayback') : t('hintPlayLine')}
                        onClick={() => (playingLine === i ? onStopPlayback() : onPlayLine(i))}
                      >
                        {playingLine === i ? '⏹' : '▶'}
                      </button>
                      <span className="font-semibold">
                        {i + 1}. {line.san}
                      </span>
                      <span>{line.evalText}</span>
                      <span title={t('hintWinTitle')}>{Math.round(line.winPct)}%</span>
                      <span className="text-gray-400 dark:text-gray-500" title={t('hintShareTitle')}>
                        {line.sharePct}%
                      </span>
                    </div>
                    {line.continuation && (
                      <div className="mono text-xs text-gray-500 dark:text-gray-400">
                        {line.continuation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {hint.threats.length > 0 && (
            <section>
              <h4 className={heading}>{t('hintThreats')}</h4>
              <ul className="mt-1 flex flex-col gap-0.5 text-amber-700 dark:text-amber-400">
                {hint.threats.map((msg, i) => (
                  <li key={i}>⚠ {renderMsg(t, msg)}</li>
                ))}
              </ul>
            </section>
          )}

          {hint.reasons.length > 0 && (
            <section>
              <h4 className={heading}>{t('hintWhy')}</h4>
              <ul className="mt-1 flex flex-col gap-0.5">
                {hint.reasons.map((msg, i) => (
                  <li key={i}>• {renderMsg(t, msg)}</li>
                ))}
              </ul>
            </section>
          )}

          {hint.opening && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {t('hintOpening')}: <span className="font-medium">{lang === 'en' ? hint.opening.nameEn : hint.opening.name}</span>{' '}
              ({hint.opening.eco})
            </div>
          )}
        </div>
      )}
    </div>
  );
}
