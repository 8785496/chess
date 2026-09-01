import { Chess } from 'chess.js';

export type Square = string;
export type Color = 'w' | 'b';

export interface MoveRecord {
  san: string;
  from: Square;
  to: Square;
  color: Color;
  captured?: boolean;
  promotion?: string;
  fenAfter: string;
}

export type GameStatus =
  | { kind: 'playing'; inCheck: boolean }
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'stalemate' }
  | { kind: 'draw'; reason: 'fifty' | 'repetition' | 'insufficient' | 'generic' };

export interface GameOverInfo {
  over: boolean;
  status: GameStatus;
  /** Технический результат для PGN: 1-0 / 0-1 / 1/2-1/2 / '*' */
  result: string;
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 1 1' as const;

export function createGame(fen?: string, moves?: string[]): Chess {
  const chess = fen ? new Chess(fen) : new Chess();
  if (moves) {
    for (const san of moves) {
      // По датасету дебютов: SAN из библиотеки может не иметь суффиксов +/-,
      // поэтому при ошибке повторяем попытку в нестрогом режиме через координаты.
      try {
        chess.move(san);
      } catch {
        const repaired = repairSan(chess, san);
        if (!repaired) throw new Error(`Illegal opening move: ${san} in position ${chess.fen()}`);
        chess.move(repaired);
      }
    }
  }
  return chess;
}

/** Пробует найти легальный ход, соответствующий SAN без обязательных суффиксов/уточнений. */
function repairSan(chess: Chess, san: string): { from: Square; to: Square; promotion?: string } | null {
  const clean = san.replace(/[+#!?]+$/, '');
  const piece = clean[0] === 'K' || clean[0] === 'Q' || clean[0] === 'R' || clean[0] === 'B' || clean[0] === 'N'
    ? clean[0]
    : 'P';
  const body = piece === 'P' ? clean : clean.slice(1);
  const promoMatch = body.match(/=([QRBN])$/);
  const promotion = promoMatch ? promoMatch[1].toLowerCase() : undefined;
  const destPart = promotion ? body.slice(0, -2) : body;
  const destRaw = destPart.match(/([a-h][1-8])$/);
  if (!destRaw) return null;
  const dest = destRaw[1];
  const capture = destPart.includes('x');
  const disamb = destPart.slice(0, destRaw.index).replace('x', '');
  for (const m of chess.moves({ verbose: true })) {
    if (m.to !== dest) continue;
    if (m.promotion !== promotion && !(m.promotion === undefined && promotion === undefined)) {
      if (m.promotion || promotion) continue;
    }
    if (piece !== 'P' && m.piece !== piece.toLowerCase()) continue;
    if (piece === 'P' && m.piece !== 'p') continue;
    if (capture && !m.captured) continue;
    if (disamb && disamb.match(/[a-h]/) && !m.from.includes(disamb)) continue;
    if (disamb && disamb.match(/[1-8]/) && !m.from.includes(disamb)) continue;
    return { from: m.from, to: m.to, promotion: m.promotion };
  }
  return null;
}

export function computeStatus(chess: Chess): GameOverInfo {
  const turn = chess.turn();
  const inCheck = chess.inCheck();
  if (chess.isCheckmate()) {
    return {
      over: true,
      result: turn === 'w' ? '0-1' : '1-0',
      status: { kind: 'checkmate', winner: turn === 'w' ? 'b' : 'w' },
    };
  }
  if (chess.isStalemate()) {
    return { over: true, result: '1/2-1/2', status: { kind: 'stalemate' } };
  }
  if (chess.isThreefoldRepetition()) {
    return { over: true, result: '1/2-1/2', status: { kind: 'draw', reason: 'repetition' } };
  }
  if (chess.isInsufficientMaterial()) {
    return { over: true, result: '1/2-1/2', status: { kind: 'draw', reason: 'insufficient' } };
  }
  if (chess.isDraw()) {
    return {
      over: true,
      result: '1/2-1/2',
      status: {
        kind: 'draw',
        reason: chess.isDrawByFiftyMoves?.() ? 'fifty' : 'generic',
      },
    };
  }
  return { over: false, result: '*', status: { kind: 'playing', inCheck } };
}

export function findCheckSquare(chess: Chess): Square | null {
  if (!chess.inCheck()) return null;
  const turn = chess.turn();
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color === turn && cell.type === 'k') return cell.square;
    }
  }
  return null;
}

export function toMoveRecord(chess: Chess, move: ReturnType<Chess['history']>[number]): MoveRecord {
  void chess;
  const m = move as {
    san: string;
    from: Square;
    to: Square;
    color: Color;
    captured?: string;
    promotion?: string;
  };
  return {
    san: m.san,
    from: m.from,
    to: m.to,
    color: m.color,
    captured: m.captured !== undefined,
    promotion: m.promotion,
    fenAfter: '',
  };
}

/** Нужно ли превращение для хода from→to в текущей позиции. */
export function needsPromotion(chess: Chess, from: Square, to: Square): boolean {
  const piece = chess.get(from as never);
  if (!piece || piece.type !== 'p') return false;
  const rank = to[1];
  return piece.color === 'w' ? rank === '8' : rank === '1';
}

/** UCI 'e2e4' / 'e7e8q' → {from,to,promotion}. */
export function parseUciMove(uci: string): { from: Square; to: Square; promotion?: string } {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

export function moveNumber(chess: Chess): number {
  return Math.floor(chess.history().length / 2) + 1;
}

/** FEN позиции перед ходом с номером ply (0 = начальная). */
export function fenBeforePly(fen0: string, movesSan: string[], ply: number): string {
  const chess = createGame(fen0, movesSan.slice(0, ply));
  return chess.fen();
}
