/**
 * AJUSTES — idioma, tema, moneda, hogar, cuentas, categorías y tus datos.
 */
import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useApp } from '../context';
import { db } from '../../data/db';
import * as repo from '../../data/repo';
import { createBackup, decryptText, encryptText, isEncryptedBackup, parseBackup, transactionsToCsv } from '../../domain/backup';
import { CURRENCIES, formatRate, parseRate, type CurrencyCode } from '../../domain/money';
import { today } from '../../domain/dates';
import { ACCOUNT_TYPES, type AccountType, type CategoryKind, type Id, type ThemePref } from '../../domain/types';
import { LOCALES, type MessageKey } from '../../i18n';
import { SectionTitle } from '../components/common';
import { Field, Sheet } from '../components/kit';

/** Descarga un archivo generado en el navegador (nada sale del dispositivo). */
function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Settings() {
  const app = useApp();
  const { t, settings, transactions } = app;
  const set = (changes: Parameters<typeof repo.updateSettings>[1]) => app.run(() => repo.updateSettings(db, changes));

  return (
    <section className="view active">
      <div className="page-head">
        <div>
          <h1>{t('nav.settings')}</h1>
          <div className="sub">{t('set.subtitle')}</div>
        </div>
      </div>

      <SectionTitle>{t('set.appearance')}</SectionTitle>
      <div className="card">
        <Row label={t('set.language')} desc={t('set.languageDesc')}>
          <select value={settings.locale} onChange={(e) => void set({ locale: e.target.value as 'es' | 'en' })} aria-label={t('set.language')}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l === 'es' ? 'Español' : 'English'}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('set.theme')} desc={t('set.themeDesc')}>
          <select value={settings.theme} onChange={(e) => void set({ theme: e.target.value as ThemePref })} aria-label={t('set.theme')}>
            {(['system', 'light', 'dark'] as const).map((th) => (
              <option key={th} value={th}>
                {t(`set.theme.${th}`)}
              </option>
            ))}
          </select>
        </Row>
      </div>

      <SectionTitle>{t('set.money')}</SectionTitle>
      <div className="card">
        <Row label={t('set.baseCurrency')} desc={t('set.baseCurrencyDesc')}>
          <select
            value={settings.baseCurrency}
            onChange={(e) => void set({ baseCurrency: e.target.value as CurrencyCode, fxRates: {} })}
            aria-label={t('set.baseCurrency')}
          >
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Row>
        {CURRENCIES.filter((c) => c !== settings.baseCurrency).map((c) => (
          <FxRow key={c} from={c} />
        ))}
      </div>

      <Household />
      <Accounts />
      <Categories kind="expense" />
      <Categories kind="income" />
      <DataSection />

      <div className="sub privacy-note">{t('set.privacy', { n: transactions.length })}</div>
    </section>
  );
}

