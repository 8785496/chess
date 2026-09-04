import type { Chess } from 'chess.js';

/**
 * Может ли сторона, чей сейчас ход, заматовать не более чем за n своих ходов
 * при любом ответе соперника. Используется решателем задач: ход игрока в
 * матовой задаче принимается, если он сохраняет форсированный мат.
 */
export function canForceMate(chess: Chess, n: number): boolean {
  if (n <= 0) return false;
  for (const move of chess.moves()) {
    chess.move(move);
    let forced = chess.isCheckmate();
    if (!forced && !chess.isGameOver() && n > 1) {
      const replies = chess.moves();
      // Пустой список при не-матовой позиции — пат, ход не форсирует мат.
      forced = replies.length > 0;
      for (const reply of replies) {
        chess.move(reply);
        const ok = canForceMate(chess, n - 1);
        chess.undo();
        if (!ok) {
          forced = false;
          break;
        }
      }
    }
    chess.undo();
    if (forced) return true;
  }
  return false;
}
