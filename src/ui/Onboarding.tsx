/**
 * BIENVENIDA GUIADA (menos de 3 minutos)
 * 1. Idioma y tu nombre · 2. Tu pareja (opcional) · 3. Tus cuentas · 4. ¡Listo!
 * Todo se puede cambiar después en Ajustes. Se puede saltar en cualquier paso.
 */
import { useState } from 'react';
import { useApp } from './context';
import { db } from '../data/db';
import * as repo from '../data/repo';
import type { CurrencyCode } from '../domain/money';
import type { AccountType, Id, Locale } from '../domain/types';
import type { MessageKey } from '../i18n';
import { Logo } from './icons';

interface Preset {
  key: string;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  institution: string;
  /** null = compartida; si no, el id de la persona dueña. */
  ownerId: Id | null;
  checked: boolean;
}

/** Cuentas sugeridas para CIBC + Wealthsimple. Las registradas son individuales (por ley). */
function presets(members: { id: Id; name: string }[]): Preset[] {
  const shared: Preset[] = [
    { key: 'cibc-chq', name: 'CIBC Chequing', type: 'chequing', currency: 'CAD', institution: 'CIBC', ownerId: null, checked: true },
    { key: 'cibc-cc', name: 'CIBC Visa', type: 'credit_card', currency: 'CAD', institution: 'CIBC', ownerId: null, checked: true },
    { key: 'cibc-sav', name: 'CIBC Savings', type: 'savings', currency: 'CAD', institution: 'CIBC', ownerId: null, checked: false },
    { key: 'ws-cash', name: 'Wealthsimple Cash', type: 'chequing', currency: 'CAD', institution: 'Wealthsimple', ownerId: null, checked: false },
  ];
  const personal = members.flatMap((m) => {
    const suffix = members.length > 1 ? ` · ${m.name}` : '';
    return [
      { key: `${m.id}-tfsa`, name: `Wealthsimple TFSA${suffix}`, type: 'tfsa' as const, checked: true },
      { key: `${m.id}-rrsp`, name: `Wealthsimple RRSP${suffix}`, type: 'rrsp' as const, checked: false },
      { key: `${m.id}-fhsa`, name: `Wealthsimple FHSA${suffix}`, type: 'fhsa' as const, checked: false },
      { key: `${m.id}-nonreg`, name: `Wealthsimple Non-registered${suffix}`, type: 'non_registered' as const, checked: false },
      { key: `${m.id}-crypto`, name: `Wealthsimple Crypto${suffix}`, type: 'crypto' as const, checked: false },
    ].map((p) => ({ ...p, currency: 'CAD' as CurrencyCode, institution: 'Wealthsimple', ownerId: m.id }));
  });
  return [...shared, ...personal];
}

