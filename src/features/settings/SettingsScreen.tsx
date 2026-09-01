import { useState } from 'react';
import { BOARD_THEMES, useSettings, type Lang, type PlayerColorPref, type ReviewDepth, type ThemeMode } from '../../stores/settings';
import { BOT_LEVELS } from '../../engine/levels';
import { useHistory } from '../../stores/history';
import { useT } from '../../i18n';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      className={`relative h-6 w-11 rounded-full transition ${value ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'}`}
      onClick={() => onChange(!value)}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${value ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  );
}

export function SettingsScreen() {
  const t = useT();
  const s = useSettings();
  const history = useHistory();
  const [copied, setCopied] = useState<number | null>(null);

  return (
    <div className="thin-scroll h-full overflow-y-auto p-3 sm:p-4">
      <div className="mx-auto flex max-w-xl flex-col gap-3">
        <section className="card">
          <h2 className="mb-1 font-semibold">{t('settingsTitle')}</h2>
          <Row label={t('sLanguage')}>
            <select className="select" value={s.lang} onChange={(e) => s.set('lang', e.target.value as Lang)}>
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </Row>
          <Row label={t('sTheme')}>
            <select className="select" value={s.themeMode} onChange={(e) => s.set('themeMode', e.target.value as ThemeMode)}>
              <option value="system">{t('sThemeSystem')}</option>
              <option value="light">{t('sThemeLight')}</option>
              <option value="dark">{t('sThemeDark')}</option>
            </select>
          </Row>
          <Row label={t('sBoard')}>
            <div className="flex gap-1.5">
              {BOARD_THEMES.map((theme) => (
                <button
                  key={theme.key}
                  type="button"
                  title={s.lang === 'en' ? theme.nameEn : theme.nameRu}
                  aria-label={s.lang === 'en' ? theme.nameEn : theme.nameRu}
                  className={`h-7 w-7 overflow-hidden rounded border-2 ${
                    s.boardTheme === theme.key ? 'border-emerald-600' : 'border-transparent'
                  }`}
                  onClick={() => s.set('boardTheme', theme.key)}
                >
                  <span className="block h-3.5 w-7" style={{ background: theme.light }} />
                  <span className="block h-3.5 w-7" style={{ background: theme.dark }} />
                </button>
              ))}
            </div>
          </Row>
          <Row label={t('sSound')}>
            <Toggle value={s.sound} onChange={(v) => s.set('sound', v)} />
          </Row>
          <Row label={t('sShowEval')}>
            <Toggle value={s.showEval} onChange={(v) => s.set('showEval', v)} />
          </Row>
          <Row label={t('sAnimate')}>
            <Toggle value={s.animate} onChange={(v) => s.set('animate', v)} />
          </Row>
          <Row label={t('sBotLevel')}>
            <select
              className="select"
              value={s.botLevelId}
              onChange={(e) => s.set('botLevelId', Number(e.target.value))}
            >
              {BOT_LEVELS.map((l) => (
                <option key={l.id} value={l.id}>
                  {s.lang === 'en' ? l.nameEn : l.nameRu}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t('sColor')}>
            <select
              className="select"
              value={s.playerColor}
              onChange={(e) => s.set('playerColor', e.target.value as PlayerColorPref)}
            >
              <option value="white">{t('white')}</option>
              <option value="black">{t('black')}</option>
              <option value="random">{t('random')}</option>
            </select>
          </Row>
          <Row label={t('sReviewDepth')}>
            <select
              className="select"
              value={s.reviewDepth}
              onChange={(e) => s.set('reviewDepth', e.target.value as ReviewDepth)}
            >
              <option value="fast">{t('reviewFast')}</option>
              <option value="deep">{t('reviewDeep')}</option>
            </select>
          </Row>
          <button type="button" className="btn mt-2 w-full text-xs" onClick={() => s.reset()}>
            {t('sReset')}
          </button>
        </section>

        <section className="card">
          <h2 className="mb-1 font-semibold">{t('sHistory')}</h2>
          {!history.games.length && <p className="text-sm text-gray-400">{t('sHistoryEmpty')}</p>}
          <div className="thin-scroll max-h-64 overflow-y-auto">
            {history.games.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2 border-b border-gray-100 py-1.5 text-sm last:border-0 dark:border-gray-700">
                <div className="min-w-0">
                  <span className="mono mr-2 font-semibold">{g.result}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(g.date).toLocaleDateString()} · {g.levelName} · {Math.ceil(g.plies / 2)} х
                  </span>
                </div>
                <button
                  type="button"
                  className="btn px-2 py-1 text-xs"
                  onClick={() => {
                    void navigator.clipboard.writeText(g.pgn);
                    setCopied(g.id);
                    setTimeout(() => setCopied(null), 1200);
                  }}
                >
                  {copied === g.id ? t('copied') : 'PGN'}
                </button>
              </div>
            ))}
          </div>
          {history.games.length > 0 && (
            <button type="button" className="btn mt-2 w-full text-xs" onClick={() => history.clear()}>
              {t('sClearHistory')}
            </button>
          )}
        </section>

        <section className="card text-sm">
          <h2 className="mb-1 font-semibold">{t('sAbout')}</h2>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t('sAboutText')}</p>
          <p className="text-xs text-gray-400">{t('sInstallHint')}</p>
        </section>
      </div>
    </div>
  );
}
