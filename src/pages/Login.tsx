import { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useAppStore } from '../store/appStore';

export default function Login() {
  const { settings, settingsLoaded, saveSettings } = useSettings();
  const { setLoggedIn, addToast } = useAppStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const isFirstTime = settingsLoaded && (!settings?.auth?.is_setup);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      addToast('error', 'Please fill in all fields');
      return;
    }

    if (isFirstTime && settings) {
      // First time setup — save credentials
      const ok = await saveSettings({
        ...settings,
        auth: { email: email.trim(), password: password.trim(), is_setup: true },
      });
      if (ok) {
        setLoggedIn(true);
        addToast('success', 'Account created — welcome!');
      }
    } else if (settings) {
      // Login — check credentials
      if (email.trim() === settings.auth.email && password.trim() === settings.auth.password) {
        setLoggedIn(true);
      } else {
        addToast('error', 'Invalid email or password');
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  if (!settingsLoaded) {
    return <div className="login-wrap"><div style={{ color: 'var(--ink-3)', fontSize: 14 }}>Loading...</div></div>;
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-icon">K</div>
          <div>
            <div className="login-brand-name">Kredo Files</div>
            <div className="login-brand-sub">Smart File Management</div>
          </div>
        </div>

        <div className="login-title">{isFirstTime ? 'Get started' : 'Welcome back'}</div>
        <div className="login-subtitle">
          {isFirstTime ? 'Create your account to continue' : 'Sign in to your account to continue'}
        </div>

        <div className="login-field">
          <label>Email address</label>
          <input
            className="login-input"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>

        <div className="login-field">
          <label>Password</label>
          <input
            className="login-input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <button className="login-btn" onClick={handleSubmit}>
          {isFirstTime ? 'Create Account' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}
