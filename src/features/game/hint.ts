import { Chess } from 'chess.js';
import type { AnalysisLine, AnalysisResult } from '../../engine/manager';
import { clampScore, formatCp, mateToCp } from '../../core/classification';
import { parseUciMove, type Square } from '../../core/game';
import { detectOpening } from '../openings/openings';

/** Сообщение подсказки: ключ i18n + параметры ({piece} — юникод-глиф фигуры). */
export interface HintMsg {
  key: string;
  params?: Record<string, string | number>;
}

/** Одна линия multipv в подсказке. */
export interface HintLine {
  from: Square;
  to: Square;
  san: string;
  /** Оценка от лица белых: «+0.3» или «#3» / «#-3» при мате. */
  evalText: string;
  /** Оценочная вероятность победы белых, 0..100 (логистическая, не гарантия). */
  winPct: number;
  /** Доля «выбора движка» среди показанных линий, 0..100 (softmax по оценкам). */
  sharePct: number;
  /** Ожидаемое продолжение после первого хода, с номерами ходов. */
  continuation: string;
}

export interface HintData {
  from: Square;
  to: Square;
  san: string;
  evalText: string;
  /** Мат по главной линии от лица белых (со знаком: минус — мат нам). */
  mateIn: number | null;
  winPct: number;
  /** Оценка главной линии в сантипешках от лица белых (для liveEval). */
  cp: number;
  /** Топ-линии multipv, лучшая первой (включая главную). */
  lines: HintLine[];
  threats: HintMsg[];
  reasons: HintMsg[];
  opening: { eco: string; name: string; nameEn: string } | null;
}

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
/** Чёрные глифы для фигур обеих сторон — одинаково читаются в светлой и тёмной теме. */
const PIECE_GLYPH: Record<string, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };

/** Резкость softmax «уверенности движка» (сантипешки). */
const SHARE_TEMPERATURE_CP = 60;

/** Логистическая оценка вероятности победы белых по оценке в сантипешках (формула Lichess). */
export function winPercent(whiteCp: number): number {
  const pct = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * whiteCp)) - 1);
  return Math.max(0, Math.min(100, pct));
}

/** Softmax по оценкам линий: насколько движок уверен, что эта линия лучшая. */
function sharePercents(whiteCps: number[]): number[] {
  if (!whiteCps.length) return [];
  const max = Math.max(...whiteCps);
  const weights = whiteCps.map((cp) => Math.exp((cp - max) / SHARE_TEMPERATURE_CP));
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => Math.round((100 * w) / sum));
  out[0] += 100 - out.reduce((a, b) => a + b, 0);
  return out;
}

function glyph(type: string): string {
  return PIECE_GLYPH[type] ?? type;
}

/** PV движка (uci-ходы) в SAN. Некорректный хвост отбрасывается. */
export function pvToSan(fen: string, pv: string[], maxPlies = 8): string[] {
  const chess = new Chess(fen);
  const sans: string[] = [];
  for (const uci of pv) {
    if (sans.length >= maxPlies) break;
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) break;
    const mv = parseUciMove(uci);
    try {
      sans.push(chess.move({ from: mv.from, to: mv.to, promotion: mv.promotion ?? 'q' }).san);
    } catch {
      break;
    }
  }
  return sans;
}

/** SAN-последовательность с номерами ходов: «1.e4 e5 2.Nf3» или «1...e5 2.Nf3». */
export function formatSanLine(fen: string, sans: string[]): string {
  const parts = fen.split(' ');
  let turn = parts[1] === 'b' ? 'b' : 'w';
  let num = Number(parts[5]) || 1;
  const tokens: string[] = [];
  for (const san of sans) {
    if (turn === 'w') {
      tokens.push(`${num}.${san}`);
      turn = 'b';
    } else {
      const prev = tokens[tokens.length - 1];
      if (prev?.startsWith(`${num}.`)) tokens[tokens.length - 1] = `${prev} ${san}`;
      else tokens.push(`${num}...${san}`);
      turn = 'w';
      num++;
    }
  }
  return tokens.join(' ');
}

/** Под ударом ли фигура: атакована и не защищена, либо защищена меньшей фигурой. */
function isHanging(chess: Chess, square: Square, owner: 'w' | 'b'): boolean {
  const piece = chess.get(square as never);
  if (!piece) return false;
  const enemy = owner === 'w' ? 'b' : 'w';
  const attackers = chess.attackers(square as never, enemy as never);
  if (!attackers.length) return false;
  const defenders = chess.attackers(square as never, owner as never);
  if (!defenders.length) return true;
  const minAttacker = Math.min(...attackers.map((s) => PIECE_VALUE[chess.get(s as never)?.type ?? 'p']));
  return minAttacker < PIECE_VALUE[piece.type];
}

