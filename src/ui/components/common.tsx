/** Piezas pequeñas reutilizadas en varias pantallas. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../context';
import { currentMonth, formatMonth, shiftMonth, type YearMonth } from '../../domain/dates';
import type { Cents } from '../../domain/money';
import type { Delta } from '../../domain/stats';
import { IconChevronLeft, IconChevronRight, IconEmpty, IconPlus } from '../icons';

/** Selector de mes: ‹ noviembre de 2026 ›. Tocar el nombre vuelve al mes actual. */
export function MonthNav({ month, onChange }: { month: YearMonth; onChange: (ym: YearMonth) => void }) {
  const { t, locale } = useApp();
  const isCurrent = month === currentMonth();
  const shift = (d: number) => onChange(shiftMonth(month, d));
  return (
    <div className="month-nav">
      <button className="arrow" onClick={() => shift(-1)} aria-label={t('month.prev')}>
        <IconChevronLeft />
      </button>
      <button className={`label clickable${isCurrent ? '' : ' off'}`} onClick={() => onChange(currentMonth())}>
        {capitalize(formatMonth(month, locale))}
        <small>{t('month.backToToday')}</small>
      </button>
      <button className="arrow" onClick={() => shift(1)} aria-label={t('month.next')}>
        <IconChevronRight />
      </button>
    </div>
  );
}

/** "noviembre de 2026" → "Noviembre de 2026" (solo la primera letra). */
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function EmptyState({ title, hint, onAdd }: { title: string; hint?: string; onAdd?: () => void }) {
  const { t } = useApp();
  return (
    <div className="empty">
      <div className="empty-ic">
        <IconEmpty />
      </div>
      <p className="empty-t">{title}</p>
      {hint && <p className="empty-s">{hint}</p>}
      {onAdd && (
        <button className="btn btn-primary" onClick={onAdd}>
          <IconPlus /> {t('nav.add')}
        </button>
      )}
    </div>
  );
}

/** Píldora "↑ 12%" comparando con el mes anterior. `goodUp`: si subir es bueno. */
export function DeltaPill({ delta, cur, goodUp }: { delta: Delta | null; cur: Cents; goodUp: boolean }) {
  const { t } = useApp();
  if (!delta) return cur > 0 ? <span className="delta-pill neutral">{t('dash.new')}</span> : null;
  if (delta.direction === 'flat') return <span className="delta-pill neutral">{t('dash.same')}</span>;
  const up = delta.direction === 'up';
  const good = goodUp ? up : !up;
  return (
    <span className={`delta-pill ${good ? 'good' : 'bad'}`} title={t('dash.vsPrev')}>
      {up ? '↑' : '↓'} {Math.abs(delta.pct * 100).toFixed(0)}%
    </span>
  );
}

const prefersReduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Muestra un monto que "cuenta" hasta su valor al cambiar.
 * Los pasos intermedios se redondean a centavos enteros: nunca se muestra un float.
 */
export function AnimatedMoney({ cents, className }: { cents: Cents; className?: string }) {
  const { money } = useApp();
  const [shown, setShown] = useState(cents);
  const from = useRef(cents);

  useEffect(() => {
    const start = from.current;
    from.current = cents;
    if (prefersReduced() || start === cents) {
      setShown(cents);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 560);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(start + (cents - start) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [cents]);

  return <span className={className}>{money(shown)}</span>;
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <h2 className="section-title">
      {children} {hint && <span className="hint">{hint}</span>}
    </h2>
  );
}
