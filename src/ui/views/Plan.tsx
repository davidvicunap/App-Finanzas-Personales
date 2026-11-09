/**
 * PLAN — responde: "¿voy dentro de lo que planeé?"
 * Tres pestañas: Presupuesto (sobres o 50/30/20), Metas de ahorro y Recurrentes.
 */
import { useMemo, useState } from 'react';
import { useApp } from '../context';
import { db } from '../../data/db';
import * as repo from '../../data/repo';
import { centsToInput, parseAmount, type Cents } from '../../domain/money';
import { formatDay, today, type YearMonth } from '../../domain/dates';
import { inMonth } from '../../domain/stats';
import { envelopes, fiftyThirtyTwenty, goalProgress, monthProgress, type Bucket } from '../../domain/plan';
import { detectRecurring, recurringMonthlyTotal } from '../../domain/recurring';
import { categoryAverages, recentAverages } from '../../domain/insights';
import type { BudgetGroup, Goal, Id } from '../../domain/types';
import { EmptyState, MonthNav, SectionTitle } from '../components/common';
import { Field, MoneyField, Progress, Sheet, Tabs } from '../components/kit';
import { IconPlus } from '../icons';

type Tab = 'budget' | 'goals' | 'recurring';

export function Plan({ month, setMonth, initialTab = 'budget' }: { month: YearMonth; setMonth: (m: YearMonth) => void; initialTab?: Tab }) {
  const { t } = useApp();
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <section className="view active">
      <div className="page-head">
        <div>
          <h1>{t('nav.plan')}</h1>
          <div className="sub">{t('plan.subtitle')}</div>
        </div>
        {tab === 'budget' && <MonthNav month={month} onChange={setMonth} />}
      </div>
      <Tabs
        label={t('nav.plan')}
        value={tab}
        onChange={setTab}
        options={[
          { id: 'budget', label: t('plan.tab.budget') },
          { id: 'goals', label: t('plan.tab.goals') },
          { id: 'recurring', label: t('plan.tab.recurring') },
        ]}
      />
      {tab === 'budget' && <BudgetTab month={month} />}
      {tab === 'goals' && <GoalsTab />}
      {tab === 'recurring' && <RecurringTab />}
    </section>
  );
}

/* ============================== Presupuesto ============================== */

