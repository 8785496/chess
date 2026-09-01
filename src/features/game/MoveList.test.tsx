import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MoveList } from './MoveList';
import type { MoveRecord } from '../../core/game';
import type { ReviewItem } from '../../core/classification';

afterEach(cleanup);

const mk = (san: string, color: 'w' | 'b'): MoveRecord => ({
  san,
  from: 'e2',
  to: 'e4',
  color,
  fenAfter: '',
});

describe('MoveList', () => {
  const history = [mk('e4', 'w'), mk('e5', 'b'), mk('Nf3', 'w'), mk('Nc6', 'b')];

  it('рендерит пары ходов с номерами', () => {
    render(<MoveList history={history} viewPly={null} reviewItems={null} onPlyClick={() => undefined} />);
    const list = screen.getByTestId('move-list');
    expect(list).toHaveTextContent('1.');
    expect(list).toHaveTextContent('e4');
    expect(list).toHaveTextContent('Nf3');
    expect(list).toHaveTextContent('Nc6');
  });

  it('подсвечивает выбранный ply и обрабатывает клики', () => {
    const onClick = vi.fn();
    render(<MoveList history={history} viewPly={2} reviewItems={null} onPlyClick={onClick} />);
    fireEvent.click(screen.getByText('Nf3'));
    expect(onClick).toHaveBeenCalledWith(3);
  });

  it('показывает аннотации разбора', () => {
    const items = new Map<number, ReviewItem>([
      [3, { ply: 3, san: 'Nf3', lossCp: 320, cls: 'blunder', evalBefore: 30, evalAfter: -290, best: 'a2a3' }],
    ]);
    render(<MoveList history={history} viewPly={null} reviewItems={items} onPlyClick={() => undefined} />);
    const badge = screen.getByTitle(/blunder/);
    expect(badge).toHaveTextContent('??');
  });
});