function hangingSquares(chess: Chess, color: 'w' | 'b'): Square[] {
  const out: { square: Square; value: number }[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color === color && isHanging(chess, cell.square as Square, color)) {
        out.push({ square: cell.square as Square, value: PIECE_VALUE[cell.type] });
      }
    }
  }
  return out.sort((a, b) => b.value - a.value).map((x) => x.square);
}

/** Угрозы противника в позиции, где ходить будет противник (после нашего хода). */
function threatsAfter(chess: Chess): HintMsg[] {
  const out: HintMsg[] = [];
  const moves = chess.moves({ verbose: true });
  for (const m of moves) {
    chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    const mate = chess.isCheckmate();
    chess.undo();
    if (mate) {
      out.push({ key: 'threatMate1' });
      break;
    }
  }
  const us = chess.turn() === 'w' ? 'b' : 'w';
  const victims = new Map<Square, number>();
  for (const m of moves) {
    if (m.captured === undefined) continue;
    const value = PIECE_VALUE[m.captured];
    const prev = victims.get(m.to as Square);
    if (prev === undefined || value > prev) victims.set(m.to as Square, value);
  }
  const hanging = [...victims.entries()]
    .filter(([sq]) => isHanging(chess, sq, us))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
  for (const [sq] of hanging) {
    const piece = chess.get(sq as never);
    if (piece) out.push({ key: 'threatCapture', params: { piece: glyph(piece.type), square: sq } });
  }
  if (!out.length && moves.some((m) => m.san.includes('+'))) out.push({ key: 'threatCheck' });
  return out;
}

/**
 * Почему этот ход хорош: эвристики по SAN/метаданным хода и позициям до/после.
 * Порядок в массиве = приоритет; возвращается не более трёх причин.
 */
function explainMove(
  fenBefore: string,
  move: { from: Square; to: Square; promotion?: string },
  mateInStm: number | null,
): HintMsg[] {
  const before = new Chess(fenBefore);
  const after = new Chess(fenBefore);
  let applied;
  try {
    applied = after.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
  } catch {
    return [];
  }
  const us = before.turn() as 'w' | 'b';
  const enemy = us === 'w' ? 'b' : 'w';
  const msgs: HintMsg[] = [];

  if (mateInStm !== null && mateInStm > 0) msgs.push({ key: 'reasonMateIn', params: { n: mateInStm } });
  if (applied.promotion) msgs.push({ key: 'reasonPromote', params: { piece: glyph(applied.promotion) } });

  // Вилка: ходящая фигура атакует минимум две цели ценностью ≥ лёгкой фигуры.
  const moved = after.get(move.to as never);
  if (moved) {
    const targets: { type: string; value: number }[] = [];
    for (const row of after.board()) {
      for (const cell of row) {
        if (!cell || cell.color === us || PIECE_VALUE[cell.type] < 3) continue;
        if (after.attackers(cell.square, us).includes(move.to as never)) {
          targets.push({ type: cell.type, value: PIECE_VALUE[cell.type] });
        }
      }
    }
    targets.sort((a, b) => b.value - a.value);
    if (targets.length >= 2) {
      msgs.push({
        key: 'reasonFork',
        params: { piece1: glyph(targets[0].type), piece2: glyph(targets[1].type) },
      });
    }
  }

  if (applied.captured) {
    msgs.push({ key: 'reasonCapture', params: { piece: glyph(applied.captured), square: move.to } });
  }

  // Своя фигура была под ударом: либо уводим её, либо теперь защищаем.
  for (const sq of hangingSquares(before, us)) {
    if (sq === move.from) {
      const attacked = after.attackers(move.to as never, enemy).length > 0;
      const defended = after.attackers(move.to as never, us).length > 0;
      if (!attacked || defended) {
        const piece = before.get(sq as never);
        if (piece) msgs.push({ key: 'reasonEvade', params: { piece: glyph(piece.type), square: sq } });
        break;
      }
    } else if (after.attackers(sq as never, us).length > 0) {
      const piece = before.get(sq as never);
      if (piece) msgs.push({ key: 'reasonDefend', params: { piece: glyph(piece.type), square: sq } });
      break;
    }
  }

  if (after.inCheck()) msgs.push({ key: 'reasonCheck' });
  if (applied.san.startsWith('O-O-O')) msgs.push({ key: 'reasonCastleLong' });
  else if (applied.san.startsWith('O-O')) msgs.push({ key: 'reasonCastleShort' });

  const moveNumber = before.moveNumber();
  const backRank = us === 'w' ? '1' : '8';
  if (
    moveNumber <= 8 &&
    moved &&
    (moved.type === 'n' || moved.type === 'b') &&
    move.from[1] === backRank &&
    move.to[1] !== backRank
  ) {
    msgs.push({ key: 'reasonDevelop', params: { piece: glyph(moved.type) } });
  }
  if (moveNumber <= 5 && moved?.type === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(move.to)) {
    msgs.push({ key: 'reasonCenter' });
  }

  return msgs.slice(0, 3);
}

