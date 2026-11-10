/**
 * REGISTRO RÁPIDO (añadir / editar movimiento)
 * ============================================
 * Objetivo: registrar un gasto en menos de 5 segundos.
 *  1. Se abre con el cursor en "Cantidad" y el teclado numérico.
 *  2. Las categorías que más usas aparecen primero (ya hay una elegida).
 *  3. Fecha = hoy, cuenta y persona = las de este dispositivo.
 *  4. Enter guarda.
 * Cuenta y persona solo se muestran si hay más de una opción.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useApp } from './context';
import { db } from '../data/db';
import * as repo from '../data/repo';
import { centsToInput, parseAmount } from '../domain/money';
import { addDays, today, type LocalDate } from '../domain/dates';
import { categoryUsage } from '../domain/stats';
import type { CategoryKind, Id, Transaction } from '../domain/types';
import { IconArrowDown, IconArrowUp, IconClose } from './icons';

interface Props {
  /** Movimiento a editar, o null para uno nuevo. */
  editing: Transaction | null;
  onClose: () => void;
  onSaved: (date: LocalDate) => void;
}

export function QuickAdd({ editing, onClose, onSaved }: Props) {
  const app = useApp();
  const { t, settings, accounts, members, categories, transactions, catName, money } = app;

  const activeAccounts = accounts.filter((a) => !a.archived || a.id === editing?.accountId);
  const fallbackAccount =
    activeAccounts.find((a) => a.id === settings.defaultAccountId && !a.archived) ?? activeAccounts[0];

  const [type, setType] = useState<CategoryKind>(editing?.type === 'income' ? 'income' : 'expense');
  const [amount, setAmount] = useState(editing ? centsToInput(editing.amountCents) : '');
  const [date, setDate] = useState<LocalDate>(editing?.date ?? today());
  const [note, setNote] = useState(editing?.note ?? '');
  const [accountId, setAccountId] = useState<Id | undefined>(editing?.accountId ?? fallbackAccount?.id);
  const [memberId, setMemberId] = useState<Id | null>(editing ? editing.memberId : settings.currentMemberId);

  // Categorías del tipo elegido: primero las más usadas en los últimos 90 días.
  const usage = useMemo(() => categoryUsage(transactions, addDays(today(), -90)), [transactions]);
  const options = useMemo(
    () =>
      categories
        .filter((c) => c.kind === type && (!c.archived || c.id === editing?.categoryId))
        .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.order - b.order),
    [categories, type, usage, editing],
  );
  const [categoryId, setCategoryId] = useState<Id | null>(editing?.categoryId ?? options[0]?.id ?? null);

  const switchType = (next: CategoryKind) => {
    if (next === type) return;
    setType(next);
    const first = categories
      .filter((c) => c.kind === next && !c.archived)
      .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.order - b.order)[0];
    setCategoryId(first?.id ?? null);
  };

  // Al abrir: foco en la cantidad. Al cerrar: devolver el foco a donde estaba.
  const amountRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const id = window.setTimeout(() => amountRef.current?.focus(), 80);
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, []);

  const save = async () => {
    const cents = parseAmount(amount);
    if (cents === null || cents <= 0) {
      app.toast(t('form.invalidAmount'));
      amountRef.current?.focus();
      return;
    }
    if (!categoryId) return app.toast(t('form.pickCategory'));
    if (!accountId) return;
    const input: repo.TransactionInput = { type, amountCents: cents, accountId, categoryId, date, note, memberId };
    const ok = await app.run(
      () => (editing ? repo.updateTransaction(db, editing.id, input) : repo.addTransaction(db, input)),
      editing ? t('form.updated') : t(type === 'income' ? 'form.added.income' : 'form.added.expense'),
    );
    if (ok) onSaved(date);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    // Enter guarda, salvo si el foco está en un botón (Enter sobre "Cancelar" cancela).
    if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      void save();
    }
  };

  const yesterday = addDays(today(), -1);
  const account = accounts.find((a) => a.id === accountId);
  const preview = parseAmount(amount);

  return (
    <div className="backdrop open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onKeyDown={onKeyDown}>
        <div className="modal-head">
          <h2 id="modal-title">{editing ? t('form.edit') : t('form.new')}</h2>
          <button className="modal-close" onClick={onClose} aria-label={t('form.close')}>
            <IconClose />
          </button>
        </div>

        <div className="seg" data-sel={type} role="radiogroup">
          <div className="seg-thumb" />
          <button id="tt-expense" type="button" role="radio" aria-checked={type === 'expense'} onClick={() => switchType('expense')}>
            <IconArrowDown /> {t('type.expense')}
          </button>
          <button id="tt-income" type="button" role="radio" aria-checked={type === 'income'} onClick={() => switchType('income')}>
            <IconArrowUp /> {t('type.income')}
          </button>
        </div>

        <div className="field amount-input">
          <label htmlFor="f-amount">
            {t('form.amount')} {account && account.currency !== settings.baseCurrency && `(${account.currency})`}
          </label>
          <div className="amount-box">
            <span className="cur" aria-hidden="true">$</span>
            <input
            ref={amountRef}
            id="f-amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={amount !== '' && preview === null}
            aria-describedby="f-amount-preview"
            />
          </div>
          <div id="f-amount-preview" className="field-hint mono">
            {amount !== '' && (preview === null ? t('form.invalidAmount') : money(preview, account?.currency, { cents: 'always' }))}
          </div>
        </div>

        <div className="field">
          <label id="f-cat-label">{t('form.category')}</label>
          <div className="cat-grid" role="radiogroup" aria-labelledby="f-cat-label">
            {options.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={c.id === categoryId}
                className={`cat-chip${c.id === categoryId ? ' sel' : ''}`}
                onClick={() => setCategoryId(c.id)}
              >
                <span>{c.emoji}</span>
                {catName(c.id)}
                {c.archived && <em className="chip-note"> ({t('form.archived')})</em>}
              </button>
            ))}
          </div>
        </div>

        {members.length > 1 && (
          <div className="field">
            <label id="f-who-label">{t('form.who')}</label>
            <div className="date-quick" role="radiogroup" aria-labelledby="f-who-label">
              {[...members.map((m) => ({ id: m.id as Id | null, name: m.name })), { id: null, name: t('tx.shared') }].map((m) => (
                <button
                  key={m.id ?? 'shared'}
                  type="button"
                  role="radio"
                  aria-checked={memberId === m.id}
                  className={memberId === m.id ? 'on' : ''}
                  onClick={() => setMemberId(m.id)}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="f-date">{t('form.date')}</label>
          <div className="date-quick">
            <button type="button" className={date === today() ? 'on' : ''} onClick={() => setDate(today())}>
              {t('tx.today')}
            </button>
            <button type="button" className={date === yesterday ? 'on' : ''} onClick={() => setDate(yesterday)}>
              {t('tx.yesterday')}
            </button>
          </div>
          <input type="date" id="f-date" value={date} required onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>

        {activeAccounts.length > 1 && (
          <div className="field">
            <label htmlFor="f-account">{t('form.account')}</label>
            <select id="f-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor="f-note">{t('form.note')}</label>
          <input
            type="text"
            id="f-note"
            placeholder={t('form.notePlaceholder')}
            maxLength={120}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('form.cancel')}
          </button>
          <button className="btn btn-primary" onClick={() => void save()}>
            {t('form.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
