/**
 * RESUMEN — responde: "¿cómo voy este mes?"
 * Balance, tasa de ahorro, ingresos/gastos vs. el mes anterior, tendencia de
 * 6 meses y en qué categorías se va el dinero.
 */
import { useMemo } from 'react';
import { useApp } from '../context';
import { shiftMonth, type YearMonth } from '../../domain/dates';
import { byCategory, delta, inMonth, missingRates, monthlySeries, totals } from '../../domain/stats';
import { AnimatedMoney, DeltaPill, EmptyState, MonthNav, SectionTitle } from '../components/common';
import { CategoryBreakdown, IncomeExpenseBars, Sparkline } from '../components/charts';
import { IconAlert } from '../icons';

export function Dashboard({ month, setMonth }: { month: YearMonth; setMonth: (m: YearMonth) => void }) {
  const { t, transactions, settings } = useApp();

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
