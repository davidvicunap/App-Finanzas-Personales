/**
 * MOVIMIENTOS — responde: "¿en qué se fue el dinero este mes?"
 * Lista agrupada por día, con búsqueda y filtros por tipo, categoría y persona.
 */
import { useMemo, useState } from 'react';
import { useApp } from '../context';
import { db } from '../../data/db';
import * as repo from '../../data/repo';
import { addDays, formatDay, today, type YearMonth } from '../../domain/dates';
import { groupByDay, inMonth, totals } from '../../domain/stats';
import type { Id, Transaction } from '../../domain/types';
import { EmptyState, MonthNav } from '../components/common';
import { IconEdit, IconSearch, IconTrash } from '../icons';

interface Props {
  month: YearMonth;
  setMonth: (m: YearMonth) => void;
  onEdit: (tx: Transaction) => void;
  onAdd: () => void;
}

export function Transactions({ month, setMonth, onEdit, onAdd }: Props) {
  const app = useApp();
  const { t, locale, transactions, categories, members, settings, catName, categoryById, accountById, memberById, money } = app;

  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | 'income' | 'expense'>('all');
  const [cat, setCat] = useState<'all' | Id>('all');
  const [who, setWho] = useState<'all' | 'shared' | Id>('all');

  const monthTx = useMemo(() => inMonth(transactions, month), [transactions, month]);
  const monthTotals = useMemo(() => totals(monthTx, settings), [monthTx, settings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return monthTx.filter(
      (tx) =>
        (type === 'all' || tx.type === type) &&
        (cat === 'all' || tx.categoryId === cat) &&
        (who === 'all' || (who === 'shared' ? tx.memberId === null : tx.memberId === who)) &&
        (!q || catName(tx.categoryId).toLowerCase().includes(q) || tx.note.toLowerCase().includes(q)),
    );
  }, [monthTx, query, type, cat, who, catName]);

  const groups = useMemo(() => groupByDay(filtered, settings), [filtered, settings]);

  // Solo categorías que aparecen en algún movimiento, para que el filtro sea corto.
  const usedCats = useMemo(() => {
    const used = new Set(transactions.map((tx) => tx.categoryId));
    return categories.filter((c) => used.has(c.id));
  }, [transactions, categories]);

  const remove = async (tx: Transaction) => {
    const deleted = await repo.deleteTransaction(db, tx.id);
    if (!deleted) return;
    // Cada toast guarda su propio movimiento: se puede deshacer aunque borres varios seguidos.
    app.toast(t('tx.deleted'), {
      label: t('tx.undo'),
      run: () => void app.run(() => repo.restoreTransaction(db, deleted), t('tx.restored')),
    });
  };

  const dayTitle = (date: string) =>
    date === today() ? t('tx.today') : date === addDays(today(), -1) ? t('tx.yesterday') : formatDay(date, locale);

  const isFiltered = type !== 'all' || cat !== 'all' || who !== 'all' || query.trim() !== '';

  return (
    <section className="view active">
      <div className="page-head">
        <div>
          <h1>{t('nav.transactions')}</h1>
          <div className="sub">{t('tx.summary', { n: monthTotals.count, spent: money(monthTotals.expenseCents) })}</div>
        </div>
        <MonthNav month={month} onChange={setMonth} />
      </div>

      <div className="toolbar">
        <div className="search">
          <IconSearch />
          <input type="search" placeholder={t('tx.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('tx.search')} />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label={t('tx.allTypes')}>
          <option value="all">{t('tx.allTypes')}</option>
          <option value="income">{t('dash.income')}</option>
          <option value="expense">{t('dash.expenses')}</option>
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t('tx.allCategories')}>
          <option value="all">{t('tx.allCategories')}</option>
          {usedCats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {catName(c.id)}
            </option>
          ))}
        </select>
        {members.length > 1 && (
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label={t('tx.allMembers')}>
            <option value="all">{t('tx.allMembers')}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value="shared">{t('tx.shared')}</option>
          </select>
        )}
      </div>

      <div className="card">
        {groups.length === 0 ? (
          isFiltered ? (
            <EmptyState title={t('tx.noMatch')} hint={t('tx.noMatchHint')} />
          ) : (
            <EmptyState title={t('tx.empty')} hint={t('tx.emptyHint')} onAdd={onAdd} />
          )
        ) : (
          groups.map((g) => (
            <div className="day-group" key={g.date}>
              <div className="day-head">
                <span>{dayTitle(g.date)}</span>
                <span className={`day-net mono ${g.netCents > 0 ? 'pos' : g.netCents < 0 ? 'neg' : ''}`}>
                  {money(g.netCents, undefined, { sign: 'always' })}
                </span>
              </div>
              {g.items.map((tx) => {
                const c = tx.categoryId ? categoryById.get(tx.categoryId) : undefined;
                const acct = accountById.get(tx.accountId);
                const member = tx.memberId ? memberById.get(tx.memberId) : undefined;
                // Detalle: nota · cuenta · persona (solo lo que aporta información).
                const meta = [
                  tx.note,
                  app.accounts.length > 1 ? acct?.name : '',
                  members.length > 1 ? (member?.name ?? t('tx.shared')) : '',
                ].filter(Boolean);
                return (
                  <div className="tx" key={tx.id}>
                    <div className={`tx-icon ${tx.type}`}>{c?.emoji ?? '🧾'}</div>
                    <div className="tx-main">
                      <div className="tx-cat">{catName(tx.categoryId)}</div>
                      <div className="tx-note">{meta.length ? meta.join(' · ') : '—'}</div>
                    </div>
                    <div className="tx-right">
                      <div className={`tx-amt ${tx.type}`}>
                        {tx.type === 'expense' ? '−' : '+'}
                        {money(tx.amountCents, tx.currency)}
                      </div>
                    </div>
                    <div className="tx-actions">
                      <button onClick={() => onEdit(tx)} aria-label={`${t('tx.edit')}: ${catName(tx.categoryId)}`}>
                        <IconEdit />
                      </button>
                      <button className="del" onClick={() => void remove(tx)} aria-label={`${t('tx.delete')}: ${catName(tx.categoryId)}`}>
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
