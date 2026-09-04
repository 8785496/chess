import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { Square as JsSquare } from 'chess.js';
import type { Square } from '../../core/game';
import { BoardView } from '../../board/BoardView';
import { boardThemeByKey, useSettings } from '../../stores/settings';
import { format, useT } from '../../i18n';
import { sounds } from '../../core/sounds';
import { canForceMate } from './mate';
import { usePuzzleProgress } from './progress';
import {
  MOVES_FILTER_VALUES,
  PUZZLES,
  THEME_LABEL_KEY,
  filterPuzzles,
  goalTextOf,
  solverColorOf,
  solverMovesOf,
  type MovesFilter,
  type Puzzle,
  type PuzzleFilter,
} from './puzzles';

/** Список задач с фильтром по статусу решения. */
export function PuzzlesScreen() {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const solved = usePuzzleProgress((s) => s.solved);
  const [filter, setFilter] = useState<PuzzleFilter>('all');
  const [moves, setMoves] = useState<MovesFilter>('all');
  const [selected, setSelected] = useState<Puzzle | null>(null);

  const solvedIds = useMemo(() => new Set(Object.keys(solved)), [solved]);
  const list = useMemo(() => filterPuzzles(PUZZLES, filter, solvedIds, moves), [filter, moves, solvedIds]);
  const solvedCount = PUZZLES.filter((p) => solvedIds.has(p.id)).length;

  if (selected) {
    // key — задача меняется полным ремонтированием решателя.
    return <PuzzleSolver key={selected.id} puzzle={selected} onBack={() => setSelected(null)} onPickNext={setSelected} />;
  }

  const filters: { id: PuzzleFilter; label: string }[] = [
    { id: 'all', label: t('openingsAll') },
    { id: 'todo', label: t('pFilterTodo') },
    { id: 'solved', label: t('pFilterSolved') },
  ];

  return (
    <div className="thin-scroll h-full overflow-y-auto p-3 sm:p-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h2 className="font-semibold">{t('puzzlesTitle')}</h2>
          <span className="text-xs text-gray-500">
            {format(t('puzzlesSolved'), { done: solvedCount, total: PUZZLES.length })}
          </span>
        </div>
        <div className="mb-1.5 flex gap-1.5">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filter === f.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
          {filter === 'solved' && solvedCount > 0 && (
            <button
              type="button"
              className="ml-auto rounded-full px-3 py-1 text-xs text-gray-400 hover:text-red-500"
              onClick={() => usePuzzleProgress.getState().reset()}
            >
              {t('pResetProgress')}
            </button>
          )}
        </div>
        <div className="mb-3 flex items-center gap-1.5">
          <span className="text-xs text-gray-500">{t('pMovesLabel')}:</span>
          {MOVES_FILTER_VALUES.map((m) => (
            <button
              key={String(m)}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                moves === m
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
              onClick={() => setMoves(m)}
            >
              {m === 'all' ? t('openingsAll') : m}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {list.map((p) => (
            <button
              key={p.id}
              type="button"
              className="card text-left transition hover:shadow-md"
              onClick={() => setSelected(p)}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                  {t(THEME_LABEL_KEY[p.theme])}
                </span>
                <span className="text-xs" title={t('pDifficulty')}>
                  {'★'.repeat(p.difficulty)}
                </span>
                {solved[p.id] !== undefined && (
                  <span className="ml-auto text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    ✓ {t('pSolvedBadge')}
                    {solved[p.id] > 0 && ` · ${format(t('pMistakesShort'), { n: solved[p.id] })}`}
                  </span>
                )}
              </div>
              <div className="truncate font-semibold">{p.title[lang]}</div>
              <div className="mt-1 text-[11px] text-gray-400">{goalTextOf(p, t)}</div>
            </button>
          ))}
        </div>
        {!list.length && <p className="py-8 text-center text-gray-400">—</p>}
      </div>
    </div>
  );
}

interface ExpectedMove {
  from: Square;
  to: Square;
  promotion?: string;
}

const other = (c: 'w' | 'b'): 'w' | 'b' => (c === 'w' ? 'b' : 'w');

/** Экран одной задачи: интерактивная доска с проверкой ходов и автоответом соперника. */
function PuzzleSolver({
  puzzle,
  onBack,
  onPickNext,
}: {
  puzzle: Puzzle;
  onBack: () => void;
  /** Перейти к другой задаче (кнопка «Следующая»). */
  onPickNext: (p: Puzzle) => void;
}) {
  const t = useT();
  const settings = useSettings();
  const markSolved = usePuzzleProgress((s) => s.markSolved);
  const solverColor = solverColorOf(puzzle);

  // Ожидаемые ходы линии: SAN → координаты (для сравнения с ходом игрока).
  const expected = useMemo<ExpectedMove[]>(() => {
    const chess = new Chess(puzzle.fen);
    return puzzle.solution.map((san) => {
      const m = chess.move(san);
      return { from: m.from, to: m.to, promotion: m.promotion };
    });
  }, [puzzle]);

  const chessRef = useRef(new Chess(puzzle.fen));
  const [fen, setFen] = useState(puzzle.fen);
  const [plies, setPlies] = useState(0);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  // 'solving' — игрок думает; 'solved' — линия пройдена; 'shown' — решение показано.
  const [status, setStatus] = useState<'solving' | 'solved' | 'shown'>('solving');
  const [wrong, setWrong] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [busy, setBusy] = useState(false); // идёт автоответ соперника
  const timerRef = useRef<number | null>(null);
  const budgetRef = useRef(solverMovesOf(puzzle));
  const onScriptRef = useRef(true);
  const turn: 'w' | 'b' = plies % 2 === 0 ? solverColor : other(solverColor);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  const syncFromBoard = () => {
    const chess = chessRef.current;
    setFen(chess.fen());
    setPlies(chess.history().length);
    const hist = chess.history({ verbose: true });
    const last = hist[hist.length - 1];
    setLastMove(last ? { from: last.from, to: last.to } : null);
    setSelected(null);
  };

  /** Автоответ соперника: из линии, а при отклонении — самый упорный легальный ответ. */
  const scheduleOpponent = (scriptReply: string | null) => {
    setBusy(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const chess = chessRef.current;
      let san = scriptReply;
      if (!san) {
        // Отклонение от линии в матовой задаче: любой ответ уже проигрышный,
        // поэтому выбираем тот, после которого нет мгновенного мата.
        let fallback: string | null = null;
        for (const move of chess.moves()) {
          fallback ??= move;
          chess.move(move);
          const immediateMate = canForceMate(chess, 1);
          chess.undo();
          if (!immediateMate) {
            san = move;
            break;
          }
        }
        san ??= fallback;
      }
      if (san) {
        try {
          chess.move(san);
        } catch {
          /* линия согласована — не должно случиться */
        }
      }
      syncFromBoard();
      setBusy(false);
      if (chess.inCheck()) sounds.check();
      else if (chess.history({ verbose: true })[chess.history().length - 1]?.captured) sounds.capture();
      else sounds.move();
    }, 650);
  };

  /** Применение хода решающего: сверка с линией или с форсированным матом. */
  const attemptSolverMove = (from: Square, to: Square) => {
    if (status !== 'solving' || busy || chessRef.current.turn() !== solverColor) return;
    const chess = chessRef.current;
    let move: ReturnType<Chess['move']> | null;
    try {
      move = chess.move({ from, to });
    } catch {
      try {
        move = chess.move({ from, to, promotion: 'q' });
      } catch {
        move = null;
      }
    }
    if (!move) return;

    const ply = chess.history().length - 1;
    const exp = onScriptRef.current ? expected[ply] : undefined;
    const onScript =
      !!exp && exp.from === from && exp.to === to && (exp.promotion ?? undefined) === (move.promotion ?? undefined);
    const isMate = chess.isCheckmate();
    // Ход принимается, если он из линии либо (в матовой задаче) сохраняет
    // форсированный мат за оставшийся бюджет ходов.
    const acceptable =
      onScript ||
      (puzzle.kind === 'mate' && budgetRef.current > 1 && canForceMate(chess, budgetRef.current - 1));

    if (!acceptable) {
      chess.undo();
      setMistakes((m) => m + 1);
      setWrong(true);
      return;
    }

    budgetRef.current -= 1;
    onScriptRef.current = onScript;
    syncFromBoard();
    if (move.captured) sounds.capture();
    else sounds.move();
    setWrong(false);

    if (isMate) {
      setStatus('solved');
      markSolved(puzzle.id, mistakes);
      sounds.gameEnd();
      return;
    }
    if (onScript && ply + 1 >= expected.length) {
      // Линия тактики пройдена до конца — цель достигнута.
      setStatus('solved');
      markSolved(puzzle.id, mistakes);
      sounds.gameEnd();
      return;
    }
    scheduleOpponent(onScript ? puzzle.solution[ply + 1] : null);
  };

  const onSquareTap = (square: Square) => {
    if (status !== 'solving' || busy) return;
    const chess = chessRef.current;
    if (chess.turn() !== solverColor) return;
    if (selected) {
      if (square === selected) {
        setSelected(null);
        return;
      }
      const moves = chess.moves({ square: selected as JsSquare, verbose: true });
      if (moves.some((m) => m.to === square)) {
        attemptSolverMove(selected, square);
        return;
      }
    }
    const piece = chess.get(square as JsSquare);
    setSelected(piece && piece.color === solverColor ? square : null);
  };

  const targets = useMemo(() => {
    if (!selected || status !== 'solving' || busy || turn !== solverColor) return {};
    const chess = new Chess(fen);
    const map: Record<string, boolean> = {};
    for (const m of chess.moves({ square: selected as JsSquare, verbose: true })) {
      map[m.to] = !!m.captured;
    }
    return map;
  }, [selected, status, busy, solverColor, turn, fen]);

  const checkSquare = useMemo(() => {
    const chess = new Chess(fen);
    if (!chess.inCheck()) return null;
    for (const row of chess.board()) {
      for (const piece of row) {
        if (piece && piece.type === 'k' && piece.color === chess.turn()) return piece.square;
      }
    }
    return null;
  }, [fen]);

  /** Показать решение: сброс и автопроигрывание всей линии. */
  const showSolution = () => {
    clearTimer();
    chessRef.current = new Chess(puzzle.fen);
    setFen(puzzle.fen);
    setPlies(0);
    setLastMove(null);
    setSelected(null);
    setBusy(false);
    setStatus('shown');
    setHintShown(false);
    const play = (i: number) => {
      if (i >= puzzle.solution.length) return;
      timerRef.current = window.setTimeout(
        () => {
          const chess = chessRef.current;
          try {
            chess.move(puzzle.solution[i]);
          } catch {
            return;
          }
          syncFromBoard();
          if (chess.inCheck()) sounds.check();
          else if (chess.history({ verbose: true })[chess.history().length - 1]?.captured) sounds.capture();
          else sounds.move();
          play(i + 1);
        },
        i === 0 ? 250 : 750,
      );
    };
    play(0);
  };

  /** Заново: возврат к исходной позиции задачи. */
  const retry = () => {
    clearTimer();
    chessRef.current = new Chess(puzzle.fen);
    budgetRef.current = solverMovesOf(puzzle);
    onScriptRef.current = true;
    setFen(puzzle.fen);
    setPlies(0);
    setLastMove(null);
    setMistakes(0);
    setStatus('solving');
    setHintShown(false);
    setSelected(null);
    setBusy(false);
  };

  // «Следующая» — первая нерешённая после текущей, по кругу.
  const nextPuzzle = useMemo(() => {
    const idx = PUZZLES.findIndex((p) => p.id === puzzle.id);
    const solvedMap = usePuzzleProgress.getState().solved;
    for (let step = 1; step <= PUZZLES.length; step++) {
      const cand = PUZZLES[(idx + step) % PUZZLES.length];
      if (solvedMap[cand.id] === undefined) return cand;
    }
    return PUZZLES[(idx + 1) % PUZZLES.length];
  }, [puzzle]);

  const goalText = goalTextOf(puzzle, t);

  const statusLine = (() => {
    if (status === 'solved') return t('pSolved');
    if (status === 'shown') return t('pSolutionShown');
    if (busy) return t('botTurn');
    if (wrong) return t('pWrong');
    if (mistakes > 0) return format(t('pMistakes'), { n: mistakes });
    return t('yourTurn');
  })();

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 lg:flex-row lg:gap-4 lg:p-3">
      <div className="flex min-h-0 flex-1 items-stretch justify-center gap-2 px-2 pt-1 lg:px-0">
        <div className="flex min-h-0 w-full flex-1 flex-col">
          <BoardView
            id="puzzle-board"
            fen={fen}
            orientation={solverColor === 'w' ? 'white' : 'black'}
            theme={boardThemeByKey(settings.boardTheme)}
            animate={settings.animate}
            interactive={status === 'solving' && !busy && turn === solverColor}
            lastMove={lastMove}
            checkSquare={checkSquare}
            selected={selected}
            targets={targets}
            onSquareTap={onSquareTap}
            onMoveAttempt={(from, to) => attemptSolverMove(from, to)}
          />
        </div>
      </div>
      <aside className="flex max-h-[55%] w-full flex-col gap-2 rounded-xl bg-white p-3 shadow-sm dark:bg-gray-800 sm:p-4 lg:max-h-none lg:w-80">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            className="self-start text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            onClick={onBack}
          >
            {t('pBackToCatalog')}
          </button>
          <span className="text-xs" title={t('pDifficulty')}>
            {'★'.repeat(puzzle.difficulty)}
          </span>
        </div>
        <div>
          <h2 className="font-semibold">{puzzle.title[settings.lang]}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t(THEME_LABEL_KEY[puzzle.theme])} · {goalText}
            {solverColor === 'b' && ` · ${t('blackToMove')}`}
          </p>
        </div>
        <div
          className={`rounded-lg p-2 text-sm font-medium ${
            status === 'solved'
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100'
              : wrong
                ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-100'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
          }`}
          role="status"
        >
          {status === 'solved' ? `🎉 ${statusLine}` : statusLine}
        </div>
        {hintShown && status === 'solving' && (
          <div className="rounded-lg bg-emerald-50 p-2 text-xs leading-5 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            💡 {puzzle.hint[settings.lang]}
          </div>
        )}
        {/* Линию решения показываем только после решения/показа — иначе это спойлер. */}
        {status !== 'solving' && (
          <div className="mono thin-scroll min-h-0 flex-1 overflow-y-auto pr-1 text-sm leading-7">
            {puzzle.solution.map((san, i) => (
              <span key={i} className="mr-2 whitespace-nowrap">
                {i % 2 === 0 && <span className="mr-0.5 text-gray-400">{i / 2 + 1}.</span>}
                <span className={i < plies ? '' : 'opacity-40'}>{san}</span>
              </span>
            ))}
          </div>
        )}
        <div className={`grid gap-1 ${status === 'solving' ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {status === 'solving' && (
            <button type="button" className="btn px-0 text-xs" onClick={() => setHintShown(true)}>
              💡 {t('pShowHint')}
            </button>
          )}
          <button type="button" className="btn px-0 text-xs" onClick={showSolution}>
            👁 {t('pShowSolution')}
          </button>
          <button type="button" className="btn px-0 text-xs" onClick={retry}>
            ↺ {t('pRetry')}
          </button>
        </div>
        <button type="button" className="btn-primary" onClick={() => onPickNext(nextPuzzle)}>
          ▶ {t('pNextPuzzle')}
        </button>
      </aside>
    </div>
  );
}
