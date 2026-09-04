import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Chessboard } from 'react-chessboard';
import type { BoardTheme } from '../stores/settings';
import type { Square } from '../core/game';

export interface BoardArrow {
  from: Square;
  to: Square;
  color: string;
}

interface BoardViewProps {
  id: string;
  fen: string;
  orientation: 'white' | 'black';
  theme: BoardTheme;
  animate: boolean;
  interactive: boolean;
  lastMove: { from: Square; to: Square } | null;
  checkSquare: Square | null;
  selected: Square | null;
  /** Клетки-цели: значение true — взятие. */
  targets: Partial<Record<Square, boolean>>;
  arrows?: BoardArrow[];
  onSquareTap: (square: Square) => void;
  onMoveAttempt: (from: Square, to: Square) => void;
}

/** Квадратная область под доску: сторона = min(ширина, высота) контейнера. */
function useSquareSize<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState(480);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setSize(Math.floor(Math.min(rect.width, rect.height)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/**
 * Обёртка над react-chessboard: инкапсулирует API библиотеки, подсветки,
 * точки ходов, стрелки и превращение (диалог показывает родитель).
 */
export function BoardView({
  id,
  fen,
  orientation,
  theme,
  animate,
  interactive,
  lastMove,
  checkSquare,
  selected,
  targets,
  arrows,
  onSquareTap,
  onMoveAttempt,
}: BoardViewProps) {
  const [wrapRef, size] = useSquareSize<HTMLDivElement>();

  const squareStyles: Record<string, CSSProperties> = {};
  if (lastMove) {
    const hl = { background: 'rgba(255, 213, 79, 0.5)' };
    squareStyles[lastMove.from] = hl;
    squareStyles[lastMove.to] = hl;
  }
  if (checkSquare) {
    squareStyles[checkSquare] = {
      background: 'radial-gradient(circle, rgba(239, 83, 80, 0.9) 55%, rgba(239, 83, 80, 0.25) 70%)',
    };
  }
  if (selected) {
    squareStyles[selected] = { background: 'rgba(255, 213, 79, 0.75)' };
  }
  for (const [sq, isCapture] of Object.entries(targets)) {
    squareStyles[sq] = isCapture
      ? {
          background:
            'radial-gradient(circle, transparent 54%, rgba(21, 21, 21, 0.35) 57%, rgba(21, 21, 21, 0.35) 66%, transparent 69%)',
        }
      : { background: 'radial-gradient(circle, rgba(21, 21, 21, 0.28) 22%, transparent 25%)' };
  }

  return (
    <div ref={wrapRef} className="board-wrap flex min-h-0 w-full flex-1 items-start justify-center">
      <div style={{ width: size, height: size }}>
        <Chessboard
          options={{
            id,
            position: fen,
            boardOrientation: orientation,
            animationDurationInMs: animate ? 220 : 0,
            showAnimations: animate,
            allowDragging: interactive,
            canDragPiece: ({ square }) => interactive && square !== null,
            darkSquareStyle: { backgroundColor: theme.dark },
            lightSquareStyle: { backgroundColor: theme.light },
            squareStyles,
            arrows: (arrows ?? []).map((a) => ({
              startSquare: a.from,
              endSquare: a.to,
              color: a.color,
            })),
            onSquareClick: ({ square }) => onSquareTap(square),
            // Фигуры отрисованы отдельным слоем поверх клеток: клик по фигуре
            // не доходит до onSquareClick, поэтому дублируем обработку.
            onPieceClick: ({ square }) => {
              if (square !== null) onSquareTap(square);
            },
            onPieceDrop: ({ sourceSquare, targetSquare }) => {
              if (targetSquare === null) return false;
              if (sourceSquare === targetSquare) return false;
              onMoveAttempt(sourceSquare, targetSquare);
              return true;
            },
          }}
        />
      </div>
    </div>
  );
}
