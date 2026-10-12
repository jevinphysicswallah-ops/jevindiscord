import { FormEvent, useState } from 'react';
import { ApiError, api, jsonBody } from '../lib/api';
import type { User } from '../types';
import { Icon } from './Icon';

interface AuthScreenProps {
  onAuthenticated: (user: User) => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const result = await api<{ user: User }>(`/api/auth/${mode}`, {
        method: 'POST',
        ...jsonBody(payload),
      });
      onAuthenticated(result.user);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Nexus could not connect. Is the server running?');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-orb auth-orb-one" />
      <div className="auth-orb auth-orb-two" />
      <section className="auth-story">
        <a className="brand brand-large" href="/" aria-label="Nexus home">
          <span className="brand-mark"><span>N</span></span>
          <span>Nexus</span>
        </a>
        <div className="eyebrow"><Icon name="sparkles" size={15} /> BUILT FOR THE SQUAD</div>
        <h1>Play together.<br /><span>Stay in sync.</span></h1>
        <p>One vivid space for voice, video, game nights, and shared listening—without the tab chaos.</p>
        <div className="auth-proof">
          <div className="avatar-stack" aria-label="People already in a room">
            {['Nova', 'Kai', 'Mira', 'Jax'].map((name, index) => <span key={name} style={{ '--avatar-index': index } as React.CSSProperties}>{name[0]}</span>)}
          </div>
          <div><strong>Room is warming up</strong><small>Jump in when you’re ready</small></div>
        </div>
        <div className="wave-line" aria-hidden="true">{Array.from({ length: 34 }, (_, index) => <i key={index} style={{ height: `${12 + ((index * 17) % 40)}px` }} />)}</div>
      </section>

      <section className="auth-card-wrap">
        <div className="auth-card glass-card">
          <header>
            <span className="secure-chip"><Icon name="shield" size={14} /> Encrypted session</span>
            <h2>{mode === 'login' ? 'Welcome back' : 'Create your player card'}</h2>
            <p>{mode === 'login' ? 'Your party is waiting on the other side.' : 'Pick a name your friends will recognize.'}</p>
          </header>
          <div className="segmented" role="tablist" aria-label="Authentication mode">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }} type="button" role="tab">Sign in</button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }} type="button" role="tab">Create account</button>
          </div>
          <form onSubmit={submit} className="auth-form">
            {mode === 'register' && (
              <>
                <label>Display name<input name="displayName" autoComplete="name" placeholder="Jevin" required maxLength={40} /></label>
                <label>Username<input name="username" autoComplete="username" placeholder="jevinplays" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" /></label>
                <label>Email<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} /></label>
              </>
            )}
            {mode === 'login' && <label>Username or email<input name="login" autoComplete="username" placeholder="you@example.com" required /></label>}
            <label>Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="At least 8 characters" minLength={8} maxLength={128} required /></label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="primary-button auth-submit" type="submit" disabled={busy}>
              {busy ? <span className="button-spinner" /> : <Icon name="sparkles" size={18} />}
              {busy ? 'Connecting…' : mode === 'login' ? 'Enter Nexus' : 'Create account'}
            </button>
          </form>
          <p className="auth-legal">By continuing, you agree to treat everyone in the room like a human.</p>
        </div>
      </section>
    </main>
  );
}
