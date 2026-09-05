import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { BoardView } from './BoardView';

const SQ = 50;

/**
 * jsdom does no layout, while dnd-kit finds the square under the pointer via
 * getBoundingClientRect - give the squares an 8x8 grid of SQ px each.
 */
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    // The dnd-kit droppable wrapper sits outside the square, so look both up and at the child.
    const el = (this.closest('[data-square]') ??
      this.querySelector(':scope > [data-square]')) as HTMLElement | null;
    const sq = el?.dataset.square;
    let x = 0;
    let y = 0;
    let w = 0;
    let h = 0;
    if (sq) {
      x = (sq.charCodeAt(0) - 97) * SQ;
      y = (8 - Number(sq[1])) * SQ;
      w = SQ;
      h = SQ;
    }
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) } as DOMRect;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** dnd-kit measures squares and updates drag state asynchronously (effects + rAF). */
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 40)));

/** Square center in the mocked grid coordinates. */
const center = (sq: string) => ({
  clientX: (sq.charCodeAt(0) - 97) * SQ + SQ / 2,
  clientY: (8 - Number(sq[1])) * SQ + SQ / 2,
});

const theme = { id: 'test', name: 'test', light: '#eee', dark: '#888' };

function setup() {
  const onSquareTap = vi.fn();
  const onMoveAttempt = vi.fn();
  const utils = render(
    <BoardView
      id="t"
      fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
      orientation="white"
      theme={theme as never}
      animate={false}
      interactive
      lastMove={null}
      checkSquare={null}
      selected={null}
      targets={{}}
      onSquareTap={onSquareTap}
      onMoveAttempt={onMoveAttempt}
    />,
  );
  const square = (sq: string) => utils.container.querySelector(`#t-square-${sq}`) as HTMLElement;
  const piece = (sq: string) => square(sq).querySelector('[data-piece]') as HTMLElement;
  return { onSquareTap, onMoveAttempt, square, piece };
}

describe('BoardView: тапы по клеткам', () => {
  it('клик мышью по фигуре даёт ровно один тап (click всплывает с фигуры на клетку)', () => {
    const { onSquareTap, piece } = setup();
    fireEvent.click(piece('e2'), { button: 0 });
    expect(onSquareTap).toHaveBeenCalledTimes(1);
    expect(onSquareTap).toHaveBeenCalledWith('e2');
  });

  it('клик по пустой клетке даёт один тап', () => {
    const { onSquareTap, square } = setup();
    fireEvent.click(square('e4'), { button: 0 });
    expect(onSquareTap).toHaveBeenCalledTimes(1);
    expect(onSquareTap).toHaveBeenCalledWith('e4');
  });

  it('тап на мобильном (touchstart/touchend на одной клетке) даёт один тап', () => {
    const { onSquareTap, piece } = setup();
    const el = piece('e2');
    fireEvent.touchStart(el, { touches: [center('e2')] });
    fireEvent.touchEnd(el, { changedTouches: [center('e2')] });
    expect(onSquareTap).toHaveBeenCalledTimes(1);
    expect(onSquareTap).toHaveBeenCalledWith('e2');
  });

  it('микро-перетаскивание на ту же клетку считается тапом, а не ходом', async () => {
    const { onSquareTap, onMoveAttempt, piece } = setup();
    const el = piece('e2');
    const c = center('e2');
    // The finger shifted beyond the threshold: dnd-kit activates a drag and drops the piece on its own square.
    fireEvent.pointerDown(el, { isPrimary: true, button: 0, ...c });
    fireEvent.touchStart(el, { touches: [c] });
    fireEvent.pointerMove(document, { clientX: c.clientX + 12, clientY: c.clientY });
    await settle();
    fireEvent.pointerUp(document, { clientX: c.clientX + 12, clientY: c.clientY });
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: c.clientX + 12, clientY: c.clientY }] });
    await settle();
    expect(onMoveAttempt).not.toHaveBeenCalled();
    expect(onSquareTap).toHaveBeenCalledTimes(1);
    expect(onSquareTap).toHaveBeenCalledWith('e2');
  });

  it('перетаскивание на другую клетку остаётся ходом', async () => {
    const { onSquareTap, onMoveAttempt, piece } = setup();
    const el = piece('e2');
    const from = center('e2');
    const to = center('e4');
    fireEvent.pointerDown(el, { isPrimary: true, button: 0, ...from });
    // The first move only activates the drag; subsequent moves update the coordinates.
    fireEvent.pointerMove(document, { clientX: from.clientX + 12, clientY: from.clientY });
    await settle();
    fireEvent.pointerMove(document, to);
    await settle();
    fireEvent.pointerUp(document, to);
    await settle();
    expect(onMoveAttempt).toHaveBeenCalledWith('e2', 'e4');
    expect(onSquareTap).not.toHaveBeenCalled();
  });

  it('сдвиг меньше порога не запускает перетаскивание, тап обрабатывает touchend', () => {
    const { onSquareTap, onMoveAttempt, piece } = setup();
    const el = piece('e2');
    const c = center('e2');
    fireEvent.pointerDown(el, { isPrimary: true, button: 0, ...c });
    fireEvent.touchStart(el, { touches: [c] });
    fireEvent.pointerMove(document, { clientX: c.clientX + 2, clientY: c.clientY + 1 });
    fireEvent.pointerUp(document, { clientX: c.clientX + 2, clientY: c.clientY + 1 });
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: c.clientX + 2, clientY: c.clientY + 1 }] });
    expect(onMoveAttempt).not.toHaveBeenCalled();
    expect(onSquareTap).toHaveBeenCalledTimes(1);
    expect(onSquareTap).toHaveBeenCalledWith('e2');
  });
});
