import { useEffect, useState } from 'react';
import { GameScreen } from './features/game/GameScreen';
import { OpeningsScreen } from './features/openings/OpeningsScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { useSettings } from './stores/settings';
import { engineManager } from './engine/manager';
import { useT } from './i18n';

export type Tab = 'game' | 'openings' | 'settings';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export default function App() {
  const t = useT();
  const themeMode = useSettings((s) => s.themeMode);
  const lang = useSettings((s) => s.lang);
  const [tab, setTab] = useState<Tab>('game');
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

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'game', label: t('tabGame'), icon: '♟' },
    { id: 'openings', label: t('tabOpenings'), icon: '📖' },
    { id: 'settings', label: t('tabSettings'), icon: '⚙' },
  ];

  return (
    <div className="app-safe flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 px-3 pb-1 pt-2">
        <h1 className="text-lg font-bold tracking-tight">♞ {t('appTitle')}</h1>
        {installEvent && (
          <button
            type="button"
            className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white"
            onClick={() => {
              void installEvent.prompt();
              setInstallEvent(null);
            }}
          >
            {t('install')}
          </button>
        )}
      </header>
      <nav className="mx-3 mb-2 grid grid-cols-3 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/10" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`rounded-lg px-2 py-1.5 text-sm font-medium transition ${
              tab === item.id
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
            onClick={() => setTab(item.id)}
          >
            <span className="mr-1">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <main className="min-h-0 flex-1 pb-1">
        {tab === 'game' && <GameScreen />}
        {tab === 'openings' && <OpeningsScreen onPlayHere={() => setTab('game')} />}
        {tab === 'settings' && <SettingsScreen />}
      </main>
    </div>
  );
}
