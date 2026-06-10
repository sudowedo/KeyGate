import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);
const STORAGE_KEY = 'keygate_auth_session';
const STATE_KEY = 'keygate_auth_state';
const VERIFIER_KEY = 'keygate_auth_verifier';

const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN || '';
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID || import.meta.env.VITE_CLIENT_ID || '';
const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE || '';
const issuer = auth0Domain ? `https://${auth0Domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}` : '';
const redirectUri = window.location.origin;

function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(length = 64) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  return crypto.subtle.digest('SHA-256', data);
}

function parseJwt(token) {
  try {
    const [, payload] = String(token || '').split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function readSession() {
  try {
    const session = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!session?.access_token || !session?.expires_at) return null;
    if (Number(session.expires_at) <= Date.now() + 30000) return null;
    return session;
  } catch {
    return null;
  }
}

function writeSession(tokenResponse) {
  const accessPayload = parseJwt(tokenResponse.access_token) || {};
  const idPayload = parseJwt(tokenResponse.id_token) || {};
  const expiresIn = Number(tokenResponse.expires_in || 3600);
  const session = {
    access_token: tokenResponse.access_token,
    id_token: tokenResponse.id_token || null,
    expires_at: Date.now() + expiresIn * 1000,
    user: {
      sub: idPayload.sub || accessPayload.sub || '',
      email: idPayload.email || accessPayload.email || '',
      name: idPayload.name || idPayload.nickname || idPayload.email || 'KeyGate User',
      picture: idPayload.picture || '',
    },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

async function exchangeCodeForToken(code, verifier) {
  const response = await fetch(`${issuer}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: auth0ClientId,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error_description || body.error || `Auth0 token exchange failed with HTTP ${response.status}`);
  return writeSession(body);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => readSession());
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  const isConfigured = Boolean(issuer && auth0ClientId && auth0Audience);

  useEffect(() => {
    let cancelled = false;
    const finish = () => { if (!cancelled) setIsLoading(false); };

    const completeCallback = async () => {
      if (!isConfigured) return finish();
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const returnedState = params.get('state');
      const error = params.get('error');
      if (error) {
        setAuthError(params.get('error_description') || error);
        window.history.replaceState({}, '', window.location.pathname || '/console');
        window.dispatchEvent(new PopStateEvent('popstate'));
        return finish();
      }
      if (!code) return finish();
      const expectedState = sessionStorage.getItem(STATE_KEY);
      const verifier = sessionStorage.getItem(VERIFIER_KEY);
      sessionStorage.removeItem(STATE_KEY);
      sessionStorage.removeItem(VERIFIER_KEY);
      if (!expectedState || expectedState !== returnedState || !verifier) {
        setAuthError('Auth callback verification failed. Please try signing in again.');
        window.history.replaceState({}, '', '/console');
        window.dispatchEvent(new PopStateEvent('popstate'));
        return finish();
      }
      try {
        const nextSession = await exchangeCodeForToken(code, verifier);
        if (!cancelled) setSession(nextSession);
        const returnTo = sessionStorage.getItem('keygate_return_to') || '/console';
        sessionStorage.removeItem('keygate_return_to');
        window.history.replaceState({}, '', returnTo);
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch (err) {
        if (!cancelled) setAuthError(err.message || 'Unable to complete sign in.');
        window.history.replaceState({}, '', '/console');
        window.dispatchEvent(new PopStateEvent('popstate'));
      } finally {
        finish();
      }
    };

    completeCallback();
    return () => { cancelled = true; };
  }, [isConfigured]);

  const login = async () => {
    if (!isConfigured) {
      setAuthError('Auth0 frontend variables are missing. Set VITE_AUTH0_DOMAIN, VITE_CLIENT_ID, and VITE_AUTH0_AUDIENCE in Vercel.');
      return;
    }
    const state = randomString(32);
    const verifier = randomString(96);
    const challenge = base64UrlEncode(await sha256(verifier));
    sessionStorage.setItem(STATE_KEY, state);
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem('keygate_return_to', window.location.pathname + window.location.search);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: auth0ClientId,
      redirect_uri: redirectUri,
      scope: 'openid profile email',
      audience: auth0Audience,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    window.location.assign(`${issuer}/authorize?${params.toString()}`);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    if (!isConfigured) return;
    const params = new URLSearchParams({ client_id: auth0ClientId, returnTo: redirectUri });
    window.location.assign(`${issuer}/v2/logout?${params.toString()}`);
  };

  const getAccessToken = async () => {
    const fresh = readSession();
    if (!fresh) throw new Error('Your session expired. Please sign in again.');
    if (fresh.access_token !== session?.access_token) setSession(fresh);
    return fresh.access_token;
  };

  const value = useMemo(() => ({
    user: session?.user || null,
    isAuthenticated: Boolean(session?.access_token),
    isLoading,
    authError,
    isConfigured,
    login,
    logout,
    getAccessToken,
  }), [session, isLoading, authError, isConfigured]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
