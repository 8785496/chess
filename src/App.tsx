import { useEffect, useState } from 'react';
import { GameScreen } from './features/game/GameScreen';
import { HomeScreen } from './features/home/HomeScreen';
import { MasterGamesScreen } from './features/mastergames/MasterGamesScreen';
import { OpeningsScreen } from './features/openings/OpeningsScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { useSettings } from './stores/settings';
import { useGame } from './stores/game';
import { engineManager } from './engine/manager';
import { useT } from './i18n';

export type Tab = 'home' | 'games' | 'openings' | 'settings';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export default function App() {
  const t = useT();
  const themeMode = useSettings((s) => s.themeMode);
  const lang = useSettings((s) => s.lang);
  const [tab, setTab] = useState<Tab>('home');
  // Доска — отдельный экран поверх главной навигации: открывается с главного
  // экрана («Новая игра»/«Продолжить») и из «играть с этой позиции».
  const [inGame, setInGame] = useState(false);
  // Открыть экран партии сразу с диалогом разбора (партия из истории).
  const [reviewOnOpen, setReviewOnOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  // Тема: системная или явная.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = themeMode === 'dark' || (themeMode === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Промпт установки PWA.
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Прогрев движка в простое: WASM попадает в кэш SW → офлайн-игра после первого визита.
  useEffect(() => {
    const warm = () => engineManager.warmup();
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(warm, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(warm, 2500);
    return () => clearTimeout(id);
  }, []);

  const openGame = () => setInGame(true);

  // Разбор партии из истории: доска открывается с уже запущенным разбором.
  const openAnalysis = () => {
    setReviewOnOpen(true);
    setInGame(true);
  };

  // Новая партия с сохранёнными настройками (уровень бота, цвет).
  const startNewGame = () => {
    useGame.getState().newGame();
    setInGame(true);
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'home', label: t('tabHome'), icon: '🏠' },
    { id: 'games', label: t('tabGames'), icon: '🏆' },
    { id: 'openings', label: t('tabOpenings'), icon: '📖' },
    { id: 'settings', label: t('tabSettings'), icon: '⚙' },
  ];

  return (
    <div className="app-safe flex h-full flex-col">
      {inGame ? (
        <main className="min-h-0 flex-1">
          <GameScreen
            initialReviewOpen={reviewOnOpen}
            onBack={() => {
              setReviewOnOpen(false);
              setInGame(false);
            }}
          />
        </main>
      ) : (
        <>
          <main className="min-h-0 flex-1">
            {tab === 'home' && (
              <HomeScreen onNewGame={startNewGame} onResume={openGame} onAnalyze={openAnalysis} />
            )}
            {tab === 'games' && <MasterGamesScreen onPlayHere={openGame} />}
            {tab === 'openings' && <OpeningsScreen onPlayHere={openGame} />}
            {tab === 'settings' && <SettingsScreen />}
          </main>
          <nav
            className="flex shrink-0 border-t border-black/10 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-gray-800/95"
            role="tablist"
          >
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition ${
                  tab === item.id
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
                }`}
                onClick={() => setTab(item.id)}
              >
                <span className="text-xl leading-none">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </>
      )}
      {installEvent && (
        <button
          type="button"
          className={`fixed right-3 z-20 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg ${
            inGame
              ? 'bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]'
              : 'bottom-[calc(env(safe-area-inset-bottom)+3.75rem)]'
          }`}
          onClick={() => {
            void installEvent.prompt();
            setInstallEvent(null);
          }}
        >
          ⬇ {t('install')}
        </button>
      )}
    </div>
  );
}
