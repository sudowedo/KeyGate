import { LogoFull } from '../components/parts/Logo';
import { useAuth } from '../contexts/AuthContext';

export default function LoginView() {
  const { login, authError, isConfigured } = useAuth();

  return (
    <div className='auth-page'>
      <div className='auth-card'>
        <LogoFull size={28} />
        <div className='auth-kicker'>Secure AI access gateway</div>
        <h1>Sign in to KeyGate</h1>
        <p>
          Manage provider master keys, scoped subkeys, quota controls, and gateway logs from a protected console.
        </p>
        {!isConfigured && (
          <div className='auth-warning'>
            Auth0 is not configured. Add VITE_AUTH0_DOMAIN, VITE_CLIENT_ID, and VITE_AUTH0_AUDIENCE in Vercel.
          </div>
        )}
        {authError && <div className='auth-warning'>{authError}</div>}
        <button className='btn btn-primary auth-button' onClick={login}>Continue with Auth0</button>
        <div className='auth-note'>Google and email/password sign-in are handled by your Auth0 Universal Login.</div>
      </div>
    </div>
  );
}