/** Tipo de cambio manual de otra moneda hacia la moneda principal. */
function FxRow({ from }: { from: CurrencyCode }) {
  const app = useApp();
  const { t, settings } = app;
  const current = settings.fxRates[from];
  const [value, setValue] = useState(current ? formatRate(current.rateMicros) : '');
  const save = () => {
    if (value.trim() === '') return;
    const rateMicros = parseRate(value);
    if (rateMicros === null) return app.toast(t('set.fxRateInvalid'));
    if (rateMicros === current?.rateMicros) return; // sin cambios
    void app.run(
      () => repo.updateSettings(db, { fxRates: { ...settings.fxRates, [from]: { rateMicros, asOf: today(), source: 'manual' } } }),
      t('set.fxRateSaved'),
    );
  };
  const to = settings.baseCurrency;
  return (
    <Row
      label={t('set.fxRate', { from, to })}
      desc={`${t('set.fxRateDesc', { from, to })} ${current ? t('set.fxRateAsOf', { date: current.asOf }) : t('set.fxRateNone')}`}
    >
      <input
        className="input-sm mono"
        inputMode="decimal"
        placeholder="1.37"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        aria-label={t('set.fxRate', { from, to })}
      />
    </Row>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div>
        <div className="label">{label}</div>
        {desc && <div className="desc">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

/** Personas del hogar: renombrar, añadir y elegir quién usa este dispositivo. */
function Household() {
  const app = useApp();
  const { t, members, settings } = app;
  const [name, setName] = useState('');

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (await app.run(() => repo.addMember(db, name), t('set.saved'))) setName('');
  };

  return (
    <>
      <SectionTitle hint={t('set.householdDesc')}>{t('set.household')}</SectionTitle>
      <div className="card">
        {members.map((m) => (
          <div className="set-row" key={m.id}>
            <div className="row-main">
              <span className="dot-color" style={{ background: m.color }} />
              <input
                className="input-inline"
                defaultValue={m.name}
                aria-label={t('set.memberName')}
                onBlur={(e) => e.target.value.trim() !== m.name && void app.run(() => repo.renameMember(db, m.id, e.target.value))}
              />
            </div>
            {settings.currentMemberId === m.id ? (
              <span className="tag">{t('set.thisDevice')}</span>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => void app.run(() => repo.updateSettings(db, { currentMemberId: m.id }))}>
                {t('set.useThisDevice')}
              </button>
            )}
          </div>
        ))}
        <form className="add-chip" onSubmit={add}>
          <input placeholder={t('set.memberName')} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label={t('set.addMember')} />
          <button className="btn btn-ghost" type="submit">
            {t('set.addMember')}
          </button>
        </form>
      </div>
    </>
  );
}

/** Cuentas: lista, añadir, cuenta predeterminada y archivar. */
function Accounts() {
  const app = useApp();
  const { t, accounts, members, settings } = app;
  const [form, setForm] = useState<repo.AccountInput>({ name: '', type: 'chequing', currency: 'CAD', ownerId: null, institution: '' });
  const [showArchived, setShowArchived] = useState(false);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (await app.run(() => repo.addAccount(db, form), t('set.saved'))) setForm({ ...form, name: '', institution: '' });
  };
  const owner = (id: Id | null) => (id ? (members.find((m) => m.id === id)?.name ?? '?') : t('tx.shared'));
  const visible = accounts.filter((a) => showArchived || !a.archived);

  return (
    <>
      <SectionTitle hint={t('set.accountsDesc')}>{t('set.accounts')}</SectionTitle>
      <div className="card">
        {visible.map((a) => (
          <div className={`set-row${a.archived ? ' archived' : ''}`} key={a.id}>
            <div>
              <div className="label">
                {a.name} <span className="tag">{a.currency}</span>
                {settings.defaultAccountId === a.id && <span className="tag tag-brand">{t('set.default')}</span>}
              </div>
              <div className="desc">
                {[t(`acct.${a.type}` as MessageKey), a.institution, owner(a.ownerId)].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="row-actions">
              {!a.archived && settings.defaultAccountId !== a.id && (
                <button className="btn btn-ghost btn-sm" onClick={() => void app.run(() => repo.updateSettings(db, { defaultAccountId: a.id }))}>
                  {t('set.makeDefault')}
                </button>
              )}
              {settings.defaultAccountId !== a.id && (
                <button className="btn btn-ghost btn-sm" onClick={() => void app.run(() => repo.setAccountArchived(db, a.id, !a.archived))}>
                  {a.archived ? t('set.unarchive') : t('set.archive')}
                </button>
              )}
            </div>
          </div>
        ))}
        {accounts.some((a) => a.archived) && (
          <button className="link-btn" onClick={() => setShowArchived(!showArchived)}>
            {t('set.archivedList')} ({accounts.filter((a) => a.archived).length})
          </button>
        )}
        <form className="account-form" onSubmit={add}>
          <input placeholder={t('set.accountName')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} aria-label={t('set.accountName')} />
          <input placeholder={t('set.institution')} value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} maxLength={60} aria-label={t('set.institution')} />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })} aria-label={t('form.account')}>
            {ACCOUNT_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`acct.${ty}` as MessageKey)}
              </option>
            ))}
          </select>
          <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as CurrencyCode })} aria-label={t('set.money')}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select value={form.ownerId ?? ''} onChange={(e) => setForm({ ...form, ownerId: e.target.value || null })} aria-label={t('set.owner')}>
            <option value="">{t('tx.shared')}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost" type="submit">
            {t('set.addAccount')}
          </button>
        </form>
      </div>
    </>
  );
}

/** Categorías: añadir, archivar (no se borran) y reactivar. */
function Categories({ kind }: { kind: CategoryKind }) {
  const app = useApp();
  const { t, categories, catName } = app;
  const [name, setName] = useState('');
  const list = categories.filter((c) => c.kind === kind);
  const active = list.filter((c) => !c.archived);
  const archived = list.filter((c) => c.archived);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (await app.run(() => repo.addCategory(db, kind, name, ''), t('set.saved'))) setName('');
  };

  return (
    <>
      <SectionTitle hint={t('set.categoryArchivedHint')}>{t(kind === 'expense' ? 'set.expenseCategories' : 'set.incomeCategories')}</SectionTitle>
      <div className="card">
        <div className="chip-list">
          {active.map((c) => (
            <span className="chip" key={c.id}>
              <span className="chip-em">{c.emoji}</span>
              {catName(c.id)}
              <button className="chip-x" onClick={() => void app.run(() => repo.setCategoryArchived(db, c.id, true))} aria-label={`${t('set.archive')}: ${catName(c.id)}`}>
                ×
              </button>
            </span>
          ))}
        </div>
        {archived.length > 0 && (
          <div className="chip-list archived-chips">
            <span className="desc">{t('set.archivedList')}:</span>
            {archived.map((c) => (
              <button className="chip chip-off" key={c.id} onClick={() => void app.run(() => repo.setCategoryArchived(db, c.id, false))} title={t('set.unarchive')}>
                <span className="chip-em">{c.emoji}</span>
                {catName(c.id)} ↺
              </button>
            ))}
          </div>
        )}
        <form className="add-chip" onSubmit={add}>
          <input placeholder={t('set.newCategory')} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label={t('set.newCategory')} />
          <button className="btn btn-ghost" type="submit">
            {t('set.add')}
          </button>
        </form>
      </div>
    </>
  );
}

