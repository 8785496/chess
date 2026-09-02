import { create } from 'zustand';
import { Chess } from 'chess.js';
import {
  computeStatus,
  createGame,
  findCheckSquare,
  needsPromotion,
  parseUciMove,
  START_FEN,
  type Color,
  type GameOverInfo,
  type MoveRecord,
  type Square,
} from '../core/game';
import { classifyMove, clampScore, mateToCp, type ReviewItem } from '../core/classification';
import { sounds } from '../core/sounds';
import { engineManager } from '../engine/manager';
import { getLevel } from '../engine/levels';
import { buildHintData, type HintData } from '../features/game/hint';
import { useSettings } from './settings';
import { useHistory } from './history';
import { t } from '../i18n';

export type GameMode = 'bot' | 'manual';
export type Orientation = 'white' | 'black';

export interface ReviewState {
  running: boolean;
  progress: number; // 0..1
  items: Map<number, ReviewItem>; // ключ — ply (1-based)
  evals: number[]; // белые cp по ply: 0 = старт, i = после i-го хода
  error: string | null;
}

export type { HintData };

export interface NewGameOpts {
  mode?: GameMode;
  playerColor?: Color; // цвет человека в режиме бота
  levelId?: number;
  fen?: string;
  moves?: string[]; // SAN начальных ходов (продолжение дебюта)
}

interface GameStore {
  gameId: number;
  mode: GameMode;
  playerColor: Color;
  levelId: number;
  startFen: string;
  chess: Chess;
  history: MoveRecord[];
  fen: string;
  turn: Color;
  over: GameOverInfo;
  lastMove: { from: Square; to: Square } | null;
  checkSquare: Square | null;
  orientation: Orientation;
  botThinking: boolean;
  pendingPromotion: { from: Square; to: Square } | null;
  viewPly: number | null;
  hint: HintData | null;
  hintLoading: boolean;
  liveEval: number | null; // cp от лица белых
  evalLoading: boolean;
  review: ReviewState | null;

  newGame: (opts?: NewGameOpts) => void;
  /** Попытка хода игроком (drag&drop или tap). Возвращает false, если ход нелегален. */
  tryUserMove: (from: Square, to: Square, promotion?: string) => boolean;
  /** Возвращает true, если для этого хода нужно выбрать фигуру превращения. */
  checkPromotion: (from: Square, to: Square) => boolean;
  cancelPromotion: () => void;
  undo: () => void;
  flip: () => void;
  setViewPly: (ply: number | null) => void;
  requestHint: () => Promise<void>;
  clearHint: () => void;
  startReview: () => Promise<void>;
  cancelReview: () => void;
  getGamePgn: () => string;
}

// Токены для отмены устаревших асинхронных операций движка.
let botToken = 0;
let evalToken = 0;
let reviewToken = 0;

function levelNameFor(levelId: number, lang: string): string {
  const lvl = getLevel(levelId);
  return lang === 'en' ? lvl.nameEn : lvl.nameRu;
}

