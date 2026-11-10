/**
 * RESUMEN — responde: "¿cómo voy este mes?"
 * Lo importante (alertas y una acción sugerida), balance, tasa de ahorro,
 * ingresos/gastos vs. el mes anterior, tendencia de 6 meses, en qué se va el
 * dinero y cómo fue la semana. Se puede ver el hogar completo o por persona.
 */
import { useMemo } from 'react';
import { useApp } from '../context';
import { shiftMonth, today, type YearMonth } from '../../domain/dates';
import { byCategory, delta, inMonth, missingRates, monthlySeries, totals } from '../../domain/stats';
import { buildInsights, topAction, weekSummary, type ActionTarget, type Insight } from '../../domain/insights';
import { envelopes, goalProgress, monthProgress } from '../../domain/plan';
import { detectRecurring } from '../../domain/recurring';
import type { Id, Transaction } from '../../domain/types';
import type { MessageKey } from '../../i18n';
import { AnimatedMoney, DeltaPill, EmptyState, MonthNav, SectionTitle } from '../components/common';
import { CategoryBreakdown, IncomeExpenseBars, Sparkline } from '../components/charts';
import { IconAlert, IconArrowRight, IconSpark } from '../icons';

/** 'all' = todo el hogar; 'shared' = solo gastos compartidos; o el id de una persona. */
export type Who = 'all' | 'shared' | Id;

export function filterByWho(txs: readonly Transaction[], who: Who): Transaction[] {
  if (who === 'all') return [...txs];
  return txs.filter((t) => (who === 'shared' ? t.memberId === null : t.memberId === who));
}

interface Props {
  month: YearMonth;
  setMonth: (m: YearMonth) => void;
  who: Who;
  setWho: (w: Who) => void;
  goTo: (target: ActionTarget) => void;
}

