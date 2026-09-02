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

export function GameScreen() {
  const t = useT();
  const game = useGame();
  const settings = useSettings();
  const [selected, setSelected] = useState<Square | null>(null);
  const [showNewGame, setShowNewGame] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [dismissedOver, setDismissedOver] = useState<number>(-1);
  const [pendingLevel, setPendingLevel] = useState(settings.botLevelId);
  const [pendingColor, setPendingColor] = useState<PlayerColorPref>(settings.playerColor);
  const [pendingMode, setPendingMode] = useState<'bot' | 'manual'>('bot');

  // Двухступенчатая подсказка: сначала только стрелка, детали — по кнопке.
  // Новая подсказка всегда приходит свёрнутой (сброс во время рендера, без эффекта).
  const [hintExpanded, setHintExpanded] = useState(false);
  const [lastHint, setLastHint] = useState(game.hint);
  if (lastHint !== game.hint) {
    setLastHint(game.hint);
    setHintExpanded(false);
  }

  const hintArrows = useMemo(() => {
    const hint = game.hint;
    if (!hint) return undefined;
    const main = { from: hint.from, to: hint.to, color: 'rgba(56, 189, 248, 0.85)' };
    if (!hintExpanded) return [main];
    return [
      main,
      ...hint.lines.slice(1).map((l) => ({ from: l.from, to: l.to, color: 'rgba(56, 189, 248, 0.35)' })),
    ];
  }, [game.hint, hintExpanded]);

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
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Индикатор хода над доской */}
        <div className="flex items-center justify-center gap-2 px-3 pb-1">
          <span className="truncate text-sm font-semibold" data-status>
            {statusText}
          </span>
          {game.mode === 'bot' && (
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">
              {t('level')} {game.levelId}
            </span>
          )}
        </div>
        {/* Шкала оценки над доской */}
        {settings.showEval && (
          <div className="px-2 pb-1 lg:px-0">
            <EvalBar cp={evalCp} loading={game.evalLoading || game.hintLoading} orientation={game.orientation} />
          </div>
        )}
        {/* Доска */}
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
              arrows={hintArrows}
              onSquareTap={handleTap}
              onMoveAttempt={attemptMove}
            />
            {game.hint && (
              <HintPanel
                hint={game.hint}
                expanded={hintExpanded}
                onToggle={() => setHintExpanded((v) => !v)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Панель управления */}
      <aside className="flex max-h-[45%] min-h-0 w-full flex-col gap-2 rounded-xl bg-white p-2 shadow-sm dark:bg-gray-800 sm:p-3 lg:max-h-none lg:w-80">
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
            onClick={() => {
              // Повторное нажатие не пересчитывает, а разворачивает/сворачивает детали.
              if (game.hint) setHintExpanded((v) => !v);
              else void useGame.getState().requestHint();
            }}
            disabled={game.hintLoading || game.over.over}
            title={game.hint ? t('hintDetails') : undefined}
          >
            {game.hintLoading
              ? t('hintThinking')
              : game.hint
                ? hintExpanded
                  ? `▴ ${t('hintHide')}`
                  : `▾ ${t('hintDetails')}`
                : `💡 ${t('hint')}`}
          </button>
          <button
            type="button"
            className="btn col-span-2 lg:col-span-2"
            onClick={() => setReviewOpen(true)}
          >
            🔍 {t('review')}
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

      {reviewOpen && <ReviewDialog onClose={() => setReviewOpen(false)} />}

      {game.over.over && dismissedOver !== game.gameId && (
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
