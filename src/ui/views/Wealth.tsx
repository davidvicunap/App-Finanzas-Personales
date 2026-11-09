/**
 * PATRIMONIO — responde: "¿cuánto tenemos y hacia dónde vamos?"
 * Pestañas: Resumen · Cuentas · Inversiones · TFSA/RRSP/FHSA · Futuro.
 */
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context';
import { db } from '../../data/db';
import * as repo from '../../data/repo';
import { centsToInput, formatRate, marketValueCents, parseAmount, type Cents, type CurrencyCode, CURRENCIES } from '../../domain/money';
import { currentMonth, daysBetween, formatDay, formatMonth, today } from '../../domain/dates';
import { allocation, holdingRow, isInvestment, isLiability, portfolioSummary, type AccountValue } from '../../domain/wealth';
import { roomSummary } from '../../domain/registered';
import { fiNumber, monthsToTarget, project, projectionTable, type Scenario } from '../../domain/projection';
import { recentAverages } from '../../domain/insights';
import { ASSET_CLASSES, REGISTERED_TYPES, type AssetClass, type Holding, type Id, type RegisteredType } from '../../domain/types';
import type { MessageKey } from '../../i18n';
import { EmptyState, SectionTitle } from '../components/common';
import { BarList, Field, LineChart, MoneyField, Progress, Sheet, Stat, Tabs, parseSigned } from '../components/kit';
import { CATEGORY_COLORS } from '../components/charts';
import { IconPlus } from '../icons';

type Tab = 'overview' | 'accounts' | 'investments' | 'registered' | 'future';

export function Wealth({ initialTab = 'overview' }: { initialTab?: Tab }) {
  const { t } = useApp();
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <section className="view active">
      <div className="page-head">
        <div>
          <h1>{t('nav.wealth')}</h1>
          <div className="sub">{t('wealth.subtitle')}</div>
        </div>
      </div>
      <Tabs
        label={t('nav.wealth')}
        value={tab}
        onChange={setTab}
        options={[
          { id: 'overview', label: t('wealth.tab.overview') },
          { id: 'accounts', label: t('wealth.tab.accounts') },
          { id: 'investments', label: t('wealth.tab.investments') },
          { id: 'registered', label: t('wealth.tab.registered') },
          { id: 'future', label: t('wealth.tab.future') },
        ]}
      />
      {tab === 'overview' && <Overview goTo={setTab} />}
      {tab === 'accounts' && <Accounts />}
      {tab === 'investments' && <Investments />}
      {tab === 'registered' && <Registered />}
      {tab === 'future' && <Future />}
    </section>
  );
}

/** "hace 3 días" / "3 days ago" a partir de una fecha. */
function useAgo() {
  const { t } = useApp();
  return (date: string | null) => {
    if (!date) return t('wealth.noData');
    const d = daysBetween(date, today());
    return d <= 0 ? t('tx.today') : d === 1 ? t('tx.yesterday') : t('wealth.daysAgo', { n: d });
  };
}

/* ================================ Resumen ================================ */

