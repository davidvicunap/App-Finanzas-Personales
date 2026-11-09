/**
 * ESTRUCTURA DE LA APP
 * Barra lateral (escritorio) o barra inferior + botón flotante (móvil),
 * las tres pantallas y el formulario de registro rápido.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { AppProvider, useApp } from './ui/context';
import { currentMonth, monthOf, shiftMonth, type YearMonth } from './domain/dates';
import type { Transaction } from './domain/types';
import { db } from './data/db';
import * as repo from './data/repo';
import { Dashboard } from './ui/views/Dashboard';
import { Transactions } from './ui/views/Transactions';
import { Settings } from './ui/views/Settings';
import { QuickAdd } from './ui/QuickAdd';
import { applyTheme, resolveTheme } from './ui/theme';
import { IconDashboard, IconList, IconMoon, IconPlus, IconSettings, IconSun, Logo } from './ui/icons';

type View = 'dashboard' | 'transactions' | 'settings';

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { t, settings } = useApp();
  const [view, setView] = useState<View>('dashboard');
  const [month, setMonth] = useState<YearMonth>(currentMonth());
  // undefined = formulario cerrado; null = nuevo; Transaction = editar
  const [editing, setEditing] = useState<Transaction | null | undefined>(undefined);

  // Tema e idioma del documento.
  useEffect(() => {
    applyTheme(settings.theme);
    document.documentElement.lang = settings.locale;
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (settings.theme !== 'system' || !mq) return;
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [settings.theme, settings.locale]);

  // Atajos de teclado: N = nuevo, ←/→ = cambiar de mes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing !== undefined || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(input|select|textarea)$/i.test((e.target as HTMLElement).tagName)) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setEditing(null);
      } else if (e.key === 'ArrowLeft') setMonth((m) => shiftMonth(m, -1));
      else if (e.key === 'ArrowRight') setMonth((m) => shiftMonth(m, 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editing]);

  const go = (v: View) => {
    setView(v);
    window.scrollTo(0, 0);
  };
  const isDark = resolveTheme(settings.theme) === 'dark';
  const toggleTheme = () => void repo.updateSettings(db, { theme: isDark ? 'light' : 'dark' });

  const nav: { id: View; label: string; icon: ReactElement }[] = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: <IconDashboard /> },
    { id: 'transactions', label: t('nav.transactions'), icon: <IconList /> },
    { id: 'settings', label: t('nav.settings'), icon: <IconSettings /> },
  ];

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <Logo /> {t('app.name')}
        </div>
        <button className="icon-btn" onClick={toggleTheme} aria-label={t('nav.theme')}>
          <span className="theme-ic">{isDark ? <IconSun /> : <IconMoon />}</span>
        </button>
      </header>

      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <Logo /> {t('app.name')}
          </div>
          <nav aria-label={t('app.name')}>
            {nav.map((n) => (
              <button key={n.id} className={`nav-btn${view === n.id ? ' active' : ''}`} onClick={() => go(n.id)} aria-current={view === n.id ? 'page' : undefined}>
                {n.icon} {n.label}
              </button>
            ))}
          </nav>
          <div className="side-foot">
            <button className="ghost-row" onClick={toggleTheme}>
              <span className="theme-ic">{isDark ? <IconSun /> : <IconMoon />}</span> {t('nav.theme')}
            </button>
            <button className="btn btn-primary" onClick={() => setEditing(null)}>
              <IconPlus /> {t('nav.add')}
            </button>
          </div>
        </aside>

        <main>
          {view === 'dashboard' && <Dashboard month={month} setMonth={setMonth} />}
          {view === 'transactions' && <Transactions month={month} setMonth={setMonth} onEdit={setEditing} onAdd={() => setEditing(null)} />}
          {view === 'settings' && <Settings />}
        </main>
      </div>

      <button className="fab" onClick={() => setEditing(null)} aria-label={t('nav.add')}>
        <IconPlus />
      </button>

      <nav className="tabbar" aria-label={t('app.name')}>
        <div className="tabbar-inner">
          {nav.map((n) => (
            <button key={n.id} className={`tab${view === n.id ? ' active' : ''}`} onClick={() => go(n.id)} aria-current={view === n.id ? 'page' : undefined}>
              {n.icon}
              {n.label}
            </button>
          ))}
        </div>
      </nav>

      {editing !== undefined && (
        <QuickAdd
          editing={editing}
          onClose={() => setEditing(undefined)}
          onSaved={(date) => {
            setMonth(monthOf(date)); // saltar al mes del movimiento guardado
            setEditing(undefined);
          }}
        />
      )}
    </>
  );
}
