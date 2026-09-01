import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App';

registerSW({ immediate: true });

// Отладочный доступ из консоли (только dev).
if (import.meta.env.DEV) {
  void import('./stores/game').then((m) => {
    (window as unknown as Record<string, unknown>).__useGame = m.useGame;
  });
  void import('./stores/engine').then((m) => {
    (window as unknown as Record<string, unknown>).__useEngine = m.useEngine;
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