export function Onboarding({ onDone }: { onDone: (addFirst: boolean) => void }) {
  const app = useApp();
  const { t, settings, members } = app;
  const me = members.find((m) => m.id === settings.currentMemberId) ?? members[0];
  const [step, setStep] = useState(0);
  const [locale, setLocale] = useState<Locale>(settings.locale);
  const [myName, setMyName] = useState(me?.name ?? '');
  const [partner, setPartner] = useState('');
  const [list, setList] = useState<Preset[]>([]);
  const [busy, setBusy] = useState(false);

  const finish = async (addFirst: boolean) => {
    await app.run(() => repo.updateSettings(db, { onboarded: true }));
    onDone(addFirst);
  };

  /** Paso 1 → 2: idioma y nombre. */
  const saveMe = async () => {
    await app.run(async () => {
      await repo.updateSettings(db, { locale });
      if (me && myName.trim()) await repo.renameMember(db, me.id, myName);
    });
    setStep(1);
  };

  /** Paso 2 → 3: pareja (opcional). Prepara las cuentas sugeridas. */
  const savePartner = async (skip: boolean) => {
    const people = [{ id: me?.id ?? 'member-1', name: myName.trim() || me?.name || '' }];
    if (!skip && partner.trim()) {
      const existing = members.find((m) => m.id !== me?.id && m.name.toLowerCase() === partner.trim().toLowerCase());
      const p = existing ?? (await repo.addMember(db, partner));
      people.push({ id: p.id, name: p.name });
    }
    setList(presets(people));
    setStep(2);
  };

  /** Paso 3 → 4: crea las cuentas elegidas (la primera reutiliza la cuenta principal). */
  const saveAccounts = async () => {
    setBusy(true);
    const chosen = list.filter((p) => p.checked);
    await app.run(async () => {
      const main = await db.accounts.get('account-main');
      const unused = main && (await db.transactions.where('accountId').equals('account-main').count()) === 0;
      for (const [i, p] of chosen.entries()) {
        const input = { name: p.name.replace(/\s+/g, ' ').trim(), type: p.type, currency: p.currency, ownerId: p.ownerId, institution: p.institution };
        if (i === 0 && unused) await repo.updateAccount(db, 'account-main', input);
        else await repo.addAccount(db, input);
      }
    });
    setBusy(false);
    setStep(3);
  };

  const steps: MessageKey[] = ['onb.step1', 'onb.step2', 'onb.step3', 'onb.step4'];

  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <div className="onb-card">
        <div className="onb-top">
          <div className="brand">
            <Logo /> {t('app.name')}
          </div>
          {step < 3 && (
            <button className="link-btn" onClick={() => void finish(false)}>
              {t('onb.skip')}
            </button>
          )}
        </div>
        <ol className="onb-steps" aria-label={t('onb.progress')}>
          {steps.map((s, i) => (
            <li key={s} className={i <= step ? 'on' : ''} aria-current={i === step ? 'step' : undefined}>
              <span className="sr-only">{t(s)}</span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <>
            <h1 id="onb-title">{t('onb.welcome')}</h1>
            <p className="muted">{t('onb.welcomeText')}</p>
            <div className="field">
              <label htmlFor="onb-lang">{t('set.language')}</label>
              <div className="tabs" role="radiogroup" id="onb-lang">
                {(['es', 'en'] as const).map((l) => (
                  <button
                    key={l}
                    role="radio"
                    aria-checked={locale === l}
                    className={locale === l ? 'on' : ''}
                    onClick={() => {
                      setLocale(l);
                      void repo.updateSettings(db, { locale: l });
                    }}
                  >
                    {l === 'es' ? 'Español' : 'English'}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="onb-name">{t('onb.yourName')}</label>
              <input id="onb-name" type="text" value={myName} maxLength={40} onChange={(e) => setMyName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void saveMe()} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => void saveMe()}>
                {t('onb.next')}
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 id="onb-title">{t('onb.partnerTitle')}</h1>
            <p className="muted">{t('onb.partnerText')}</p>
            <div className="field">
              <label htmlFor="onb-partner">{t('onb.partnerName')}</label>
              <input id="onb-partner" type="text" value={partner} maxLength={40} onChange={(e) => setPartner(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void savePartner(false)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => void savePartner(true)}>
                {t('onb.justMe')}
              </button>
              <button className="btn btn-primary" onClick={() => void savePartner(false)} disabled={!partner.trim()}>
                {t('onb.next')}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 id="onb-title">{t('onb.accountsTitle')}</h1>
            <p className="muted">{t('onb.accountsText')}</p>
            <div className="onb-accounts">
              {list.map((p, i) => (
                <label key={p.key} className={`onb-account${p.checked ? ' on' : ''}`}>
                  <input type="checkbox" checked={p.checked} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)))} />
                  <span>
                    <b>{p.name}</b>
                    <small className="muted">
                      {t(`acct.${p.type}` as MessageKey)} · {p.currency}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <p className="muted small">{t('onb.accountsMore')}</p>
            <div className="modal-actions">
              <button className="btn btn-primary" disabled={busy} onClick={() => void saveAccounts()}>
                {t('onb.next')}
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 id="onb-title">{t('onb.doneTitle')}</h1>
            <ul className="onb-tips">
              <li>{t('onb.tip1')}</li>
              <li>{t('onb.tip2')}</li>
              <li>{t('onb.tip3')}</li>
              <li>{t('onb.tip4')}</li>
            </ul>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => void finish(false)}>
                {t('onb.toDashboard')}
              </button>
              <button className="btn btn-primary" onClick={() => void finish(true)}>
                {t('onb.firstExpense')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
