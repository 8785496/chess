import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { BoardView } from '../../board/BoardView';
import { PromotionDialog } from '../../board/PromotionDialog';
import { EvalBar } from './EvalBar';
import { HintPanel } from './HintPanel';
import { MoveList } from './MoveList';
import { GameOverDialog, gameEndText } from './GameOverDialog';
import { ReviewDialog } from './ReviewDialog';
import { fenAtPly, useGame } from '../../stores/game';
import { boardThemeByKey, useSettings, type PlayerColorPref } from '../../stores/settings';
import { BOT_LEVELS } from '../../engine/levels';
import { findCheckSquare, needsPromotion, type Square } from '../../core/game';
import { useT } from '../../i18n';

/**
 * Отдельный экран партии: шапка со стрелкой «назад», доска с подсказкой,
 * лента ходов и футер с кнопками управления. Открывается поверх главной навигации.
 */
export function GameScreen({
  onBack,
  initialReviewOpen = false,
}: {
  onBack: () => void;
  /** Открыть с диалогом разбора (партия, запущенная из истории). */
  initialReviewOpen?: boolean;
}) {
  const t = useT();
  const game = useGame();
  const settings = useSettings();
  const [selected, setSelected] = useState<Square | null>(null);
  const [showNewGame, setShowNewGame] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(initialReviewOpen);
  const [dismissedOver, setDismissedOver] = useState<number>(-1);
  const [pendingLevel, setPendingLevel] = useState(settings.botLevelId);
  const [pendingColor, setPendingColor] = useState<PlayerColorPref>(settings.playerColor);
  const [pendingMode, setPendingMode] = useState<'bot' | 'manual'>('bot');

  // Подсказка всегда показывается развёрнутой: детали видны сразу,
  // вместе со стрелками всех вариантов.
  const hintArrows = useMemo(() => {
    const hint = game.hint;
    if (!hint) return undefined;
    return [
      { from: hint.from, to: hint.to, color: 'rgba(56, 189, 248, 0.85)' },
      ...hint.lines
        .slice(1)
        .map((l) => ({ from: l.from, to: l.to, color: 'rgba(56, 189, 248, 0.35)' })),
    ];
  }, [game.hint]);

  const viewState = useMemo(() => {
    // Проигрывание линии подсказки перекрывает показ доски.
    const pb = game.hintPlayback;
    if (pb) {
      const fen = pb.fens[pb.index];
      return {
        fen,
        lastMove: pb.index > 0 ? pb.moves[pb.index - 1] : null,
        checkSquare: findCheckSquare(new Chess(fen)),
      };
    }
    const ply = game.viewPly;
    if (ply === null) {
      return { fen: game.fen, lastMove: game.lastMove, checkSquare: game.checkSquare };
    }
    const fen = fenAtPly(game, ply);
    const rec = ply > 0 ? game.history[ply - 1] : null;
    return {
      fen,
      lastMove: rec ? { from: rec.from, to: rec.to } : null,
      checkSquare: findCheckSquare(new Chess(fen)),
    };
  }, [game]);

  const interactive =
    game.viewPly === null &&
    !game.over.over &&
    !game.botThinking &&
    !game.hintPlayback &&
    (game.mode === 'manual' || game.turn === game.playerColor);

  const targets = useMemo(() => {
    if (!selected || !interactive) return {};
    const out: Partial<Record<Square, boolean>> = {};
    for (const m of game.chess.moves({ square: selected as never, verbose: true })) {
      out[m.to as Square] = m.captured !== undefined;
    }
    return out;
  }, [selected, interactive, game.chess]);

  const evalCp = useMemo(() => {
    if (game.viewPly !== null && game.review) {
      return game.review.evals[game.viewPly] ?? null;
    }
    if (game.viewPly === null && !game.botThinking) return game.liveEval;
    return null;
  }, [game.viewPly, game.review, game.liveEval, game.botThinking]);

  // Клавиатурная навигация по истории.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End')
        return;
      const len = useGame.getState().history.length;
      if (!len) return;
      const cur = useGame.getState().viewPly ?? len;
      e.preventDefault();
      if (e.key === 'ArrowLeft') useGame.getState().setViewPly(Math.max(0, cur - 1));
      if (e.key === 'ArrowRight') useGame.getState().setViewPly(cur + 1 >= len ? null : cur + 1);
      if (e.key === 'Home') useGame.getState().setViewPly(0);
      if (e.key === 'End') useGame.getState().setViewPly(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleTap = (sq: Square) => {
    if (!interactive) {
      return;
    }
    if (selected) {
      if (sq === selected) {
        setSelected(null);
        return;
      }
      if (targets[sq] !== undefined) {
        attemptMove(selected, sq);
        return;
      }
    }
    const piece = game.chess.get(sq as never);
    if (piece && piece.color === game.turn) {
      setSelected(sq);
    } else {
      setSelected(null);
    }
  };

  const attemptMove = (from: Square, to: Square) => {
    setSelected(null);
    if (needsPromotion(game.chess, from, to)) {
      useGame.setState({ pendingPromotion: { from, to } });
      return;
    }
    useGame.getState().tryUserMove(from, to);
  };

  const review = game.review;

  // Кнопки управления в футере — в стиле навигации главного экрана.
  const ctrlBtn =
    'flex flex-1 flex-col items-center gap-0.5 whitespace-nowrap py-1.5 text-[10px] font-medium text-gray-500 transition hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:text-gray-200';

  const statusText = game.over.over
    ? gameEndText(game.over, t)
    : game.botThinking
      ? t('thinking')
      : game.mode === 'bot'
        ? game.turn === game.playerColor
          ? t('yourTurn')
          : t('botTurn')
        : game.turn === 'w'
          ? t('whiteToMove')
          : t('blackToMove');

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Шапка: назад в меню, статус партии, уровень бота */}
      <header className="flex shrink-0 items-center gap-1.5 py-1 pl-1 pr-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('back')}
          title={t('back')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-gray-600 transition hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10"
        >
          ←
        </button>
        <span className="truncate text-sm font-semibold" data-status>
          {statusText}
        </span>
        {game.mode === 'bot' && (
          <span className="ml-auto shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">
            {t('level')} {game.levelId}
          </span>
        )}
      </header>

      {/* Центральная колонка: оценка, доска, подсказка, лента ходов */}
      <div className="flex min-h-0 flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-2xl">
        {settings.showEval && (
          <div className="px-2 pb-1 lg:px-0">
            <EvalBar
              cp={evalCp}
              loading={game.evalLoading || game.hintLoading}
              orientation={game.orientation}
            />
          </div>
        )}
        <div className="flex min-h-0 flex-1 items-stretch justify-center px-2 lg:px-0">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <BoardView
              id="game-board"
              fen={viewState.fen}
              orientation={game.orientation}
              theme={boardThemeByKey(settings.boardTheme)}
              animate={settings.animate}
              interactive={interactive}
              lastMove={viewState.lastMove}
              checkSquare={viewState.checkSquare}
              selected={selected}
              targets={targets}
              arrows={game.hintPlayback ? undefined : hintArrows}
              onSquareTap={handleTap}
              onMoveAttempt={attemptMove}
            />
            {game.hint && (
              <HintPanel
                hint={game.hint}
                playingLine={game.hintPlayback?.lineIndex ?? null}
                onPlayLine={(i) => {
                  const hint = useGame.getState().hint;
                  const line = hint?.lines[i];
                  if (hint && line) useGame.getState().playHintLine(hint.fen, line.uciMoves, i);
                }}
                onStopPlayback={() => useGame.getState().stopHintPlayback()}
              />
            )}
          </div>
        </div>
        {/* Лента ходов скрывается, пока на экране развёрнутая подсказка */}
        {!game.hint && (
          <div className="flex min-h-0 max-h-[26%] shrink-0 flex-col px-2 pt-1 lg:px-0">
            <MoveList
              history={game.history}
              viewPly={game.viewPly}
              reviewItems={review?.items ?? null}
              onPlyClick={(ply) =>
                useGame.getState().setViewPly(ply >= game.history.length ? null : ply)
              }
            />
          </div>
        )}
      </div>
      {/* Футер: кнопки управления игрой */}
      <footer className="mt-1.5 shrink-0 border-t border-black/10 bg-white/95 px-2 pt-1.5 backdrop-blur dark:border-white/10 dark:bg-gray-800/95">
        <div className="mx-auto w-full max-w-2xl pb-1.5">
          {game.viewPly !== null && (
            <button
              type="button"
              className="btn mb-1.5 w-full text-xs"
              onClick={() => useGame.getState().setViewPly(null)}
            >
              {t('backToGame')} ({game.viewPly}/{game.history.length})
            </button>
          )}

          {showNewGame && (
            <div className="mb-1.5 rounded-lg bg-gray-50 p-2 text-sm dark:bg-gray-700/60">
              <div className="mb-2 flex gap-1">
                {(['bot', 'manual'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`flex-1 rounded-md px-2 py-1 text-xs font-medium ${
                      pendingMode === m ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-gray-700'
                    }`}
                    onClick={() => setPendingMode(m)}
                  >
                    {m === 'bot' ? t('modeBot') : t('modeManual')}
                  </button>
                ))}
              </div>
              {pendingMode === 'bot' && (
                <>
                  <div className="mb-1.5 flex flex-wrap gap-1">
                    {BOT_LEVELS.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        className={`rounded-md px-2 py-1 text-xs ${
                          pendingLevel === l.id
                            ? 'bg-amber-500 text-gray-900 font-semibold'
                            : 'bg-white dark:bg-gray-700'
                        }`}
                        onClick={() => setPendingLevel(l.id)}
                      >
                        {l.id}. {settings.lang === 'en' ? l.nameEn : l.nameRu}
                      </button>
                    ))}
                  </div>
                  <div className="mb-2 flex gap-1">
                    {(['white', 'black', 'random'] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`flex-1 rounded-md px-2 py-1 text-xs ${
                          pendingColor === c
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white dark:bg-gray-700'
                        }`}
                        onClick={() => setPendingColor(c)}
                      >
                        {c === 'white' ? t('white') : c === 'black' ? t('black') : t('random')}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button
                type="button"
                className="btn-primary w-full"
                onClick={() => {
                  settings.set('botLevelId', pendingLevel);
                  settings.set('playerColor', pendingColor);
                  useGame.getState().newGame({ mode: pendingMode, levelId: pendingLevel });
                  setShowNewGame(false);
                  setDismissedOver(-1);
                }}
              >
                {t('confirm')}
              </button>
            </div>
          )}

          {/* Ряд иконок в стиле главного меню: иконка сверху, подпись снизу */}
          <div className="flex items-stretch">
            <button
              type="button"
              className={ctrlBtn + (showNewGame ? ' text-emerald-600 dark:text-emerald-400' : '')}
              onClick={() => setShowNewGame((v) => !v)}
              title={t('newGame')}
            >
              <span className="text-xl leading-none">➕</span>
              {t('newGame')}
            </button>
            <button
              type="button"
              className={ctrlBtn}
              onClick={() => useGame.getState().undo()}
              disabled={!game.history.length || game.fromHistory}
              title={t('undo')}
            >
              <span className="text-xl leading-none">↩</span>
              {t('undoShort')}
            </button>
            <button
              type="button"
              className={ctrlBtn}
              onClick={() => useGame.getState().flip()}
              title={t('flip')}
            >
              <span className="text-xl leading-none">⇅</span>
              {t('flipShort')}
            </button>
            <button
              type="button"
              className={ctrlBtn}
              onClick={() => setReviewOpen(true)}
              title={t('review')}
            >
              <span className="text-xl leading-none">🔍</span>
              {t('reviewShort')}
            </button>
            <button
              type="button"
              className={ctrlBtn}
              onClick={() => void useGame.getState().requestHint()}
              disabled={game.hintLoading || game.over.over}
              title={t('hint')}
            >
              <span className="text-xl leading-none">💡</span>
              {game.hintLoading ? t('hintThinking') : t('hint')}
            </button>
          </div>
        </div>
      </footer>

      {game.pendingPromotion && (
        <PromotionDialog
          color={game.turn}
          onSelect={(piece) => {
            const p = useGame.getState().pendingPromotion;
            useGame.setState({ pendingPromotion: null });
            if (p) useGame.getState().tryUserMove(p.from, p.to, piece);
          }}
          onCancel={() => useGame.getState().cancelPromotion()}
        />
      )}

      {reviewOpen && <ReviewDialog onClose={() => setReviewOpen(false)} />}

      {/* Диалог итога не показываем для партий, открытых из истории. */}
      {game.over.over && !game.fromHistory && dismissedOver !== game.gameId && (
        <GameOverDialog
          onReview={() => {
            setDismissedOver(game.gameId);
            setReviewOpen(true);
            void useGame.getState().startReview();
          }}
          onClose={() => setDismissedOver(game.gameId)}
        />
      )}
    </div>
  );
}
