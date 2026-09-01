import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { BoardView } from '../../board/BoardView';
import { detectOpening, movesOf, searchOpenings, type Opening } from './openings';
import { boardThemeByKey, useSettings } from '../../stores/settings';
import { useGame } from '../../stores/game';
import { format, useT } from '../../i18n';

export function OpeningsScreen({ onPlayHere }: { onPlayHere: () => void }) {
  const t = useT();
  const settings = useSettings();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Opening | null>(null);

  const list = useMemo(() => searchOpenings(query, settings.lang), [query, settings.lang]);

  if (selected) {
    return <OpeningPlayer opening={selected} onBack={() => setSelected(null)} onPlayHere={onPlayHere} />;
  }

  return (
    <div className="thin-scroll h-full overflow-y-auto p-3 sm:p-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 flex items-center gap-2">
          <input
            className="select flex-1"
            placeholder={t('openingsSearch')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
          />
          <span className="whitespace-nowrap text-xs text-gray-500">
            {format(t('openingsCount'), { count: list.length })}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {list.map((o) => (
            <button
              key={`${o.eco}-${o.name}`}
              type="button"
              className="card text-left transition hover:shadow-md"
              onClick={() => setSelected(o)}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                  {o.eco}
                </span>
                <span className="truncate font-semibold">
                  {settings.lang === 'en' ? o.nameEn : o.name}
                </span>
              </div>
              <div className="mono truncate text-xs text-gray-500 dark:text-gray-400">{o.moves}</div>
              <div className="mt-1 text-[11px] text-gray-400">
                {format(t('openingMoves'), { count: movesOf(o).length })}
              </div>
            </button>
          ))}
        </div>
        {!list.length && <p className="py-8 text-center text-gray-400">—</p>}
      </div>
    </div>
  );
}

function OpeningPlayer({
  opening,
  onBack,
  onPlayHere,
}: {
  opening: Opening;
  onBack: () => void;
  onPlayHere: () => void;
}) {
  const t = useT();
  const settings = useSettings();
  const moves = useMemo(() => movesOf(opening), [opening]);
  const [ply, setPly] = useState(0);
  const [autoplay, setAutoplay] = useState(false);

  const { fen, lastMove, played } = useMemo(() => {
    const chess = new Chess();
    const playedMoves = moves.slice(0, ply);
    for (const san of playedMoves) {
      try {
        chess.move(san);
      } catch {
        break;
      }
    }
    const hist = chess.history({ verbose: true });
    const last = ply > 0 ? hist[hist.length - 1] : null;
    return {
      fen: chess.fen(),
      lastMove: last ? { from: last.from as string, to: last.to as string } : null,
      played: playedMoves,
    };
  }, [moves, ply]);

  const variation = useMemo(() => detectOpening(played), [played]);

  useEffect(() => {
    if (!autoplay || ply >= moves.length) return;
    const id = setTimeout(() => setPly((p) => Math.min(moves.length, p + 1)), 1100);
    return () => clearTimeout(id);
  }, [autoplay, ply, moves.length]);

  const toggleAutoplay = () => {
    if (!autoplay && ply >= moves.length) setPly(0);
    setAutoplay((v) => !v);
  };

  const playFromHere = () => {
    useGame.getState().newGame({
      mode: 'bot',
      fen,
      playerColor: fen.split(' ')[1] === 'w' ? 'w' : 'b',
      levelId: useSettings.getState().botLevelId,
    });
    onPlayHere();
  };

  const step = (delta: number) => {
    setAutoplay(false);
    setPly((p) => Math.max(0, Math.min(moves.length, p + delta)));
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 lg:flex-row lg:gap-4 lg:p-3">
      <div className="flex min-h-0 flex-1 items-stretch justify-center gap-2 px-2 pt-1 lg:px-0">
        <div className="flex min-h-0 w-full flex-1 flex-col">
          <BoardView
            id="opening-board"
            fen={fen}
            orientation="white"
            theme={boardThemeByKey(settings.boardTheme)}
            animate={settings.animate}
            interactive={false}
            lastMove={lastMove}
            checkSquare={null}
            selected={null}
            targets={{}}
            onSquareTap={() => undefined}
            onMoveAttempt={() => undefined}
          />
        </div>
      </div>
      <aside className="flex max-h-[45%] w-full flex-col gap-2 rounded-xl bg-white p-3 shadow-sm dark:bg-gray-800 sm:p-4 lg:max-h-none lg:w-80">
        <button type="button" className="self-start text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200" onClick={onBack}>
          {t('backToCatalog')}
        </button>
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              {opening.eco}
            </span>
            <h2 className="font-semibold">{settings.lang === 'en' ? opening.nameEn : opening.name}</h2>
          </div>
          {variation && variation.name !== opening.name && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('variation')}: {settings.lang === 'en' ? variation.nameEn : variation.name}
            </p>
          )}
        </div>
        <div className="mono thin-scroll min-h-0 flex-1 overflow-y-auto text-sm leading-6">
          {moves.map((san, i) => (
            <button
              key={i}
              type="button"
              className={`mr-1 rounded px-1 ${
                i < ply
                  ? i === ply - 1
                    ? 'bg-amber-400/90 font-semibold text-gray-900'
                    : 'text-gray-600 dark:text-gray-300'
                  : 'text-gray-300 dark:text-gray-600'
              }`}
              onClick={() => {
                setAutoplay(false);
                setPly(i + 1);
              }}
            >
              {i % 2 === 0 ? `${i / 2 + 1}.` : ''}
              {san}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-1">
          <button type="button" className="btn px-0" onClick={() => step(-Infinity)} aria-label={t('startOver')}>
            ⏮
          </button>
          <button type="button" className="btn px-0" onClick={() => step(-1)} aria-label={t('stepBack')}>
            ◀
          </button>
          <button
            type="button"
            className={`px-0 py-2 rounded-lg text-sm font-medium ${autoplay ? 'bg-amber-500 text-gray-900' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200'}`}
            onClick={toggleAutoplay}
            aria-label={t('autoplay')}
          >
            {autoplay ? '⏸' : '▶'}
          </button>
          <button type="button" className="btn px-0" onClick={() => step(1)} aria-label={t('stepForward')}>
            ▶
          </button>
          <button type="button" className="btn px-0" onClick={() => step(Infinity)} aria-label={t('toEnd')}>
            ⏭
          </button>
        </div>
        <button type="button" className="btn-primary" onClick={playFromHere}>
          ⚔ {t('playFromHere')}
        </button>
      </aside>
    </div>
  );
}
