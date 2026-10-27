'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { dashboardRequest, errorMessage } from '@/lib/dashboardClient';
import { BrandDiscord } from '@/components/BrandIcons';
import { IconLayers, IconLoader, IconMessages, IconShield } from '@/components/MeowIcons';
import styles from './dashboard.module.css';

type AuthStatus = { authAvailable?: boolean; discordConfigured?: boolean; discordLogin?: boolean };

function oauthCallbackMessage(code: string | null): string {
  if (code === null) return '';
  switch (code) {
    case 'access_denied': return 'Discord sign-in was cancelled. Try again when ready.';
    case 'state_mismatch':
    case 'state_not_found': return 'This sign-in expired. Start again with Discord.';
    default: return 'Discord sign-in could not finish. Please try again.';
  }
}

export default function Login() {
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [callbackError, setCallbackError] = useState('');
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const availabilityRequest = useRef<AbortController | null>(null);
  const oauthRequest = useRef<AbortController | null>(null);

  const checkAvailability = useCallback(async () => {
    availabilityRequest.current?.abort();
    const controller = new AbortController();
    availabilityRequest.current = controller;
    setLoading(true); setError('');
    try { const next = await dashboardRequest<AuthStatus>('/api/platform/status', { signal: controller.signal }); if (!controller.signal.aborted) setStatus(next); }
    catch { if (!controller.signal.aborted) { setStatus(null); setError('Sign-in availability could not be checked. Please try again.'); } }
    finally { if (!controller.signal.aborted) setLoading(false); if (availabilityRequest.current === controller) availabilityRequest.current = null; }
  }, []);

  useEffect(() => {
    setPending(false);
    // Provider query values are untrusted. Only fixed, whitelisted messages reach the UI.
    setCallbackError(oauthCallbackMessage(new URLSearchParams(window.location.search).get('error')));
    void checkAvailability();
    return () => { availabilityRequest.current?.abort(); oauthRequest.current?.abort(); oauthRequest.current = null; };
  }, [checkAvailability]);

  const available = status?.authAvailable === true && status?.discordLogin === true;

  async function discordSignIn() {
    if (pending || oauthRequest.current || !available) return;
    const controller = new AbortController();
    oauthRequest.current = controller;
    setPending(true); setError(''); setCallbackError('');
    try {
      const data = await dashboardRequest<{ url?: string }>('/api/auth/sign-in/social', { method: 'POST', signal: controller.signal, body: JSON.stringify({ provider: 'discord', callbackURL: '/dashboard' }) });
      if (controller.signal.aborted) return;
      if (data.url) window.location.assign(data.url);
      else throw new Error('Discord sign-in is not available yet.');
    } catch (reason) { if (!controller.signal.aborted) { setError(errorMessage(reason)); setPending(false); } }
    finally { if (oauthRequest.current === controller) oauthRequest.current = null; }
  }

  return <main className={styles.login}>
    <header className={styles.loginTopbar}>
      <Link className={styles.brand} href="/"><img className={styles.brandIcon} src={encodeURI('/MEAWHOOK ICON WHITE.svg')} alt="Meowhook" /><img className={styles.brandWord} src={encodeURI('/MEAWHOOK WHITE LETTER.svg')} alt="" /></Link>
      <Link className={styles.quietLink} href="/">Back to editor <span aria-hidden>↗</span></Link>
    </header>
    <div className={styles.loginLayout}>
      <section className={styles.loginIntro}>
        <span className={styles.eyebrow}>Your Discord workspace</span>
        <h1>Good messages.<br />A better home for them.</h1>
        <p>Bring your messages, roles, forms, and schedules together in Meowhook.</p>
        <ul className={styles.loginFeatures}>
          <li><IconLayers size={19} /><span><strong>Keep everything together</strong><small>Your Discord account, your saved messages and embeds.</small></span></li>
          <li><IconMessages size={19} /><span><strong>Make messages interactive</strong><small>Role menus, buttons, forms, and app commands.</small></span></li>
          <li><IconShield size={19} /><span><strong>Your servers, your controls</strong><small>Manage what the bot can do from one dashboard.</small></span></li>
        </ul>
      </section>
      <section className={styles.loginCard} aria-labelledby="login-title">
        <div className={styles.loginCardIcon}><BrandDiscord size={23} /></div>
        <h2 id="login-title">Sign in with Discord</h2>
        <p>Use your Discord account to open your Meowhook workspace.</p>
        <div className={styles.discordLoginAction}>
          <button className={styles.primaryButton} type="button" onClick={discordSignIn} disabled={pending || loading || !available} aria-describedby="discord-login-status" aria-busy={pending || loading}>{pending || loading ? <IconLoader size={18} className={styles.spin} /> : <BrandDiscord size={18} />}{pending ? 'Opening Discord…' : 'Continue with Discord'}</button>
          <p id="discord-login-status" className={styles.loginIdentityNote}>{loading ? 'Checking Discord sign-in…' : available ? 'Your dashboard uses your Discord name, avatar, and server access.' : status ? 'Discord sign-in is not available on this deployment yet. The webhook editor is still available.' : 'Sign-in is temporarily unavailable.'}</p>
          {(error || callbackError) && <p className={styles.error} role="alert">{error || callbackError}</p>}
          {!loading && !status && <button type="button" className={styles.secondaryButton} onClick={() => void checkAvailability()}>Try again</button>}
        </div>
        <p className={styles.legal}>By continuing, you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.</p>
      </section>
    </div>
  </main>;
}