function Overview({ goTo }: { goTo: (t: Tab) => void }) {
  const app = useApp();
  const { t, netWorth: nw, accountValues, worth, money, locale } = app;

  // Guarda la foto de este mes para el gráfico de evolución (solo si hay datos).
  useEffect(() => {
    const hasData = accountValues.some((v) => v.source !== 'none');
    if (!hasData || nw.unconverted > 0) return;
    void repo.saveWorthSnapshot(db, {
      id: currentMonth(),
      assetsCents: nw.assetsCents,
      liabilitiesCents: nw.liabilitiesCents,
      netCents: nw.netCents,
      investableCents: nw.investableCents,
    });
  }, [nw, accountValues]);

  const groups = useMemo(() => {
    const keys: { key: string; label: MessageKey; match: (v: AccountValue) => boolean }[] = [
      { key: 'cash', label: 'wealth.group.cash', match: (v) => ['chequing', 'savings', 'cash'].includes(v.account.type) },
      { key: 'invest', label: 'wealth.group.invest', match: (v) => isInvestment(v.account) },
      { key: 'property', label: 'wealth.group.property', match: (v) => v.account.type === 'property' || v.account.type === 'other' },
      { key: 'debt', label: 'wealth.group.debt', match: (v) => isLiability(v.account) },
    ];
    return keys
      .map((k) => ({ ...k, cents: accountValues.filter((v) => !v.account.archived && k.match(v)).reduce((s, v) => s + Math.abs(v.baseCents ?? 0), 0) }))
      .filter((g) => g.cents > 0);
  }, [accountValues]);

  const noData = accountValues.every((v) => v.source === 'none');
  const totalAbs = groups.reduce((s, g) => s + g.cents, 0);

  return (
    <>
      <div className="hero">
        <div className="hero-main">
          <div className="eyebrow">{t('wealth.netWorth')}</div>
          <div className={`balance mono${nw.netCents < 0 ? ' neg' : ''}`}>{money(nw.netCents)}</div>
          <div className="rate-badge">
            <span className="dot" /> {t('wealth.assetsDebts', { assets: money(nw.assetsCents), debts: money(nw.liabilitiesCents) })}
          </div>
        </div>
      </div>

      {nw.unconverted > 0 && <div className="alert">{t('wealth.unconverted', { n: nw.unconverted })}</div>}

      {noData ? (
        <div className="card">
          <EmptyState title={t('wealth.empty')} hint={t('wealth.emptyHint')} />
          <div className="card-actions">
            <button className="btn btn-primary" onClick={() => goTo('accounts')}>
              {t('wealth.updateBalances')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-3">
            <Stat label={t('wealth.group.cash')} value={money(nw.cashCents)} tone="income" />
            <Stat label={t('wealth.group.invest')} value={money(nw.investableCents)} tone="net" />
            <Stat label={t('wealth.group.debt')} value={money(nw.liabilitiesCents)} tone="expense" />
          </div>

          <SectionTitle hint={t('wealth.historyHint')}>{t('wealth.history')}</SectionTitle>
          <div className="card chart-wrap">
            {worth.length >= 2 ? (
              <LineChart
                labels={worth.map((w) => formatMonth(w.id, locale, 'short'))}
                format={(v) => money(Math.round(v), undefined, { compact: true })}
                series={[
                  { label: t('wealth.netWorth'), color: 'var(--brand)', values: worth.map((w) => w.netCents) },
                  { label: t('wealth.group.invest'), color: 'var(--income)', values: worth.map((w) => w.investableCents), dashed: true },
                ]}
              />
            ) : (
              <p className="muted small">{t('wealth.historyEmpty')}</p>
            )}
          </div>

          <SectionTitle>{t('wealth.composition')}</SectionTitle>
          <div className="card breakdown">
            <BarList
              rows={groups.map((g, i) => ({
                key: g.key,
                label: t(g.label),
                value: money(g.key === 'debt' ? -g.cents : g.cents),
                share: totalAbs ? g.cents / totalAbs : 0,
                color: g.key === 'debt' ? 'var(--expense)' : CATEGORY_COLORS[i]!,
              }))}
            />
          </div>
        </>
      )}
    </>
  );
}

/* ================================ Cuentas ================================ */

function Accounts() {
  const { t, accountValues, money, memberName, members } = useApp();
  const ago = useAgo();
  const [editing, setEditing] = useState<AccountValue | null>(null);
  const active = accountValues.filter((v) => !v.account.archived);
  return (
    <>
      <SectionTitle hint={t('wealth.accountsHint')}>{t('wealth.tab.accounts')}</SectionTitle>
      <div className="card">
        {active.map((v) => (
          <div className="set-row" key={v.account.id}>
            <div>
              <div className="label">
                {v.account.name} <span className="tag">{v.account.currency}</span>
              </div>
              <div className="desc">
                {[t(`acct.${v.account.type}` as MessageKey), members.length > 1 ? memberName(v.account.ownerId) : '', v.source === 'holdings' ? t('wealth.fromHoldings') : ago(v.asOf)]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <div className="row-actions align-end">
              <span className={`mono strong ${v.cents < 0 ? 'neg-text' : ''}`}>{v.source === 'none' ? '—' : money(v.cents, v.currency, { cents: 'always' })}</span>
              {v.source !== 'holdings' && (
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(v)}>
                  {t('wealth.update')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="muted small center">{t('wealth.addAccountHint')}</p>
      {editing && <BalanceSheet value={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function BalanceSheet({ value, onClose }: { value: AccountValue; onClose: () => void }) {
  const app = useApp();
  const { t } = app;
  const liability = isLiability(value.account);
  const [amount, setAmount] = useState(value.source === 'balance' ? centsToInput(Math.abs(value.cents)) : '');
  const [date, setDate] = useState(today());
  const save = async () => {
    const cents = parseSigned(amount, !liability);
    if (cents === null) return app.toast(t('form.invalidAmount'));
    if (await app.run(() => repo.setBalance(db, value.account.id, date, cents), t('set.saved'))) onClose();
  };
  return (
    <Sheet
      title={value.account.name}
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
      <MoneyField
        label={liability ? t('wealth.owed') : t('wealth.balance')}
        hint={liability ? t('wealth.owedHint') : t('wealth.balanceHint')}
        value={amount}
        onChange={setAmount}
        currency={value.account.currency}
        allowNegative={!liability}
        autoFocus
      />
      <Field label={t('form.date')} htmlFor="b-date">
        <input id="b-date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </Field>
    </Sheet>
  );
}

/* ============================== Inversiones ============================== */

function Investments() {
  const app = useApp();
  const { t, holdings, accounts, settings, accountById, money } = app;
  const [editing, setEditing] = useState<Holding | null | undefined>(undefined);
  const rows = useMemo(() => holdings.map((h) => holdingRow(h, settings)), [holdings, settings]);
  const summary = useMemo(() => portfolioSummary(rows, settings), [rows, settings]);
  const byClass = useMemo(() => allocation(rows, 'assetClass'), [rows]);
  const byAccount = useMemo(() => allocation(rows, 'accountId'), [rows]);
  const investAccounts = accounts.filter((a) => !a.archived && isInvestment(a));
  const ago = useAgo();

  const remove = async (h: Holding) => {
    const deleted = await repo.deleteHolding(db, h.id);
    if (deleted) app.toast(t('inv.deleted'), { label: t('tx.undo'), run: () => void db.holdings.put(deleted) });
  };

  if (investAccounts.length === 0) {
    return (
      <div className="card">
        <EmptyState title={t('inv.noAccounts')} hint={t('inv.noAccountsHint')} />
      </div>
    );
  }

  return (
    <>
      {rows.length > 0 && (
        <>
          <div className="grid grid-3 top-gap">
            <Stat label={t('inv.value')} value={money(summary.baseValueCents)} tone="net" />
            <Stat label={t('inv.cost')} value={money(summary.baseCostCents)} tone="net" />
            <Stat
              label={t('inv.gain')}
              value={money(summary.baseGainCents, undefined, { sign: 'always' })}
              tone={summary.baseGainCents >= 0 ? 'income' : 'expense'}
              sub={summary.baseCostCents > 0 ? `${((summary.baseGainCents / summary.baseCostCents) * 100).toFixed(1)}%` : undefined}
            />
          </div>
          {summary.unconverted > 0 && <div className="alert">{t('wealth.unconverted', { n: summary.unconverted })}</div>}
          <div className="currency-split">
            {CURRENCIES.filter((c) => summary.byCurrency[c]).map((c) => {
              const s = summary.byCurrency[c]!;
              return (
                <div key={c} className="chip">
                  <b>{c}</b> {money(s.valueCents, c)} ·{' '}
                  <span className={s.gainCents >= 0 ? 'pos-text' : 'neg-text'}>{money(s.gainCents, c, { sign: 'always' })}</span>
                </div>
              );
            })}
          </div>

          <SectionTitle>{t('inv.byClass')}</SectionTitle>
          <div className="card breakdown">
            <BarList rows={byClass.map((s, i) => ({ key: s.key, label: t(`asset.${s.key}` as MessageKey), value: money(s.cents), share: s.share, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]! }))} />
          </div>
          <SectionTitle>{t('inv.byAccount')}</SectionTitle>
          <div className="card breakdown">
            <BarList rows={byAccount.map((s, i) => ({ key: s.key, label: accountById.get(s.key)?.name ?? '?', value: money(s.cents), share: s.share, color: CATEGORY_COLORS[(i + 3) % CATEGORY_COLORS.length]! }))} />
          </div>
        </>
      )}

      <SectionTitle hint={t('inv.hint')}>{t('inv.holdings')}</SectionTitle>
      <div className="card">
        {rows.length === 0 && <EmptyState title={t('inv.empty')} hint={t('inv.emptyHint')} />}
        {rows.map((r) => (
          <div className="tx" key={r.holding.id}>
            <div className="tx-icon holding-badge">{r.holding.symbol.slice(0, 4)}</div>
            <div className="tx-main">
              <div className="tx-cat">
                {r.holding.symbol} <span className="tag">{t(`asset.${r.holding.assetClass}` as MessageKey)}</span>
              </div>
              <div className="tx-note">
                {r.holding.quantity} × {money(marketValueCents('1', r.holding.unitPrice), r.holding.currency, { cents: 'always' })}
                {r.holding.multiplier > 1 && ` × ${r.holding.multiplier}`} · {accountById.get(r.holding.accountId)?.name} · {ago(r.holding.priceAsOf)}
              </div>
            </div>
            <div className="tx-right">
              <div className="tx-amt">{money(r.valueCents, r.holding.currency, { cents: 'always' })}</div>
              <div className={`small mono ${r.gainCents >= 0 ? 'pos-text' : 'neg-text'}`}>
                {money(r.gainCents, r.holding.currency, { sign: 'always' })}
                {r.gainRatio !== null && ` (${(r.gainRatio * 100).toFixed(1)}%)`}
              </div>
            </div>
            <div className="tx-actions">
              <button onClick={() => setEditing(r.holding)} aria-label={`${t('tx.edit')}: ${r.holding.symbol}`}>
                ✎
              </button>
              <button className="del" onClick={() => void remove(r.holding)} aria-label={`${t('tx.delete')}: ${r.holding.symbol}`}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="card-actions standalone">
        <button className="btn btn-primary" onClick={() => setEditing(null)}>
          <IconPlus /> {t('inv.add')}
        </button>
      </div>
      <p className="muted small center">{t('inv.acbNote')}</p>
      {editing !== undefined && <HoldingSheet holding={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}

function HoldingSheet({ holding, onClose }: { holding: Holding | null; onClose: () => void }) {
  const app = useApp();
  const { t, accounts } = app;
  const investAccounts = accounts.filter((a) => !a.archived && isInvestment(a));
  const [form, setForm] = useState<repo.HoldingInput>(() =>
    holding
      ? { ...holding }
      : { accountId: investAccounts[0]?.id ?? '', symbol: '', assetClass: 'etf', currency: 'CAD', quantity: '', unitPrice: '', priceAsOf: today(), multiplier: 1, costBasisCents: 0 },
  );
  const [cost, setCost] = useState(holding ? centsToInput(holding.costBasisCents) : '');
  const set = (p: Partial<repo.HoldingInput>) => setForm({ ...form, ...p });

  const save = async () => {
    const costBasisCents = cost.trim() === '' ? 0 : parseAmount(cost);
    if (costBasisCents === null) return app.toast(t('form.invalidAmount'));
    const input = { ...form, costBasisCents };
    if (await app.run(() => (holding ? repo.updateHolding(db, holding.id, input) : repo.addHolding(db, input)), t('set.saved'))) onClose();
  };

  return (
    <Sheet
      title={holding ? holding.symbol : t('inv.add')}
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
      <div className="field-row">
        <Field label={t('inv.symbol')} htmlFor="h-symbol">
          <input id="h-symbol" type="text" value={form.symbol} placeholder="VFV, AAPL, BTC" maxLength={40} onChange={(e) => set({ symbol: e.target.value })} />
        </Field>
        <Field label={t('inv.class')} htmlFor="h-class">
          <select
            id="h-class"
            value={form.assetClass}
            onChange={(e) => {
              const assetClass = e.target.value as AssetClass;
              set({ assetClass, multiplier: assetClass === 'option' ? 100 : 1 });
            }}
          >
            {ASSET_CLASSES.map((c) => (
              <option key={c} value={c}>
                {t(`asset.${c}` as MessageKey)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="field-row">
        <Field label={t('form.account')} htmlFor="h-account">
          <select id="h-account" value={form.accountId} onChange={(e) => set({ accountId: e.target.value })}>
            {investAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('inv.currency')} htmlFor="h-cur">
          <select id="h-cur" value={form.currency} onChange={(e) => set({ currency: e.target.value as CurrencyCode })}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="field-row">
        <Field label={form.assetClass === 'option' ? t('inv.contracts') : t('inv.quantity')} htmlFor="h-qty">
          <input id="h-qty" className="mono" inputMode="decimal" value={form.quantity} placeholder="10" onChange={(e) => set({ quantity: e.target.value })} />
        </Field>
        <Field label={t('inv.price')} htmlFor="h-price">
          <input id="h-price" className="mono" inputMode="decimal" value={form.unitPrice} placeholder="0.00" onChange={(e) => set({ unitPrice: e.target.value, priceAsOf: today() })} />
        </Field>
      </div>
      {form.assetClass === 'option' && (
        <Field label={t('inv.multiplier')} htmlFor="h-mult">
          <input id="h-mult" className="mono" inputMode="numeric" value={form.multiplier} onChange={(e) => set({ multiplier: Number(e.target.value) || 1 })} />
        </Field>
      )}
      <MoneyField label={t('inv.costTotal')} hint={t('inv.costHint')} value={cost} onChange={setCost} currency={form.currency} />
    </Sheet>
  );
}

/* =========================== TFSA / RRSP / FHSA =========================== */

function Registered() {
  const app = useApp();
  const { t, members, rooms, contributions, money, locale, memberName } = app;
  const [year, setYear] = useState(Number(today().slice(0, 4)));
  const [roomEdit, setRoomEdit] = useState<{ memberId: Id; type: RegisteredType } | null>(null);
  const [adding, setAdding] = useState<{ memberId: Id; type: RegisteredType } | null>(null);
  const yearContribs = contributions.filter((c) => c.date.startsWith(`${year}-`)).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <div className="page-head compact">
        <p className="muted small">{t('reg.hint')}</p>
        <div className="month-nav">
          <button className="arrow" onClick={() => setYear(year - 1)} aria-label={t('reg.prevYear')}>
            ‹
          </button>
          <span className="label">{year}</span>
          <button className="arrow" onClick={() => setYear(year + 1)} aria-label={t('reg.nextYear')}>
            ›
          </button>
        </div>
      </div>
      {members.map((m) => (
        <div key={m.id}>
          {members.length > 1 && <SectionTitle>{m.name}</SectionTitle>}
          <div className="goal-grid">
            {REGISTERED_TYPES.map((type) => {
              const s = roomSummary(rooms, contributions, m.id, type, year);
              return (
                <div className="card goal" key={type}>
                  <div className="goal-head">
                    <div className="goal-title">
                      <div className="label">{t(`acct.${type}`)}</div>
                      <div className="desc">{s.roomCents === null ? t('reg.noRoom') : t('reg.room', { amount: money(s.roomCents) })}</div>
                    </div>
                  </div>
                  {s.roomCents !== null && s.roomCents > 0 && (
                    <Progress ratio={s.contributedCents / s.roomCents} status={s.overContributed ? 'over' : 'brand'} label={t(`acct.${type}`)} />
                  )}
                  <div className="goal-nums mono">
                    {t('reg.contributed', { amount: money(s.contributedCents) })}
                    {s.withdrawnCents > 0 && <span className="muted"> · {t('reg.withdrawn', { amount: money(s.withdrawnCents) })}</span>}
                  </div>
                  {s.remainingCents !== null && (
                    <div className={`desc ${s.overContributed ? 'neg-text strong' : ''}`}>
                      {s.overContributed ? t('reg.over', { amount: money(-s.remainingCents) }) : t('reg.remaining', { amount: money(s.remainingCents) })}
                    </div>
                  )}
                  <div className="row-actions goal-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setAdding({ memberId: m.id, type })}>
                      {t('reg.add')}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setRoomEdit({ memberId: m.id, type })}>
                      {t('reg.setRoom')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {yearContribs.length > 0 && (
        <>
          <SectionTitle>{t('reg.history', { year })}</SectionTitle>
          <div className="card">
            {yearContribs.map((c) => (
              <div className="set-row" key={c.id}>
                <div>
                  <div className="label">
                    {t(`acct.${c.type}`)} {members.length > 1 && <span className="muted">· {memberName(c.memberId)}</span>}
                  </div>
                  <div className="desc">
                    {formatDay(c.date, locale)}
                    {c.note && ` · ${c.note}`}
                  </div>
                </div>
                <div className="row-actions align-end">
                  <span className={`mono strong ${c.amountCents < 0 ? 'neg-text' : 'pos-text'}`}>{money(c.amountCents, 'CAD', { sign: 'always', cents: 'always' })}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => void app.run(() => repo.deleteContribution(db, c.id))} aria-label={t('tx.delete')}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {roomEdit && <RoomSheet {...roomEdit} year={year} onClose={() => setRoomEdit(null)} />}
      {adding && <ContributionSheet {...adding} year={year} onClose={() => setAdding(null)} />}
    </>
  );
}

function RoomSheet({ memberId, type, year, onClose }: { memberId: Id; type: RegisteredType; year: number; onClose: () => void }) {
  const app = useApp();
  const { t, rooms, contributions } = app;
  const current = roomSummary(rooms, contributions, memberId, type, year).roomCents;
  const [amount, setAmount] = useState(current !== null ? centsToInput(current) : '');
  const save = async () => {
    const cents = parseAmount(amount);
    if (cents === null) return app.toast(t('form.invalidAmount'));
    if (await app.run(() => repo.setRoom(db, memberId, type, year, cents), t('set.saved'))) onClose();
  };
  return (
    <Sheet
      title={`${t(`acct.${type}`)} · ${year}`}
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
      <MoneyField label={t('reg.roomLabel', { year })} hint={t('reg.roomHint')} value={amount} onChange={setAmount} currency="CAD" autoFocus />
    </Sheet>
  );
}

function ContributionSheet({ memberId, type, year, onClose }: { memberId: Id; type: RegisteredType; year: number; onClose: () => void }) {
  const app = useApp();
  const { t } = app;
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<'in' | 'out'>('in');
  const thisYear = String(year) === today().slice(0, 4);
  const [date, setDate] = useState(thisYear ? today() : `${year}-01-01`);
  const [note, setNote] = useState('');
  const save = async () => {
    const cents = parseAmount(amount);
    if (cents === null || cents === 0) return app.toast(t('form.invalidAmount'));
    const ok = await app.run(() => repo.addContribution(db, { memberId, type, date, amountCents: kind === 'in' ? cents : -cents, note }), t('set.saved'));
    if (ok) onClose();
  };
  return (
    <Sheet
      title={t(`acct.${type}`)}
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
      <Tabs
        label={t('reg.kind')}
        value={kind}
        onChange={setKind}
        options={[
          { id: 'in', label: t('reg.contribution') },
          { id: 'out', label: t('reg.withdrawal') },
        ]}
      />
      <MoneyField label={t('form.amount')} value={amount} onChange={setAmount} currency="CAD" autoFocus />
      <Field label={t('form.date')} htmlFor="c-date">
        <input id="c-date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </Field>
      <Field label={t('form.note')} htmlFor="c-note">
        <input id="c-note" type="text" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Sheet>
  );
}

/* ================================ Futuro ================================ */

function Future() {
  const app = useApp();
  const { t, settings, netWorth: nw, transactions, money } = app;
  const p = settings.projection;
  const avg = useMemo(() => recentAverages(transactions, today(), settings, 3), [transactions, settings]);
  const avg12 = useMemo(() => recentAverages(transactions, today(), settings, 12), [transactions, settings]);

  const monthly: Cents = p.monthlyContributionCents ?? Math.max(0, avg.savingsCents);
  const annualExpenses: Cents = p.annualExpensesCents ?? avg12.expenseCents * 12;
  const start = nw.investableCents;
  const scenarios: Scenario[] = [
    { key: 'conservative', annualBps: p.conservativeBps },
    { key: 'base', annualBps: p.baseBps },
    { key: 'optimistic', annualBps: p.optimisticBps },
  ];
  const table = projectionTable(start, monthly, scenarios);
  const fi = annualExpenses > 0 ? fiNumber(annualExpenses, p.withdrawalRateBps) : null;
  const savingsRate = avg.incomeCents > 0 ? Math.trunc((avg.savingsCents / avg.incomeCents) * 100) : null;
  const years = Array.from({ length: 31 }, (_, i) => i);
  const seriesFor = (bps: number) => [start, ...project(start, monthly, bps, 360).filter((_, i) => (i + 1) % 12 === 0)];
  const [editing, setEditing] = useState(false);

  const fmtYears = (months: number | null) =>
    months === null ? t('fi.never') : months === 0 ? t('fi.reached') : t('fi.years', { n: (months / 12).toFixed(1) });

  return (
    <>
      <div className="alert info">{t('fi.disclaimer')}</div>
      <div className="grid grid-3">
        <Stat label={t('fi.start')} value={money(start)} sub={t('fi.startHint')} />
        <Stat label={t('fi.monthly')} value={money(monthly)} sub={p.monthlyContributionCents === null ? t('fi.monthlyAuto') : t('fi.manual')} />
        <Stat label={t('fi.savingsRate')} value={savingsRate === null ? '—' : `${savingsRate}%`} sub={t('fi.last3')} />
      </div>

      <SectionTitle hint={t('fi.projectionHint')}>{t('fi.projection')}</SectionTitle>
      <div className="card chart-wrap">
        <LineChart
          labels={years.map((y) => (y === 0 ? t('tx.today') : t('fi.yearAxis', { n: y })))}
          format={(v) => money(Math.round(v), undefined, { compact: true })}
          series={[
            { label: `${t('fi.optimistic')} ${formatRate(p.optimisticBps * 10_000)}%`, color: 'var(--income)', values: seriesFor(p.optimisticBps) },
            { label: `${t('fi.base')} ${formatRate(p.baseBps * 10_000)}%`, color: 'var(--brand)', values: seriesFor(p.baseBps) },
            { label: `${t('fi.conservative')} ${formatRate(p.conservativeBps * 10_000)}%`, color: 'var(--faint)', values: seriesFor(p.conservativeBps), dashed: true },
          ]}
        />
      </div>
      <div className="card table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('fi.horizon')}</th>
              <th>{t('fi.conservative')}</th>
              <th>{t('fi.base')}</th>
              <th>{t('fi.optimistic')}</th>
              <th>{t('fi.contributed')}</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.years}>
                <td>{t('fi.yearsShort', { n: r.years })}</td>
                <td className="mono">{money(r.values.conservative, undefined, { compact: true })}</td>
                <td className="mono strong">{money(r.values.base, undefined, { compact: true })}</td>
                <td className="mono">{money(r.values.optimistic, undefined, { compact: true })}</td>
                <td className="mono muted">{money(r.contributedCents, undefined, { compact: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle hint={t('fi.fiHint', { rate: formatRate(p.withdrawalRateBps * 10_000) })}>{t('fi.title')}</SectionTitle>
      <div className="card fi-card">
        {fi === null ? (
          <EmptyState title={t('fi.noExpenses')} hint={t('fi.noExpensesHint')} />
        ) : (
          <>
            <div className="envelope-head">
              <span>{t('fi.number')}</span>
              <span className="mono strong">{money(fi)}</span>
            </div>
            <Progress ratio={start / fi} status="brand" label={t('fi.number')} />
            <div className="envelope-foot">
              {t('fi.progress', { pct: ((start / fi) * 100).toFixed(1), expenses: money(annualExpenses) })}
            </div>
            <div className="fi-years">
              {scenarios.map((s) => (
                <div key={s.key}>
                  <span className="muted">{t(`fi.${s.key}`)}</span>
                  <b className="mono">{fmtYears(monthsToTarget(start, monthly, s.annualBps, fi))}</b>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="card-actions standalone">
        <button className="btn btn-ghost" onClick={() => setEditing(true)}>
          {t('fi.assumptions')}
        </button>
      </div>
      {editing && <AssumptionsSheet onClose={() => setEditing(false)} autoMonthly={Math.max(0, avg.savingsCents)} autoExpenses={avg12.expenseCents * 12} />}
    </>
  );
}

function AssumptionsSheet({ onClose, autoMonthly, autoExpenses }: { onClose: () => void; autoMonthly: Cents; autoExpenses: Cents }) {
  const app = useApp();
  const { t, settings, money } = app;
  const p = settings.projection;
  // Puntos básicos → texto en %: 550 bps → "5.50". formatRate usa micro-unidades (×1,000,000).
  const pct = (bps: number) => formatRate(bps * 10_000);
  const [c, setC] = useState(pct(p.conservativeBps));
  const [b, setB] = useState(pct(p.baseBps));
  const [o, setO] = useState(pct(p.optimisticBps));
  const [w, setW] = useState(pct(p.withdrawalRateBps));
  const [monthly, setMonthly] = useState(p.monthlyContributionCents === null ? '' : centsToInput(p.monthlyContributionCents));
  const [expenses, setExpenses] = useState(p.annualExpensesCents === null ? '' : centsToInput(p.annualExpensesCents));

  /** "5" o "5.5" (%) → puntos básicos (500, 550). */
  const toBps = (s: string) => {
    const cents = parseSigned(s, true); // reutilizamos el parser: 5.5 → 550 "centavos" = 550 bps
    return cents === null || Math.abs(cents) > 10_000 ? null : cents;
  };

  const save = async () => {
    const vals = [toBps(c), toBps(b), toBps(o), toBps(w)];
    if (vals.some((v) => v === null) || (vals[3] ?? 0) <= 0) return app.toast(t('fi.invalidRate'));
    const m = monthly.trim() === '' ? null : parseAmount(monthly);
    const e = expenses.trim() === '' ? null : parseAmount(expenses);
    if ((monthly.trim() !== '' && m === null) || (expenses.trim() !== '' && e === null)) return app.toast(t('form.invalidAmount'));
    const ok = await app.run(
      () =>
        repo.updateSettings(db, {
          projection: { conservativeBps: vals[0]!, baseBps: vals[1]!, optimisticBps: vals[2]!, withdrawalRateBps: vals[3]!, monthlyContributionCents: m, annualExpensesCents: e },
        }),
      t('set.saved'),
    );
    if (ok) onClose();
  };

  return (
    <Sheet
      title={t('fi.assumptions')}
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
      <p className="sheet-note">{t('fi.assumptionsHint')}</p>
      <div className="field-row three">
        {[
          [t('fi.conservative'), c, setC],
          [t('fi.base'), b, setB],
          [t('fi.optimistic'), o, setO],
        ].map(([label, v, set]) => (
          <Field key={label as string} label={`${label as string} (%)`}>
            <input className="mono" inputMode="decimal" value={v as string} onChange={(e) => (set as (s: string) => void)(e.target.value)} aria-label={`${label as string} (%)`} />
          </Field>
        ))}
      </div>
      <MoneyField label={t('fi.monthly')} hint={t('fi.autoValue', { amount: money(autoMonthly) })} value={monthly} onChange={setMonthly} />
      <MoneyField label={t('fi.annualExpenses')} hint={t('fi.autoValue', { amount: money(autoExpenses) })} value={expenses} onChange={setExpenses} />
      <Field label={t('fi.withdrawalRate')} hint={t('fi.withdrawalHint')}>
        <input className="mono" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} aria-label={t('fi.withdrawalRate')} />
      </Field>
    </Sheet>
  );
}
