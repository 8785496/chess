import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { BoardView } from '../../board/BoardView';
import { PromotionDialog } from '../../board/PromotionDialog';
import { EvalBar } from './EvalBar';
import { MoveList } from './MoveList';
import { GameOverDialog, gameEndText } from './GameOverDialog';
import { fenAtPly, useGame } from '../../stores/game';
import { boardThemeByKey, useSettings, type PlayerColorPref } from '../../stores/settings';
import { BOT_LEVELS } from '../../engine/levels';
import { findCheckSquare, needsPromotion, type Square } from '../../core/game';
import { CLASS_COLOR, CLASS_GLYPH, MOVE_CLASS_ORDER, type MoveClass } from '../../core/classification';
import { format, useT } from '../../i18n';

export function GameScreen() {
  const t = useT();
  const game = useGame();
  const settings = useSettings();
  const [selected, setSelected] = useState<Square | null>(null);
  const [showNewGame, setShowNewGame] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dismissedOver, setDismissedOver] = useState<number>(-1);
  const [pendingLevel, setPendingLevel] = useState(settings.botLevelId);
  const [pendingColor, setPendingColor] = useState<PlayerColorPref>(settings.playerColor);
  const [pendingMode, setPendingMode] = useState<'bot' | 'manual'>('bot');

  const viewState = useMemo(() => {
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
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
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

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1500);
    return () => clearTimeout(id);
  }, [toast]);

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

  const copyText = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast(message);
    } catch {
      setToast(text.slice(0, 40));
    }
  };

  const downloadPgn = () => {
    const pgn = game.getGamePgn();
    const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `game-${new Date().toISOString().slice(0, 10)}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const review = game.review;
  const reviewCounts = useMemo(() => {
    if (!review) return null;
    const counts: Record<MoveClass, number> = {
      best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0,
    };
    let lossSum = 0;
    let n = 0;
    for (const item of review.items.values()) {
      if (game.mode === 'bot' && game.history[item.ply - 1]?.color !== game.playerColor) continue;
      counts[item.cls]++;
      lossSum += Math.min(100, item.lossCp / 6);
      n++;
    }
    return { counts, accuracy: n ? Math.max(0, Math.round(100 - lossSum / n)) : null, n };
  }, [review, game.mode, game.playerColor, game.history]);

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
    <div className="flex h-full min-h-0 flex-col gap-2 lg:flex-row lg:gap-4 lg:p-3">
      {/* Доска + шкала оценки */}
      <div className="flex min-h-0 flex-1 items-stretch justify-center gap-2 px-2 pt-1 lg:px-0">
        {settings.showEval && (
          <EvalBar cp={evalCp} loading={game.evalLoading || game.hintLoading} orientation={game.orientation} />
        )}
        <div className="flex min-h-0 w-full flex-1 flex-col">
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
            arrows={
              game.hint
                ? [{ from: game.hint.from, to: game.hint.to, color: 'rgba(56, 189, 248, 0.85)' }]
                : undefined
            }
            onSquareTap={handleTap}
            onMoveAttempt={attemptMove}
          />
          {game.hint && (
            <div className="mono pt-1 text-center text-sm font-semibold text-sky-600 dark:text-sky-400">
              {game.hint.from}→{game.hint.to} · {game.hint.cpText}
            </div>
          )}
        </div>
      </div>

      {/* Панель управления */}
      <aside className="flex max-h-[45%] min-h-0 w-full flex-col gap-2 rounded-xl bg-white p-2 shadow-sm dark:bg-gray-800 sm:p-3 lg:max-h-none lg:w-80">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold" data-status>
            {statusText}
          </span>
          {game.mode === 'bot' && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">
              {t('level')} {game.levelId}
            </span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-4 lg:grid-cols-2">
          <button type="button" className="btn-primary col-span-2 lg:col-span-1" onClick={() => setShowNewGame((v) => !v)}>
            {t('newGame')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => useGame.getState().undo()}
            disabled={!game.history.length}
            title={t('undo')}
          >
            ↩
          </button>
          <button type="button" className="btn" onClick={() => useGame.getState().flip()} title={t('flip')}>
            ⇅
          </button>
          <button
            type="button"
            className="btn col-span-2 disabled:opacity-40 lg:col-span-2"
            onClick={() => void useGame.getState().requestHint()}
            disabled={game.hintLoading || game.over.over}
          >
            {game.hintLoading ? t('hintThinking') : `💡 ${t('hint')}`}
          </button>
        </div>

        {showNewGame && (
          <div className="rounded-lg bg-gray-50 p-2 text-sm dark:bg-gray-700/60">
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
                        pendingLevel === l.id ? 'bg-amber-500 text-gray-900 font-semibold' : 'bg-white dark:bg-gray-700'
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
                        pendingColor === c ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-gray-700'
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

        {game.viewPly !== null && (
          <button type="button" className="btn text-xs" onClick={() => useGame.getState().setViewPly(null)}>
            {t('backToGame')} ({game.viewPly}/{game.history.length})
          </button>
        )}

        <MoveList
          history={game.history}
          viewPly={game.viewPly}
          reviewItems={review?.items ?? null}
          onPlyClick={(ply) =>
            useGame.getState().setViewPly(ply >= game.history.length ? null : ply)
          }
        />

        {/* Разбор партии */}
        <div className="flex flex-col gap-1.5 border-t border-gray-200 pt-2 dark:border-gray-700">
          {review?.running ? (
            <>
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
            </>
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
                title={
                  game.mode === 'bot' && !game.over.over ? t('reviewNavigateHint') : t('reviewRun')
                }
                onClick={() => void useGame.getState().startReview()}
              >
                🔍 {t('reviewRun')}
              </button>
            </div>
          )}
          {review && !review.running && !review.error && reviewCounts && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <div className="mb-0.5 flex flex-wrap gap-x-2">
                {MOVE_CLASS_ORDER.map((cls) => (
                  <span key={cls} style={{ color: CLASS_COLOR[cls] }} className="font-semibold">
                    {CLASS_GLYPH[cls]} {reviewCounts.counts[cls]}
                  </span>
                ))}
              </div>
              {reviewCounts.accuracy !== null && (
                <div>{format(t('accuracy'), { percent: reviewCounts.accuracy })}</div>
              )}
            </div>
          )}
          {review?.error && <div className="text-xs text-red-500">{t('reviewError')}</div>}
        </div>

        <div className="flex gap-1.5 border-t border-gray-200 pt-2 dark:border-gray-700">
          <button type="button" className="btn flex-1 text-xs" onClick={downloadPgn}>
            ⬇ PGN
          </button>
          <button
            type="button"
            className="btn flex-1 text-xs"
            onClick={() => void copyText(viewState.fen, t('copied'))}
          >
            FEN
          </button>
        </div>
      </aside>

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

      {game.over.over && dismissedOver !== game.gameId && (
        <GameOverDialog
          onReview={() => {
            setDismissedOver(game.gameId);
            void useGame.getState().startReview();
          }}
          onClose={() => setDismissedOver(game.gameId)}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900/90 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
