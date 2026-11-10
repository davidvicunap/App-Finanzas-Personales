/**
 * KIT DE INTERFAZ
 * Piezas genéricas usadas en Plan, Patrimonio y la bienvenida:
 * hoja modal, campos, pestañas, barras de progreso y gráfico de líneas.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useApp } from '../context';
import { parseAmount, type Cents, type CurrencyCode } from '../../domain/money';
import { IconClose } from '../icons';

/* ------------------------------ Hoja modal ------------------------------ */

/** Ventana modal (hoja inferior en móvil). Escape o tocar fuera la cierran. */
export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const { t } = useApp();
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    // Foco en el primer campo de la hoja.
    const id = window.setTimeout(() => ref.current?.querySelector<HTMLElement>('input, select, button:not(.modal-close)')?.focus(), 60);
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, []);
  return (
    <div className="backdrop open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label={t('form.close')}>
            <IconClose />
          </button>
        </div>
        {children}
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  );
}

/* -------------------------------- Campos -------------------------------- */

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

/**
 * Campo de dinero: acepta "12,50" o "1,234.56" y muestra debajo cómo se leyó.
 * `value` es el texto tal como se escribe; usa parseAmount() al guardar.
 */
export function MoneyField({
  label,
  value,
  onChange,
  currency,
  hint,
  allowNegative = false,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  currency?: CurrencyCode;
  hint?: string;
  allowNegative?: boolean;
  autoFocus?: boolean;
}) {
  const { money, t } = useApp();
  const id = useId();
  const parsed = parseSigned(value, allowNegative);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="mono"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={value !== '' && parsed === null}
      />
      <div className="field-hint mono">
        {value === '' ? (hint ?? '') : parsed === null ? t('form.invalidAmount') : money(parsed, currency, { cents: 'always' })}
      </div>
    </div>
  );
}

/** Como parseAmount, pero acepta un "-" inicial si `allowNegative`. */
export function parseSigned(text: string, allowNegative = false): Cents | null {
  const s = text.trim();
  if (allowNegative && s.startsWith('-')) {
    const v = parseAmount(s.slice(1));
    return v === null ? null : -v;
  }
  return parseAmount(s);
}

/* ------------------------------- Pestañas ------------------------------- */

/** Pestañas en forma de control segmentado. */
export function Tabs<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------- Barra de progreso --------------------------- */

/** Barra 0–100 %. El color indica el estado: verde bien, ámbar cuidado, rojo pasado. */
export function Progress({ ratio, status = 'ok', label }: { ratio: number; status?: 'ok' | 'warning' | 'over' | 'brand'; label?: string }) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div className={`progress ${status}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/* --------------------------- Gráfico de líneas --------------------------- */

export interface LineSeries {
  label: string;
  color: string;
  values: number[];
  dashed?: boolean;
}

/**
 * Gráfico de líneas simple en SVG. `labels` son las etiquetas del eje X
 * (se muestran solo algunas para no saturar).
 */
export function LineChart({ series, labels, format, height = 180 }: { series: LineSeries[]; labels: string[]; format: (v: number) => string; height?: number }) {
  const w = 600;
  const h = height;
  const pad = { l: 8, r: 8, t: 12, b: 24 };
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all, 1);
  const min = Math.min(...all, 0);
  const n = Math.max(...series.map((s) => s.values.length), 2);
  const x = (i: number) => pad.l + (i / (n - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min || 1)) * (h - pad.t - pad.b);
  const step = Math.max(1, Math.ceil(labels.length / 6));
  return (
    <div className="line-chart">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={series.map((s) => `${s.label}: ${format(s.values.at(-1) ?? 0)}`).join(', ')}>
        <line x1={pad.l} x2={w - pad.r} y1={y(0)} y2={y(0)} className="axis" />
        {series.map((s) => (
          <polyline
            key={s.label}
            fill="none"
            stroke={s.color}
            strokeWidth="2.5"
            strokeDasharray={s.dashed ? '6 5' : undefined}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
          />
        ))}
      </svg>
      <div className="line-labels" aria-hidden="true">
        {labels.map((l, i) => (
          <span key={i} style={{ left: `${(x(i) / w) * 100}%` }}>
            {i % step === 0 || i === labels.length - 1 ? l : ''}
          </span>
        ))}
      </div>
      <div className="legend">
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} /> {s.label} <b className="mono">{format(s.values.at(-1) ?? 0)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Lista de barras horizontales (para asignaciones y desgloses). */
export function BarList({ rows }: { rows: { key: string; label: ReactNode; value: string; share: number; color: string }[] }) {
  return (
    <div className="cat-list">
      {rows.map((r) => (
        <div className="cat-row bar-row" key={r.key}>
          <div className="cat-info">
            <div className="cat-name">{r.label}</div>
            <div className="cat-bar">
              <span style={{ width: `${(r.share * 100).toFixed(1)}%`, background: r.color }} />
            </div>
          </div>
          <div className="cat-vals">
            <div className="cat-amt mono">{r.value}</div>
            <div className="cat-pct">{(r.share * 100).toFixed(0)}%</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Tarjeta de un número grande con su etiqueta. */
export function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: 'income' | 'expense' | 'net'; sub?: ReactNode }) {
  return (
    <div className={`card stat ${tone ?? 'net'}`}>
      <div className="stat-head">
        <div className="k">{label}</div>
      </div>
      <div className="v mono">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