export function Dashboard({ month, setMonth, who, setWho, goTo }: Props) {
  const app = useApp();
  const { t, settings, members, budgets, goals, accountValues, accountValueById, holdings, money, catName } = app;
  const transactions = useMemo(() => filterByWho(app.transactions, who), [app.transactions, who]);

  const view = useMemo(() => {
    const fx = settings;
    const monthTx = inMonth(transactions, month);
    return {
      monthTx,
      cur: totals(monthTx, fx),
      prev: totals(inMonth(transactions, shiftMonth(month, -1)), fx),
      series: monthlySeries(transactions, month, 6, fx),
      slices: byCategory(monthTx, fx),
      missing: missingRates(monthTx, fx),
    };
  }, [transactions, month, settings]);

  const { cur, prev, series, slices, missing } = view;

  const insights = useMemo(() => {
    const monthTx = inMonth(transactions, month);
    return buildInsights({
      transactions,
      month,
      today: today(),
      fx: settings,
      envelopes: envelopes(budgets, monthTx, settings, monthProgress(month, today())),
      recurring: detectRecurring(transactions, today(), settings, settings.dismissedRecurring),
      goals: goals.filter((g) => !g.archived).map((g) => goalProgress(g, today(), g.accountId ? (accountValueById.get(g.accountId)?.baseCents ?? null) : null)),
      accountValues,
      holdings,
      missingCurrencies: missing,
    }).filter((i) => i.code !== 'missing_fx'); // ese aviso ya se muestra arriba
  }, [transactions, month, settings, budgets, goals, accountValues, accountValueById, holdings, missing]);
  const action = topAction(insights);
  const week = useMemo(() => weekSummary(transactions, today(), settings), [transactions, settings]);

  /** Texto de un insight: formatea montos y nombres de categoría antes de traducir. */
  const insightText = (i: Insight) => {
    const params: Record<string, string | number> = { ...i.params };
    for (const k of i.moneyParams ?? []) params[k] = money(Number(params[k]));
    if (i.categoryParam) params[i.categoryParam] = catName(String(params[i.categoryParam]));
    return t(`insight.${i.code}` as MessageKey, params);
  };
  // Se trunca (no se redondea) para no exagerar: 99.75 % se muestra como 99 %, no 100 %.
  const ratePct = cur.savingsRate === null ? null : Math.trunc(cur.savingsRate * 100);

  return (
    <section className="view active">
      <div className="page-head">
        <div>
          <h1>{t('nav.dashboard')}</h1>
          <div className="sub">{cur.count === 1 ? t('dash.txCountOne') : t('dash.txCount', { n: cur.count })}</div>
        </div>
        <MonthNav month={month} onChange={setMonth} />
      </div>

      {members.length > 1 && (
        <div className="tabs tabs-sm" role="radiogroup" aria-label={t('dash.viewOf')}>
          {[{ id: 'all', name: t('dash.view.household') }, ...members.map((m) => ({ id: m.id, name: m.name })), { id: 'shared', name: t('tx.shared') }].map((o) => (
            <button key={o.id} role="radio" aria-checked={who === o.id} className={who === o.id ? 'on' : ''} onClick={() => setWho(o.id)}>
              {o.name}
            </button>
          ))}
        </div>
      )}

      {missing.length > 0 && (
        <div className="alert" role="alert">
          <IconAlert />
          <span>{t('dash.missingRate', { n: cur.unconverted, cur: missing.join(', ') })}</span>
        </div>
      )}

      <div className="hero">
        <div className="hero-main">
          <div className="eyebrow">{t('dash.balance')}</div>
          <div className={`balance mono${cur.netCents < 0 ? ' neg' : ''}`}>
            <AnimatedMoney cents={cur.netCents} />
          </div>
          <div className={`rate-badge${ratePct !== null && ratePct < 0 ? ' warn' : ''}`}>
            <span className="dot" /> {ratePct === null ? t('dash.noIncome') : t('dash.savingsRate', { pct: ratePct })}
          </div>
        </div>
        <div className="spark">
          <Sparkline values={series.map((p) => p.netCents)} />
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card stat income">
          <div className="stat-head">
            <div className="k">{t('dash.income')}</div>
            <DeltaPill delta={delta(cur.incomeCents, prev.incomeCents)} cur={cur.incomeCents} goodUp />
          </div>
          <AnimatedMoney className="v mono" cents={cur.incomeCents} />
        </div>
        <div className="card stat expense">
          <div className="stat-head">
            <div className="k">{t('dash.expenses')}</div>
            <DeltaPill delta={delta(cur.expenseCents, prev.expenseCents)} cur={cur.expenseCents} goodUp={false} />
          </div>
          <AnimatedMoney className="v mono" cents={cur.expenseCents} />
        </div>
        <div className="card stat net">
          <div className="stat-head">
            <div className="k">{t('dash.saved')}</div>
            <DeltaPill delta={delta(cur.netCents, prev.netCents)} cur={cur.netCents} goodUp />
          </div>
          <AnimatedMoney className="v mono" cents={cur.netCents} />
        </div>
      </div>

      {insights.length > 0 && (
        <>
          <SectionTitle>{t('dash.highlights')}</SectionTitle>
          <div className="card insights">
            {action?.action && (
              <button className="insight-action" onClick={() => goTo(action.action!)}>
                <span className="insight-action-k">
                  <IconSpark /> {t('dash.nextAction')}
                </span>
                <span className="insight-action-t">{t(`action.${action.code}` as MessageKey)}</span>
                <IconArrowRight />
              </button>
            )}
            <ul>
              {insights.slice(0, 5).map((i, idx) => (
                <li key={idx} className={`insight sev-${i.severity}`}>
                  <span className="insight-dot" aria-hidden="true" />
                  {insightText(i)}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <SectionTitle hint={t('dash.last7')}>{t('dash.week')}</SectionTitle>
      <div className="card week">
        <div>
          <div className="k">{t('dash.weekSpent')}</div>
          <div className="v mono">{money(week.spentCents)}</div>
        </div>
        <div className="week-meta">
          {week.changeRatio !== null && (
            <span className={`delta-pill ${week.changeRatio > 0.005 ? 'bad' : week.changeRatio < -0.005 ? 'good' : 'neutral'}`}>
              {week.changeRatio > 0 ? '↑' : '↓'} {Math.abs(Math.round(week.changeRatio * 100))}% {t('dash.vsPrevWeek')}
            </span>
          )}
          {week.topCategoryId && <span className="muted small">{t('dash.weekTop', { category: catName(week.topCategoryId), amount: money(week.topCategoryCents) })}</span>}
          {week.count === 0 && <span className="muted small">{t('dash.weekEmpty')}</span>}
        </div>
      </div>

      <SectionTitle hint={t('dash.last6')}>{t('dash.trend')}</SectionTitle>
      <IncomeExpenseBars points={series} current={month} />

      <SectionTitle>{t('dash.byCategory')}</SectionTitle>
      {slices.length ? (
        <CategoryBreakdown slices={slices} totalCents={cur.expenseCents} />
      ) : (
        <div className="card">
          <EmptyState title={t('dash.noExpenses')} hint={t('dash.noExpensesHint')} />
        </div>
      )}
    </section>
  );
}