export interface BuildHintInput {
  fen: string;
  /** SAN-ходы, сыгранные к текущей позиции (для определения дебюта). */
  sanHistory: string[];
  analysis: AnalysisResult;
  maxLines?: number;
  maxPvPlies?: number;
}

/** Собирает расширенную подсказку из результата multipv-анализа движка. */
export function buildHintData(input: BuildHintInput): HintData | null {
  const { fen, sanHistory, analysis, maxLines = 3, maxPvPlies = 8 } = input;
  const stm = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const sign = stm === 'w' ? 1 : -1;
  const lines: AnalysisLine[] = analysis.lines.length
    ? analysis.lines
    : analysis.best
      ? [
          {
            depth: 0,
            multipv: 1,
            uci: analysis.best,
            cp: analysis.cp,
            mate: analysis.mate ?? undefined,
            pv: [analysis.best],
          },
        ]
      : [];
  const parsed = lines
    .map((line) => ({ line, move: parseUciMove(line.uci) }))
    .filter((x) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(x.line.uci))
    .slice(0, maxLines);
  if (!parsed.length) return null;

  // Оценки в info-строках даны с точки зрения сходящего — по ним и сортируем.
  const stmScoreOf = (line: AnalysisLine): number =>
    line.mate != null ? mateToCp(line.mate) : clampScore(line.cp ?? 0);
  const whiteCpOf = (line: AnalysisLine): number => stmScoreOf(line) * sign;
  parsed.sort((a, b) => stmScoreOf(b.line) - stmScoreOf(a.line));
  const shares = sharePercents(parsed.map((x) => stmScoreOf(x.line)));

  const built = parsed
    .map((x, i) => {
      const sans = pvToSan(fen, x.line.pv, maxPvPlies);
      if (!sans.length) return null;
      const after = new Chess(fen);
      try {
        after.move({ from: x.move.from, to: x.move.to, promotion: x.move.promotion ?? 'q' });
      } catch {
        return null;
      }
      const mateWhite = x.line.mate != null ? x.line.mate * sign : null;
      const cpW = whiteCpOf(x.line);
      const tail = sans.slice(1);
      const line: HintLine = {
        from: x.move.from,
        to: x.move.to,
        san: sans[0],
        evalText: mateWhite !== null ? `#${mateWhite}` : formatCp(cpW),
        winPct: mateWhite !== null ? (mateWhite > 0 ? 100 : 0) : winPercent(cpW),
        sharePct: shares[i],
        continuation: tail.length ? formatSanLine(after.fen(), tail) : '',
      };
      return { src: x, line };
    })
    .filter((x): x is { src: (typeof parsed)[number]; line: HintLine } => x !== null);
  const main = built[0];
  if (!main) return null;

  const mainMateStm = main.src.line.mate ?? null;
  const mateInWhite = mainMateStm !== null ? mainMateStm * sign : null;
  const mainCpW = whiteCpOf(main.src.line);

  // Ход главной линии уже применён выше без ошибок — позиция после него нужна для угроз.
  const afterMain = new Chess(fen);
  try {
    afterMain.move({
      from: main.line.from,
      to: main.line.to,
      promotion: main.src.move.promotion ?? 'q',
    });
  } catch {
    /* недостижимо: легальность хода проверена при построении линий */
  }

  return {
    from: main.line.from,
    to: main.line.to,
    san: main.line.san,
    evalText: main.line.evalText,
    mateIn: mateInWhite,
    winPct: main.line.winPct,
    cp: mainCpW,
    lines: built.map((x) => x.line),
    threats: threatsAfter(afterMain),
    reasons: explainMove(fen, main.src.move, mainMateStm),
    opening: detectOpening(sanHistory),
  };
}
