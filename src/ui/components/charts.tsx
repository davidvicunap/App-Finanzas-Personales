/**
 * GRÁFICOS
 * ========
 * Hechos a mano con SVG/CSS (sin librerías): ligeros y fáciles de modificar.
 * Colores con significado: verde = ingreso, rojo = gasto.
 */
import { useApp } from '../context';
import { formatMonth } from '../../domain/dates';
import type { MonthPoint, CategorySlice } from '../../domain/stats';

/** Mini línea de tendencia del ahorro mensual (en el héroe del resumen). */
export function Sparkline({ values }: { values: number[] }) {
  const w = 132;
  const h = 46;
  const pad = 4;
  const max = Math.max(...values.map(Math.abs), 1);
  const pts = values.map((v, i) => [
    pad + (i / Math.max(values.length - 1, 1)) * (w - 2 * pad),
    h / 2 - (v / max) * (h / 2 - pad),
  ]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]!.toFixed(1)} ${p[1]!.toFixed(1)}`).join(' ');
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const area = `${line} L ${last[0]!.toFixed(1)} ${h} L ${first[0]!.toFixed(1)} ${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="spg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".34" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={pad} y1={h / 2} x2={w - pad} y2={h / 2} stroke="rgba(255,255,255,.22)" strokeDasharray="2 3" />
      <path d={area} fill="url(#spg)" />
      <path d={line} stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3.4" fill="#fff" />
    </svg>
  );
}

/** Barras agrupadas ingresos vs. gastos por mes, con tooltip accesible por teclado. */
export function IncomeExpenseBars({ points, current }: { points: MonthPoint[]; current: string }) {
  const { money, locale, t } = useApp();
  const max = Math.max(...points.flatMap((p) => [p.incomeCents, p.expenseCents]), 1);
  const pct = (v: number) => (v ? Math.max((v / max) * 100, 2) : 0);
  return (
    <div className="card chart-wrap">
      <div className="bars" role="list">
        {points.map((p, i) => (
          <div
            key={p.month}
            className={`bar-col${p.month === current ? ' current' : ''}`}
            tabIndex={0}
            role="listitem"
            aria-label={`${formatMonth(p.month, locale)}: ${t('dash.income')} ${money(p.incomeCents)}, ${t('dash.expenses')} ${money(p.expenseCents)}`}
          >
            <div className="bar-tip" aria-hidden="true">
              <div className="tl">
                <i style={{ background: 'var(--income)' }} /> <b>{money(p.incomeCents)}</b>
              </div>
              <div className="tl">
                <i style={{ background: 'var(--expense)' }} /> <b>{money(p.expenseCents)}</b>
              </div>
            </div>
            <div className="bar-pair">
              <div className="bar inc" style={{ height: `${pct(p.incomeCents)}%`, animationDelay: `${i * 0.05}s` }} />
              <div className="bar exp" style={{ height: `${pct(p.expenseCents)}%`, animationDelay: `${i * 0.05}s` }} />
            </div>
            <div className="bar-label">{formatMonth(p.month, locale, 'short')}</div>
          </div>
        ))}
      </div>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--income)' }} /> {t('dash.income')}
        </span>
        <span>
          <i style={{ background: 'var(--expense)' }} /> {t('dash.expenses')}
        </span>
      </div>
    </div>
  );
}

// Paleta para categorías (distinguibles en claro y oscuro).
export const CATEGORY_COLORS = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316', '#84CC16', '#06B6D4', '#E11D48'];

/** Dona de gasto por categoría + lista con barras. Muestra las 6 mayores y agrupa el resto. */
export function CategoryBreakdown({ slices, totalCents }: { slices: CategorySlice[]; totalCents: number }) {
  const { money, catName, categoryById, t } = useApp();
  const colored = slices.map((s, i) => ({ ...s, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]! }));
  const segs = colored.slice(0, 6).map((s) => ({ frac: s.share, color: s.color }));
  const rest = colored.slice(6).reduce((sum, s) => sum + s.share, 0);
  if (rest > 0) segs.push({ frac: rest, color: 'var(--faint)' });

  const r = 52;
  const c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="card breakdown">
      <div className="donut-wrap">
        <svg viewBox="0 0 120 120" className="donut" aria-hidden="true">
          <circle r={r} cx="60" cy="60" fill="none" stroke="var(--surface-2)" strokeWidth="15" />
          {segs.map((s, i) => {
            const len = c * s.frac;
            const el = (
              <circle
                key={i}
                className="donut-seg"
                r={r}
                cx="60"
                cy="60"
                fill="none"
                stroke={s.color}
                strokeWidth="15"
                strokeDasharray={`${len.toFixed(2)} ${(c - len).toFixed(2)}`}
                strokeDashoffset={(-off).toFixed(2)}
                transform="rotate(-90 60 60)"
              />
            );
            off += len;
            return el;
          })}
          <text x="60" y="57" textAnchor="middle" className="donut-t">
            {money(totalCents, undefined, { compact: true })}
          </text>
          <text x="60" y="72" textAnchor="middle" className="donut-s">
            {t('dash.expenses')}
          </text>
        </svg>
      </div>
      <div className="cat-list">
        {colored.map((s) => {
          const cat = s.categoryId ? categoryById.get(s.categoryId) : undefined;
          return (
            <div className="cat-row" key={s.categoryId ?? 'none'}>
              <span className="cat-ic" style={{ background: `${s.color}22` }}>
                {cat?.emoji ?? '🧾'}
              </span>
              <div className="cat-info">
                <div className="cat-name">{catName(s.categoryId)}</div>
                <div className="cat-bar">
                  <span style={{ width: `${(s.share * 100).toFixed(1)}%`, background: s.color }} />
                </div>
              </div>
              <div className="cat-vals">
                <div className="cat-amt mono">{money(s.cents)}</div>
                <div className="cat-pct">{(s.share * 100).toFixed(0)}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