/** Respaldo, exportación y borrado. */
function DataSection() {
  const app = useApp();
  const { t, transactions, catName, accountById, memberById } = app;
  const fileRef = useRef<HTMLInputElement>(null);
  const stamp = () => today();

  const exportJson = async () => {
    const data = await repo.exportAll(db);
    download(`mis-finanzas-${stamp()}.json`, JSON.stringify(createBackup(data), null, 2), 'application/json');
    app.toast(t('set.exported'));
  };

  const exportCsv = () => {
    const csv = transactionsToCsv(transactions, {
      account: (id) => accountById.get(id)?.name ?? '',
      category: (id) => catName(id),
      member: (id) => (id ? (memberById.get(id)?.name ?? '') : t('tx.shared')),
    });
    download(`mis-finanzas-movimientos-${stamp()}.csv`, csv, 'text/csv;charset=utf-8');
    app.toast(t('set.exported'));
  };

  // Respaldo cifrado: 'export' pide contraseña para cifrar; 'import' para abrir uno cifrado.
  const [crypt, setCrypt] = useState<{ mode: 'export' } | { mode: 'import'; text: string } | null>(null);

  const restore = async (text: string) => {
    const result = parseBackup(text);
    if (!result.ok) return app.toast(result.error);
    if (!window.confirm(t('set.importConfirm', { n: result.data.transactions.length }))) return;
    await app.run(() => repo.replaceAll(db, result.data), t('set.imported'));
  };

  const importJson = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;
    const text = await file.text();
    if (isEncryptedBackup(text)) setCrypt({ mode: 'import', text });
    else await restore(text);
  };

  const wipe = async () => {
    if (!window.confirm(t('set.wipeConfirm')) || !window.confirm(t('set.wipeConfirm2'))) return;
    await app.run(() => repo.wipeTransactions(db), t('set.wiped'));
  };

  return (
    <>
      <SectionTitle>{t('set.data')}</SectionTitle>
      <div className="card">
        <Row label={t('set.exportJson')} desc={t('set.exportJsonDesc')}>
          <button className="btn btn-ghost" onClick={() => void exportJson()}>
            {t('set.download')}
          </button>
        </Row>
        <Row label={t('set.exportEncrypted')} desc={t('set.exportEncryptedDesc')}>
          <button className="btn btn-ghost" onClick={() => setCrypt({ mode: 'export' })}>
            {t('set.download')}
          </button>
        </Row>
        <Row label={t('set.exportCsv')} desc={t('set.exportCsvDesc')}>
          <button className="btn btn-ghost" onClick={exportCsv}>
            {t('set.download')}
          </button>
        </Row>
        <Row label={t('set.import')} desc={t('set.importDesc')}>
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            {t('set.restore')}
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void importJson(e)} />
        </Row>
        <Row label={t('set.wipe')} desc={t('set.wipeDesc')}>
          <button className="btn btn-danger" onClick={() => void wipe()}>
            {t('set.delete')}
          </button>
        </Row>
      </div>
      {crypt && (
        <PassphraseSheet
          mode={crypt.mode}
          onClose={() => setCrypt(null)}
          onSubmit={async (pass) => {
            if (crypt.mode === 'export') {
              const data = await repo.exportAll(db);
              const enc = await encryptText(JSON.stringify(createBackup(data)), pass);
              download(`mis-finanzas-cifrado-${stamp()}.json`, enc, 'application/json');
              app.toast(t('set.exported'));
            } else {
              await restore(await decryptText(crypt.text, pass));
            }
          }}
        />
      )}
    </>
  );
}

/** Pide la contraseña del respaldo cifrado (dos veces al crear uno). */
function PassphraseSheet({ mode, onClose, onSubmit }: { mode: 'export' | 'import'; onClose: () => void; onSubmit: (pass: string) => Promise<void> }) {
  const app = useApp();
  const { t } = app;
  const [pass, setPass] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (mode === 'export' && pass !== repeat) return app.toast(t('set.passphraseMismatch'));
    setBusy(true);
    const ok = await app.run(() => onSubmit(pass));
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet
      title={t('set.exportEncrypted')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('form.cancel')}
          </button>
          <button className="btn btn-primary" disabled={busy || pass.length < 8} onClick={() => void submit()}>
            {busy ? t('set.encrypting') : mode === 'export' ? t('set.download') : t('set.open')}
          </button>
        </>
      }
    >
      <p className="sheet-note">{mode === 'export' ? t('set.passphraseWarning') : t('set.passphraseOpen')}</p>
      <Field label={t('set.passphrase')} htmlFor="pp1">
        <input id="pp1" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && mode === 'import' && void submit()} />
      </Field>
      {mode === 'export' && (
        <Field label={t('set.passphraseRepeat')} htmlFor="pp2">
          <input id="pp2" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} />
        </Field>
      )}
    </Sheet>
  );
}

