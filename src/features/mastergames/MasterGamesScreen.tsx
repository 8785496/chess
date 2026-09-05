import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { BoardView } from '../../board/BoardView';
import { playersOf, searchGames, type MasterGame } from './masterGames';
import { boardThemeByKey, useSettings } from '../../stores/settings';
import { useGame } from '../../stores/game';
import { useT } from '../../i18n';

/** «1 партия / 2 партии / 5 партий», в английском просто game/games. */
function gamesLabel(count: number, lang: 'ru' | 'en'): string {
  if (lang === 'en') return `${count} ${count === 1 ? 'game' : 'games'}`;
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'партия' : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 'партии' : 'партий';
  return `${count} ${word}`;
}

export function MasterGamesScreen({ onPlayHere }: { onPlayHere: () => void }) {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MasterGame | null>(null);

  const list = useMemo(() => searchGames(query, lang), [query, lang]);

  if (selected) {
    return <GamePlayer game={selected} onBack={() => setSelected(null)} onPlayHere={onPlayHere} />;
  }

  return (
    <div className="thin-scroll h-full overflow-y-auto p-3 sm:p-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 flex items-center gap-2">
          <input
            className="select flex-1"
            placeholder={t('gamesSearch')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
          />
          <span className="whitespace-nowrap text-xs text-gray-500">{gamesLabel(list.length, lang)}</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {list.map((g) => (
            <button key={g.id} type="button" className="card text-left transition hover:shadow-md" onClick={() => setSelected(g)}>
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                    g.result === '1-0'
                      ? 'bg-gray-200 text-gray-800 dark:bg-gray-300'
                      : g.result === '0-1'
                        ? 'bg-gray-800 text-gray-100 dark:bg-gray-600'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                  }`}
                >
                  {g.result}
                </span>
                <span className="truncate font-semibold">{g.title[lang]}</span>
              </div>
              <div className="truncate text-sm text-gray-600 dark:text-gray-300">{playersOf(g, lang)}</div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                <span>
                  {g.year} · {lang === 'en' ? g.eventEn : g.event}
                </span>
                <span className="truncate">{g.opening[lang]}</span>
              </div>
            </button>
          ))}
        </div>
        {!list.length && <p className="py-8 text-center text-gray-400">—</p>}
      </div>
    </div>
  );
}

function GamePlayer({ game, onBack, onPlayHere }: { game: MasterGame; onBack: () => void; onPlayHere: () => void }) {
  const t = useT();
  const settings = useSettings();
  const lang = settings.lang;
  const moves = game.moves;
  const [ply, setPly] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [flip, setFlip] = useState(false);

  const { fen, lastMove } = useMemo(() => {
    const chess = new Chess();
    for (const san of moves.slice(0, ply)) {
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
    };
  }, [moves, ply]);

  // Комментарий ближайшего размеченного хода: держим подсказку на экране, пока идёт комбинация.
  const note = useMemo(() => {
    if (ply === 0) return game.intro;
    for (let i = ply - 1; i >= 0; i--) {
      const c = game.comments[String(i)];
      if (c) return c;
    }
    return null;
  }, [game, ply]);

  useEffect(() => {
    if (!autoplay || ply >= moves.length) return;
    const id = setTimeout(() => setPly((p) => Math.min(moves.length, p + 1)), 1400);
    return () => clearTimeout(id);
  }, [autoplay, ply, moves.length]);

  const toggleAutoplay = () => {
    if (!autoplay && ply >= moves.length) setPly(0);
    setAutoplay((v) => !v);
  };

  const step = (delta: number) => {
    setAutoplay(false);
    setPly((p) => Math.max(0, Math.min(moves.length, p + delta)));
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

  const rows: { no: number; white: string; whitePly: number; black: string | null; blackPly: number | null }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({
      no: i / 2 + 1,
      white: moves[i],
      whitePly: i + 1,
      black: i + 1 < moves.length ? moves[i + 1] : null,
      blackPly: i + 1 < moves.length ? i + 2 : null,
    });
  }

  const moveCell = (san: string | null, movePly: number | null) => {
    if (!san || !movePly) return null;
    return (
      <button
        type="button"
        className={`rounded px-1 py-0.5 ${
          movePly === ply
            ? 'bg-amber-400/90 font-semibold text-gray-900'
            : movePly < ply
              ? 'text-gray-700 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/10'
              : 'text-gray-300 dark:text-gray-600'
        }`}
        onClick={() => {
          setAutoplay(false);
          setPly(movePly);
        }}
      >
        {san}
      </button>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 lg:flex-row lg:gap-4 lg:p-3">
      <div className="flex min-h-0 flex-1 items-stretch justify-center gap-2 px-2 pt-1 lg:px-0">
        <div className="flex min-h-0 w-full flex-1 flex-col">
          <BoardView
            id="master-game-board"
            fen={fen}
            orientation={flip ? 'black' : 'white'}
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
      <aside className="flex max-h-[55%] w-full flex-col gap-2 rounded-xl bg-white p-3 shadow-sm dark:bg-gray-800 sm:p-4 lg:max-h-none lg:w-80">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="-my-1 rounded-lg px-1.5 py-2 text-lg text-gray-500 transition hover:bg-black/5 hover:text-gray-800 dark:hover:bg-white/10 dark:hover:text-gray-200"
            onClick={onBack}
          >
            {t('backToGames')}
          </button>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => setFlip((v) => !v)}
            aria-label={t('flip')}
            title={t('flip')}
          >
            ⇅
          </button>
        </div>
        <div>
          <h2 className="font-semibold">{game.title[lang]}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">{playersOf(game, lang)}</p>
          <p className="text-[11px] text-gray-400">
            {game.year} · {lang === 'en' ? game.eventEn : game.event} · {game.opening[lang]}
            {ply >= moves.length && (
              <span className="ml-1 font-bold text-gray-600 dark:text-gray-300">{game.result}</span>
            )}
          </p>
        </div>
        <div className="mono thin-scroll min-h-0 flex-1 overflow-y-auto pr-1 text-sm leading-7">
          {rows.map((row) => (
            <div key={row.no} className="inline-flex items-center whitespace-nowrap">
              <span className="mr-0.5 text-gray-400">{row.no}.</span>
              {moveCell(row.white, row.whitePly)}
              {moveCell(row.black, row.blackPly)}
            </div>
          ))}
        </div>
        {note && (
          <div className="rounded-lg bg-emerald-50 p-2 text-xs leading-5 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            💡 {note[lang]}
          </div>
        )}
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