function BudgetTab({ month }: { month: YearMonth }) {
  const app = useApp();
  const { t, settings, budgets, transactions, categories, catName, categoryById, money } = app;
  const [editing, setEditing] = useState(false);
  const monthTx = useMemo(() => inMonth(transactions, month), [transactions, month]);
  const progress = monthProgress(month, today());
  const env = useMemo(() => envelopes(budgets, monthTx, settings, progress), [budgets, monthTx, settings, progress]);
  const rule = useMemo(() => fiftyThirtyTwenty(monthTx, categories, settings), [monthTx, categories, settings]);
  const totalBudget = budgets.reduce((s, b) => s + b.monthlyCents, 0);
  const totalSpent = env.reduce((s, e) => s + e.spentCents, 0);

  return (
    <>
      <div className="tabs tabs-sm" role="radiogroup" aria-label={t('plan.method')}>
        {(['envelopes', '50-30-20'] as const).map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={settings.budgetMethod === m}
            className={settings.budgetMethod === m ? 'on' : ''}
            onClick={() => void app.run(() => repo.updateSettings(db, { budgetMethod: m }))}
          >
            {t(m === 'envelopes' ? 'plan.method.envelopes' : 'plan.method.503020')}
          </button>
        ))}
      </div>

      {settings.budgetMethod === 'envelopes' ? (
        <>
          <SectionTitle hint={t('plan.envelopesHint')}>{t('plan.envelopes')}</SectionTitle>
          {env.length === 0 ? (
            <div className="card">
              <EmptyState title={t('plan.noBudgets')} hint={t('plan.noBudgetsHint')} />
              <div className="card-actions">
                <button className="btn btn-primary" onClick={() => setEditing(true)}>
                  <IconPlus /> {t('plan.setBudgets')}
                </button>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="set-row">
                <div>
                  <div className="label">{t('plan.totalSpent', { spent: money(totalSpent), budget: money(totalBudget) })}</div>
                  <div className="desc">{t('plan.monthElapsed', { pct: Math.round(progress * 100) })}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                  {t('plan.edit')}
                </button>
              </div>
              {env.map((e) => (
                <div className="envelope" key={e.categoryId}>
                  <div className="envelope-head">
                    <span>
                      {categoryById.get(e.categoryId)?.emoji} {catName(e.categoryId)}
                    </span>
                    <span className={`mono ${e.status === 'over' ? 'neg-text' : ''}`}>
                      {money(e.spentCents)} <span className="muted">/ {money(e.budgetCents)}</span>
                    </span>
                  </div>
                  <Progress ratio={e.ratio} status={e.status} label={catName(e.categoryId)} />
                  <div className="envelope-foot">
                    {e.remainingCents >= 0 ? t('plan.left', { amount: money(e.remainingCents) }) : t('plan.over', { amount: money(-e.remainingCents) })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <SectionTitle hint={t('plan.503020Hint')}>{t('plan.method.503020')}</SectionTitle>
          {rule.incomeCents === 0 ? (
            <div className="card">
              <EmptyState title={t('plan.noIncome')} hint={t('plan.noIncomeHint')} />
            </div>
          ) : (
            <div className="card">
              <RuleRow label={t('plan.needs')} pct={50} bucket={rule.needs} overIsBad />
              <RuleRow label={t('plan.wants')} pct={30} bucket={rule.wants} overIsBad />
              <RuleRow label={t('plan.savings')} pct={20} bucket={rule.savings} overIsBad={false} />
              <div className="card-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                  {t('plan.classify')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {editing && (settings.budgetMethod === 'envelopes' ? <BudgetEditor month={month} onClose={() => setEditing(false)} /> : <GroupEditor onClose={() => setEditing(false)} />)}
    </>
  );
}

function RuleRow({ label, pct, bucket, overIsBad }: { label: string; pct: number; bucket: Bucket; overIsBad: boolean }) {
  const { t, money } = useApp();
  const ratio = bucket.targetCents > 0 ? bucket.actualCents / bucket.targetCents : 0;
  // Para necesidades/deseos pasarse es malo; para ahorro, pasarse es bueno.
  const status = overIsBad ? (ratio > 1 ? 'over' : ratio >= 0.9 ? 'warning' : 'ok') : ratio >= 1 ? 'ok' : 'warning';
  return (
    <div className="envelope">
      <div className="envelope-head">
        <span>
          {label} <span className="muted">· {pct}%</span>
        </span>
        <span className="mono">
          {money(bucket.actualCents)} <span className="muted">/ {money(bucket.targetCents)}</span>
        </span>
      </div>
      <Progress ratio={ratio} status={status} label={label} />
      <div className="envelope-foot">{t('plan.ofIncome', { pct: bucket.targetCents > 0 ? Math.round(ratio * pct) : 0 })}</div>
    </div>
  );
}

/** Editar los límites por categoría. Muestra tu promedio real como referencia. */
function BudgetEditor({ month, onClose }: { month: YearMonth; onClose: () => void }) {
  const app = useApp();
  const { t, categories, budgets, transactions, settings, catName, money } = app;
  const avgs = useMemo(() => categoryAverages(transactions, month, settings), [transactions, month, settings]);
  const expense = categories.filter((c) => c.kind === 'expense' && !c.archived);
  const [values, setValues] = useState<Record<Id, string>>(() =>
    Object.fromEntries(expense.map((c) => [c.id, centsToInput(budgets.find((b) => b.categoryId === c.id)?.monthlyCents ?? 0).replace(/^0$/, '')])),
  );
  const income = recentAverages(transactions, today(), settings).incomeCents;
  const total = Object.values(values).reduce((s, v) => s + (parseAmount(v) ?? 0), 0);

  const save = async () => {
    const bad = Object.entries(values).find(([, v]) => v.trim() !== '' && parseAmount(v) === null);
    if (bad) return app.toast(`${catName(bad[0])}: ${t('form.invalidAmount')}`);
    const ok = await app.run(async () => {
      for (const c of expense) await repo.setBudget(db, c.id, parseAmount(values[c.id] ?? '') ?? 0);
    }, t('set.saved'));
    if (ok) onClose();
  };

  return (
    <Sheet
      title={t('plan.setBudgets')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('form.cancel')}
          </button>
          <button className="btn btn-primary" onClick={() => void save()}>
            {t('form.save')}
          </button>
        </>
      }
    >
      <p className="sheet-note">
        {t('plan.budgetTotal', { total: money(total) })}
        {income > 0 && ` · ${t('plan.avgIncome', { amount: money(income) })}`}
      </p>
      <div className="budget-grid">
        {expense.map((c) => {
          const avg = avgs.get(c.id)?.avgCents ?? 0;
          return (
            <label className="budget-line" key={c.id}>
              <span className="budget-name">
                {c.emoji} {catName(c.id)}
                {avg > 0 && <small className="muted">{t('plan.avg3', { amount: money(avg) })}</small>}
              </span>
              <input
                className="input-sm mono"
                inputMode="decimal"
                placeholder="—"
                value={values[c.id] ?? ''}
                onChange={(e) => setValues({ ...values, [c.id]: e.target.value })}
                aria-label={catName(c.id)}
              />
            </label>
          );
        })}
      </div>
    </Sheet>
  );
}

/** Clasificar categorías como necesidad o deseo (método 50/30/20). */
function GroupEditor({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const { t, categories, catName } = app;
  const expense = categories.filter((c) => c.kind === 'expense' && !c.archived);
  const setGroup = (id: Id, g: BudgetGroup) => void app.run(() => repo.setCategoryGroup(db, id, g));
  return (
    <Sheet title={t('plan.classify')} onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>{t('plan.done')}</button>}>
      <p className="sheet-note">{t('plan.classifyHint')}</p>
      {expense.map((c) => (
        <div className="budget-line" key={c.id}>
          <span className="budget-name">
            {c.emoji} {catName(c.id)}
          </span>
          <div className="tabs tabs-sm tabs-inline" role="radiogroup" aria-label={catName(c.id)}>
            {(['needs', 'wants'] as const).map((g) => (
              <button key={g} role="radio" aria-checked={(c.group ?? 'wants') === g} className={(c.group ?? 'wants') === g ? 'on' : ''} onClick={() => setGroup(c.id, g)}>
                {t(g === 'needs' ? 'plan.needs' : 'plan.wants')}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

/* ================================= Metas ================================= */

function GoalsTab() {
  const app = useApp();
  const { t, goals, accountValueById, money, locale, memberName, members } = app;
  const [editing, setEditing] = useState<Goal | null | undefined>(undefined);
  const [contributing, setContributing] = useState<Goal | null>(null);
  const progress = goals
    .filter((g) => !g.archived)
    .map((g) => goalProgress(g, today(), g.accountId ? (accountValueById.get(g.accountId)?.baseCents ?? null) : null));

  const remove = async (g: Goal) => {
    if (!window.confirm(t('goal.deleteConfirm', { name: g.name }))) return;
    await app.run(() => repo.deleteGoal(db, g.id), t('goal.deleted'));
  };

  return (
    <>
      <SectionTitle hint={t('goal.hint')}>{t('plan.tab.goals')}</SectionTitle>
      {progress.length === 0 ? (
        <div className="card">
          <EmptyState title={t('goal.empty')} hint={t('goal.emptyHint')} />
        </div>
      ) : (
        <div className="goal-grid">
          {progress.map((p) => (
            <div className="card goal" key={p.goal.id}>
              <div className="goal-head">
                <span className="goal-emoji">{p.goal.emoji}</span>
                <div className="goal-title">
                  <div className="label">{p.goal.name}</div>
                  <div className="desc">
                    {[
                      p.goal.targetDate ? t('goal.by', { date: formatDay(p.goal.targetDate, locale) }) : '',
                      members.length > 1 ? memberName(p.goal.ownerId) : '',
                      p.goal.accountId ? t('goal.linked', { account: accountValueById.get(p.goal.accountId)?.account.name ?? '?' }) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <span className="goal-pct mono">{Math.trunc(p.ratio * 100)}%</span>
              </div>
              <Progress ratio={p.ratio} status={p.done ? 'ok' : 'brand'} label={p.goal.name} />
              <div className="goal-nums mono">
                {money(p.savedCents)} <span className="muted">/ {money(p.goal.targetCents)}</span>
              </div>
              <div className="desc">
                {p.done ? t('goal.done') : p.monthlyNeededCents !== null ? t('goal.monthly', { amount: money(p.monthlyNeededCents), n: p.monthsLeft ?? 0 }) : t('goal.remaining', { amount: money(p.remainingCents) })}
              </div>
              <div className="row-actions goal-actions">
                {!p.goal.accountId && !p.done && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setContributing(p.goal)}>
                    {t('goal.contribute')}
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p.goal)}>
                  {t('tx.edit')}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => void remove(p.goal)}>
                  {t('tx.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="card-actions standalone">
        <button className="btn btn-primary" onClick={() => setEditing(null)}>
          <IconPlus /> {t('goal.new')}
        </button>
      </div>
      {editing !== undefined && <GoalEditor goal={editing} onClose={() => setEditing(undefined)} />}
      {contributing && <ContributeSheet goal={contributing} onClose={() => setContributing(null)} />}
    </>
  );
}

const GOAL_PRESETS = [
  { emoji: '🛟', key: 'goal.preset.emergency' },
  { emoji: '🏡', key: 'goal.preset.house' },
  { emoji: '✈️', key: 'goal.preset.travel' },
  { emoji: '🚗', key: 'goal.preset.car' },
] as const;

function GoalEditor({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const app = useApp();
  const { t, accounts, members, settings } = app;
  const [name, setName] = useState(goal?.name ?? '');
  const [emoji, setEmoji] = useState(goal?.emoji ?? '🎯');
  const [target, setTarget] = useState(goal ? centsToInput(goal.targetCents) : '');
  const [saved, setSaved] = useState(goal ? centsToInput(goal.savedCents) : '');
  const [date, setDate] = useState(goal?.targetDate ?? '');
  const [accountId, setAccountId] = useState<Id | ''>(goal?.accountId ?? '');
  const [ownerId, setOwnerId] = useState<Id | ''>(goal?.ownerId ?? '');

  const save = async () => {
    const targetCents = parseAmount(target);
    const savedCents = saved.trim() === '' ? 0 : parseAmount(saved);
    if (targetCents === null || savedCents === null) return app.toast(t('form.invalidAmount'));
    const input: repo.GoalInput = { name, emoji, targetCents, savedCents, accountId: accountId || null, targetDate: date || null, ownerId: ownerId || null };
    const ok = await app.run(() => (goal ? repo.updateGoal(db, goal.id, input) : repo.addGoal(db, input)), t('set.saved'));
    if (ok) onClose();
  };

  return (
    <Sheet
      title={goal ? t('goal.edit') : t('goal.new')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('form.cancel')}
          </button>
          <button className="btn btn-primary" onClick={() => void save()}>
            {t('form.save')}
          </button>
        </>
      }
    >
      {!goal && (
        <div className="date-quick wrap">
          {GOAL_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setEmoji(p.emoji);
                setName(t(p.key));
              }}
            >
              {p.emoji} {t(p.key)}
            </button>
          ))}
        </div>
      )}
      <div className="field-row">
        <Field label={t('goal.emoji')} htmlFor="g-emoji">
          <input id="g-emoji" className="emoji-input" value={emoji} maxLength={4} onChange={(e) => setEmoji(e.target.value)} />
        </Field>
        <Field label={t('goal.name')} htmlFor="g-name">
          <input id="g-name" type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
      <MoneyField label={t('goal.target', { cur: settings.baseCurrency })} value={target} onChange={setTarget} />
      <Field label={t('goal.account')} htmlFor="g-account" hint={t('goal.accountHint')}>
        <select id="g-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">{t('goal.noAccount')}</option>
          {accounts
            .filter((a) => !a.archived)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      </Field>
      {!accountId && <MoneyField label={t('goal.savedNow')} value={saved} onChange={setSaved} />}
      <Field label={t('goal.date')} htmlFor="g-date">
        <input id="g-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {members.length > 1 && (
        <Field label={t('form.who')} htmlFor="g-owner">
          <select id="g-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">{t('tx.shared')}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      )}
    </Sheet>
  );
}

function ContributeSheet({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const app = useApp();
  const { t } = app;
  const [amount, setAmount] = useState('');
  const save = async (sign: 1 | -1) => {
    const cents = parseAmount(amount);
    if (cents === null || cents === 0) return app.toast(t('form.invalidAmount'));
    if (await app.run(() => repo.addToGoal(db, goal.id, sign * cents), t('set.saved'))) onClose();
  };
  return (
    <Sheet
      title={`${goal.emoji} ${goal.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => void save(-1)}>
            {t('goal.withdraw')}
          </button>
          <button className="btn btn-primary" onClick={() => void save(1)}>
            {t('goal.add')}
          </button>
        </>
      }
    >
      <MoneyField label={t('form.amount')} value={amount} onChange={setAmount} autoFocus />
    </Sheet>
  );
}

/* ============================== Recurrentes ============================== */

function RecurringTab() {
  const app = useApp();
  const { t, transactions, settings, catName, categoryById, money, locale } = app;
  const items = useMemo(() => detectRecurring(transactions, today(), settings, settings.dismissedRecurring), [transactions, settings]);
  const total: Cents = recurringMonthlyTotal(items);
  const avg = recentAverages(transactions, today(), settings);

  return (
    <>
      <SectionTitle hint={t('rec.hint')}>{t('plan.tab.recurring')}</SectionTitle>
      {items.length === 0 ? (
        <div className="card">
          <EmptyState title={t('rec.empty')} hint={t('rec.emptyHint')} />
        </div>
      ) : (
        <div className="card">
          <div className="set-row">
            <div>
              <div className="label">{t('rec.total', { amount: money(total), n: items.length })}</div>
              {avg.incomeCents > 0 && <div className="desc">{t('rec.ofIncome', { pct: Math.round((total / avg.incomeCents) * 100) })}</div>}
            </div>
          </div>
          {items.map((r) => (
            <div className="tx" key={r.key}>
              <div className="tx-icon expense">{(r.categoryId && categoryById.get(r.categoryId)?.emoji) || '🔁'}</div>
              <div className="tx-main">
                <div className="tx-cat">{r.label}</div>
                <div className="tx-note">
                  {catName(r.categoryId)} · {t('rec.next', { date: formatDay(r.nextDate, locale) })}
                  {r.changeRatio !== null && (
                    <span className={`delta-pill ${r.changeRatio > 0 ? 'bad' : 'good'}`}>
                      {r.changeRatio > 0 ? '↑' : '↓'} {Math.abs(Math.round(r.changeRatio * 100))}%
                    </span>
                  )}
                </div>
              </div>
              <div className="tx-right">
                <div className="tx-amt expense">{money(r.amountCents, r.currency, { cents: 'always' })}</div>
              </div>
              <div className="tx-actions">
                <button onClick={() => void app.run(() => repo.setRecurringDismissed(db, r.key, true))} aria-label={`${t('rec.dismiss')}: ${r.label}`} title={t('rec.dismiss')}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {settings.dismissedRecurring.length > 0 && (
        <button className="link-btn" onClick={() => void app.run(async () => { for (const k of settings.dismissedRecurring) await repo.setRecurringDismissed(db, k, false); })}>
          {t('rec.restore', { n: settings.dismissedRecurring.length })}
        </button>
      )}
    </>
  );
}
