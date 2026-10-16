import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Clover, LogOut } from 'lucide-react';

let configPromise, client;
export function getConfig() {
  if (!configPromise) configPromise = fetch('/api/session').then(async response => {
    if (!response.ok) throw new Error('Cannot load the sign-in configuration. Please retry.');
    return response.json();
  }).catch(error => { configPromise = null; throw error; });
  return configPromise;
}
function getClient(config) {
  if (!client) client = createClient(config.supabase_url, config.publishable_key);
  return client;
}
export async function authHeaders() {
  const config = await getConfig();
  if (config.mode !== 'cloud') return { 'X-Raffle-Token': config.token };
  const { data, error } = await getClient(config).auth.getSession();
  if (error || !data.session) throw new Error('Your session ended. Sign in again to continue.');
  return { Authorization: `Bearer ${data.session.access_token}` };
}
export function SignOut() {
  return <button className="text-button" onClick={async () => {
    const config = await getConfig();
    if (config.mode === 'cloud') await getClient(config).auth.signOut();
  }}><LogOut size={14}/>Sign out</button>;
}
export default function AuthGate({ children }) {
  const [config, setConfig] = useState(null), [session, setSession] = useState(null);
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true, subscription;
    getConfig().then(async value => {
      if (!alive) return;
      setConfig(value);
      if (value.mode === 'cloud') {
        const auth = getClient(value).auth;
        const { data, error: sessionError } = await auth.getSession();
        if (sessionError) throw sessionError;
        if (!alive) return;
        setSession(data.session);
        subscription = auth.onAuthStateChange((_event, next) => { if (alive) setSession(next); }).data.subscription;
      }
      setReady(true);
    }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; subscription?.unsubscribe(); };
  }, []);
  if (ready && (config.mode !== 'cloud' || session)) return children;
  const signIn = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const { error: loginError } = await getClient(config).auth.signInWithPassword({ email: email.trim(), password });
      if (loginError) throw loginError;
      setPassword('');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <main className="loading-screen"><Clover size={36}/><h1>The Wedding Raffle</h1>
    {ready ? <form className="panel cloud-login" onSubmit={signIn}>
      <h2>Administrator sign-in</h2><p className="muted">Use your registered administrator account.</p>
      <label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required/></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required/></label>
      <button className="button primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <a className="text-button" href="/display">Open live prize display</a>
    </form> : !error && <p>Preparing your raffle desk…</p>}
    {error && <><p role="alert">{error}</p>{!ready && <button className="button" onClick={() => location.reload()}>Retry</button>}</>}
  </main>;
}