export const useGame = create<GameStore>((set, get) => {
  /** Применяет ход к chess и обновляет производное состояние. */
  const applyMove = (from: Square, to: Square, promotion?: string): boolean => {
    const { chess } = get();
    let move;
    try {
      move = chess.move({ from, to, promotion: promotion ?? 'q' });
    } catch {
      return false;
    }
    const over = computeStatus(chess);
    const history: MoveRecord[] = [
      ...get().history,
      {
        san: move.san,
        from: move.from as Square,
        to: move.to as Square,
        color: move.color as Color,
        captured: move.captured !== undefined,
        promotion: move.promotion,
        fenAfter: chess.fen(),
      },
    ];
    set({
      history,
      fen: chess.fen(),
      turn: chess.turn() as Color,
      over,
      lastMove: { from: move.from as Square, to: move.to as Square },
      checkSquare: findCheckSquare(chess),
      viewPly: null,
      hint: null,
    });
    if (move.captured) sounds.capture();
    else sounds.move();
    if (over.over) {
      sounds.gameEnd();
      saveFinishedGame(get, set);
    } else if (over.status.kind === 'playing' && over.status.inCheck) {
      sounds.check();
    }
    return true;
  };

  const saveFinishedGame = (g: typeof get, _set: typeof set) => {
    const state = g();
    if (state.mode !== 'bot') return;
    useHistory.getState().add({
      date: new Date().toISOString(),
      pgn: state.getGamePgn(),
      result: state.over.result,
      levelName: levelNameFor(state.levelId, useSettings.getState().lang),
      playerColor: state.playerColor,
      plies: state.history.length,
    });
  };

  /** Ход бота с защитой от гонок (новая партия / откат во время «раздумья»). */
  const scheduleBotMove = (delayMs = 120) => {
    const state = get();
    if (state.mode !== 'bot' || state.over.over) return;
    if (state.turn === state.playerColor) return;
    const token = ++botToken;
    set({ botThinking: true });
    setTimeout(async () => {
      const cur = get();
      if (token !== botToken || cur.mode !== 'bot' || cur.over.over || cur.turn === cur.playerColor) {
        if (token === botToken) set({ botThinking: false });
        return;
      }
      const level = getLevel(cur.levelId);
      try {
        const best = await engineManager.bestMove(cur.fen, level);
        const after = get();
        if (token !== botToken || after.mode !== 'bot' || after.over.over) return;
        if (best) {
          const { from, to, promotion } = parseUciMove(best);
          applyMove(from, to, promotion);
        }
      } catch {
        // Движок недоступен — молча пропускаем (пользователь может продолжить вручную).
      } finally {
        if (token === botToken) set({ botThinking: false });
      }
    }, delayMs);
  };

  /** Живая оценка позиции (когда включена в настройках). */
  const scheduleLiveEval = () => {
    if (!useSettings.getState().showEval) return;
    const token = ++evalToken;
    set({ evalLoading: true });
    void (async () => {
      try {
        const fen = get().fen;
        const res = await engineManager.analyse(fen, { depth: 12, movetime: 800 });
        if (token !== evalToken) return;
        const cpAbs = res.mate !== null ? mateToCp(res.mate) : clampScore(res.cp);
        // Движок считает с точки зрения сходящего — переводим к перспективе белых.
        const stm = fen.split(' ')[1] === 'b' ? 'b' : 'w';
        set({ liveEval: stm === 'w' ? cpAbs : -cpAbs, evalLoading: false });
      } catch {
        if (token === evalToken) set({ evalLoading: false });
      }
    })();
  };

  const initial = (() => {
    const chess = createGame();
    return chess;
  })();

  return {
    gameId: 1,
    mode: 'bot',
    playerColor: 'w',
    levelId: useSettings.getState().botLevelId,
    startFen: START_FEN,
    chess: initial,
    history: [],
    fen: initial.fen(),
    turn: 'w',
    over: computeStatus(initial),
    lastMove: null,
    checkSquare: null,
    orientation: 'white',
    botThinking: false,
    pendingPromotion: null,
    viewPly: null,
    hint: null,
    hintLoading: false,
    liveEval: null,
    evalLoading: false,
    review: null,

    newGame: (opts = {}) => {
      botToken++;
      evalToken++;
      reviewToken++;
      engineManager.stop();
      const settings = useSettings.getState();
      const mode = opts.mode ?? 'bot';
      let playerColor = opts.playerColor ?? (settings.playerColor === 'random'
        ? Math.random() < 0.5 ? 'w' : 'b'
        : settings.playerColor === 'black' ? 'b' : 'w');
      const levelId = opts.levelId ?? settings.botLevelId;
      const moves = opts.moves ?? [];
      let chess: Chess;
      try {
        chess = createGame(opts.fen, moves);
      } catch {
        chess = createGame();
        opts = {};
      }
      if (mode === 'manual') playerColor = chess.turn() as Color;
      set({
        gameId: get().gameId + 1,
        mode,
        playerColor,
        levelId,
        startFen: chess.fen() === START_FEN && moves.length === 0 ? START_FEN : (opts.fen ?? START_FEN),
        chess,
        history: chess.history({ verbose: true }).map((m) => ({
          san: m.san,
          from: m.from as Square,
          to: m.to as Square,
          color: m.color as Color,
          captured: m.captured !== undefined,
          promotion: m.promotion,
          fenAfter: '',
        })),
        fen: chess.fen(),
        turn: chess.turn() as Color,
        over: computeStatus(chess),
        lastMove: null,
        checkSquare: findCheckSquare(chess),
        orientation: playerColor === 'b' ? 'black' : 'white',
        botThinking: false,
        pendingPromotion: null,
        viewPly: null,
        hint: null,
        liveEval: null,
        review: null,
      });
      // fenAfter для предзагруженных ходов
      if (moves.length) {
        const replay = createGame(opts.fen, moves);
        const history = get().history.map((h) => {
          replay.move(h.san);
          return { ...h, fenAfter: replay.fen() };
        });
        set({ history });
      }
      if (mode === 'bot' && chess.turn() !== playerColor && !computeStatus(chess).over) {
        scheduleBotMove(400);
      }
    },

    checkPromotion: (from, to) => needsPromotion(get().chess, from, to),

    tryUserMove: (from, to, promotion) => {
      const state = get();
      if (state.over.over || state.viewPly !== null) return false;
      if (state.mode === 'bot' && state.turn !== state.playerColor) return false;
      const ok = applyMove(from, to, promotion);
      if (ok) {
        scheduleLiveEval();
        scheduleBotMove();
      }
      return ok;
    },

    cancelPromotion: () => set({ pendingPromotion: null }),

    undo: () => {
      const state = get();
      if (!state.history.length) return;
      botToken++;
      engineManager.stop();
      set({ botThinking: false });
      const { chess } = state;
      // В режиме бота откатываем пару ходов, чтобы ход остался за игроком.
      let plies = 1;
      if (state.mode === 'bot' && state.history.length >= 2 && state.history[state.history.length - 1].color !== state.playerColor) {
        plies = 2;
      }
      for (let i = 0; i < plies && chess.history().length > 0; i++) chess.undo();
      const history = state.history.slice(0, state.history.length - plies);
      set({
        history,
        fen: chess.fen(),
        turn: chess.turn() as Color,
        over: computeStatus(chess),
        lastMove: history.length
          ? { from: history[history.length - 1].from, to: history[history.length - 1].to }
          : null,
        checkSquare: findCheckSquare(chess),
        viewPly: null,
        hint: null,
        review: null,
        liveEval: null,
      });
      scheduleLiveEval();
    },

    flip: () =>
      set((s) => ({ orientation: s.orientation === 'white' ? 'black' : 'white' })),

    setViewPly: (ply) => set({ viewPly: ply, hint: null }),

    requestHint: async () => {
      const state = get();
      if (state.hintLoading || state.over.over) return;
      set({ hintLoading: true });
      try {
        const fen = state.viewPly !== null ? fenAtPly(state, state.viewPly) : state.fen;
        const ply = state.viewPly ?? state.history.length;
        const sanHistory = state.history.slice(0, ply).map((h) => h.san);
        // multipv 3: три лучших линии — сам ход, альтернативы и прогноз продолжения.
        // Глубина снижена относительно старых 16, чтобы время ожидания не выросло.
        const res = await engineManager.analyse(fen, { depth: 14, movetime: 1500, multipv: 3 });
        if (!res.best) return;
        const data = buildHintData({ fen, sanHistory, analysis: res });
        if (!data) return;
        set({ hint: data, liveEval: data.cp });
      } finally {
        set({ hintLoading: false });
      }
    },

    clearHint: () => set({ hint: null }),

    startReview: async () => {
      const state = get();
      if (state.review?.running) return;
      if (state.mode === 'bot' && !state.over.over && state.turn !== state.playerColor) return;
      reviewToken++;
      const token = reviewToken;
      // Восстанавливаем позиции до/после каждого хода (ходы дописывает цикл ниже).
      const chess = createGame(state.startFen === START_FEN ? undefined : state.startFen);
      const fens: string[] = [chess.fen()];
      const evals: number[] = [0];
      const items = new Map<number, ReviewItem>();
      set({
        review: { running: true, progress: 0, items, evals, error: null },
        viewPly: null,
      });
      const settings = useSettings.getState();
      const depth = settings.reviewDepth === 'deep' ? 12 : 8;
      const movetime = settings.reviewDepth === 'deep' ? 1500 : 700;
      try {
        for (let ply = 1; ply <= state.history.length; ply++) {
          if (token !== reviewToken) return;
          chess.move(state.history[ply - 1].san);
          fens.push(chess.fen());
        }
        const playedMoves = state.history.map((h) => ({ from: h.from, to: h.to, san: h.san }));
        const scores: { cp: number; mate: number | null; best: string | null }[] = [];
        for (let i = 0; i < fens.length; i++) {
          if (token !== reviewToken) return;
          const r = await engineManager.evaluate(fens[i], depth, movetime);
          if (token !== reviewToken) return;
          const stm = colorOfFen(fens[i]);
          const cpFromStm = r.mate !== null ? mateToCp(r.mate) : clampScore(r.cp);
          scores.push({ cp: cpFromStm, mate: r.mate, best: r.best });
          evals[i] = stm === 'w' ? cpFromStm : -cpFromStm;
          set({ review: { running: true, progress: (i + 1) / fens.length, items, evals: [...evals], error: null } });
        }
        // На матовой позиции движок не даёт оценки — ставим условный максимум.
        if (state.over.over && state.over.status.kind === 'checkmate') {
          evals[fens.length - 1] = state.over.status.winner === 'w' ? 10000 : -10000;
          // С точки зрения сходящего (это проигравшая сторона) позиция безнадёжна.
          scores[scores.length - 1] = {
            cp: state.over.status.winner === 'w' ? -10000 : 10000,
            mate: null,
            best: null,
          };
        }
        // Классификация: потеря = score[i] + score[i+1] (обе с точки зрения сходящего).
        for (let ply = 1; ply <= playedMoves.length; ply++) {
          const before = scores[ply - 1];
          const after = scores[ply];
          const loss = Math.max(0, before.cp + after.cp);
          const isBest = !!before.best && sameMove(before.best, playedMoves[ply - 1]);
          const stmColor = colorOfFen(fens[ply - 1]);
          items.set(ply, {
            ply,
            san: playedMoves[ply - 1].san,
            lossCp: loss,
            cls: classifyMove(loss, isBest),
            evalBefore: stmColor === 'w' ? before.cp : -before.cp,
            evalAfter: stmColor === 'w' ? -after.cp : after.cp,
            best: before.best ?? '',
          });
        }
        set({ review: { running: false, progress: 1, items, evals: [...evals], error: null } });
      } catch (e) {
        set({
          review: {
            running: false,
            progress: 0,
            items,
            evals,
            error: e instanceof Error ? e.message : t('reviewError'),
          },
        });
      }
    },

    cancelReview: () => {
      reviewToken++;
      const r = get().review;
      if (r) set({ review: { ...r, running: false, error: null } });
    },

    getGamePgn: () => {
      const state = get();
      const level = getLevel(state.levelId);
      const chess = state.chess;
      chess.setHeader('Event', 'Chess PWA');
      chess.setHeader('Site', 'offline');
      chess.setHeader('Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'));
      chess.setHeader('Round', '-');
      if (state.startFen !== START_FEN) {
        chess.setHeader('SetUp', '1');
        chess.setHeader('FEN', state.startFen);
      }
      if (state.mode === 'bot') {
        chess.setHeader('White', state.playerColor === 'w' ? 'Player' : `Bot (${level.nameEn})`);
        chess.setHeader('Black', state.playerColor === 'b' ? 'Player' : `Bot (${level.nameEn})`);
      } else {
        chess.setHeader('White', 'White');
        chess.setHeader('Black', 'Black');
      }
      chess.setHeader('Result', state.over.result);
      return chess.pgn({ maxWidth: 72, newline: '\n' });
    },
  };
});

function colorOfFen(fen: string): Color {
  return (fen.split(' ')[1] as Color) ?? 'w';
}

function sameMove(uci: string, played: { from: Square; to: Square }): boolean {
  return uci.startsWith(played.from + played.to);
}

export { formatCp } from '../core/classification';

/** FEN позиции на выбранном ply (0 = начальная, null = текущая). */
export function fenAtPly(state: { startFen: string; history: MoveRecord[] }, ply: number): string {
  if (ply <= 0) return state.startFen;
  const rec = state.history[ply - 1];
  if (rec?.fenAfter) return rec.fenAfter;
  const chess = createGame(state.startFen === START_FEN ? undefined : state.startFen);
  for (let i = 0; i < ply && i < state.history.length; i++) chess.move(state.history[i].san);
  return chess.fen();
}
