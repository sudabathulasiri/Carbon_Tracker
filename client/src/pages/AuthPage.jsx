/**
 * pages/AuthPage.jsx — Carbon Footprint Tracker
 *
 * Combined login / register page. Toggled by the `mode` query param.
 * On success, navigates to /dashboard via React Router.
 *
 * The baseline carbon onboarding step is embedded in the register flow
 * as a second screen so users understand what they're committing to.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// ─── Baseline presets shown during registration ────────────────────────────

const BASELINE_PRESETS = [
  { label: 'Low (city, transit, plant-based)',  value: 6,  icon: '🌿' },
  { label: 'Average (mixed lifestyle)',          value: 12, icon: '🌍' },
  { label: 'High (car-dependent, frequent meat)',value: 20, icon: '🚗' },
  { label: 'Very high (lots of flying)',         value: 30, icon: '✈️' },
];

// ─── Field component ──────────────────────────────────────────────────────

const Field = ({ label, id, error, children }) => (
  <div className="space-y-1.5">
    <label htmlFor={id} className="block text-[#a8c5a0] text-xs font-mono uppercase tracking-widest">
      {label}
    </label>
    {children}
    {error && <p className="text-[#ff6b6b] text-xs font-mono">{error}</p>}
  </div>
);

const Input = ({ id, type = 'text', value, onChange, placeholder, autoComplete, ...rest }) => (
  <input
    id={id}
    type={type}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    autoComplete={autoComplete}
    className="w-full bg-[#162616] border border-[#2d4a2d] text-[#f0ede8] font-mono text-sm
               rounded-lg px-3 py-2.5 outline-none focus:border-[#4a7c59] transition-colors
               placeholder:text-[#4a5568]"
    {...rest}
  />
);

// ─── AuthPage ─────────────────────────────────────────────────────────────

const AuthPage = () => {
  const navigate        = useNavigate();
  const [params]        = useSearchParams();
  const { login, register, loading, error, clearError } = useAuth();

  const isRegister = params.get('mode') === 'register';

  // ── Form state ──────────────────────────────────────────────────────────
  const [step,     setStep]     = useState(0); // 0 = credentials, 1 = baseline
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [baseline, setBaseline] = useState(12);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => { clearError(); setStep(0); }, [isRegister]);

  // ── Validation ──────────────────────────────────────────────────────────

  const validateCredentials = () => {
    const errs = {};
    if (isRegister && name.trim().length < 2)      errs.name     = 'Name must be at least 2 characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email    = 'Enter a valid email address.';
    if (password.length < 8)                        errs.password = 'Password must be at least 8 characters.';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!validateCredentials()) return;
    const res = await login(email, password);
    if (res.success) navigate('/dashboard', { replace: true });
  };

  const handleRegisterNext = (e) => {
    e.preventDefault();
    if (validateCredentials()) setStep(1);
  };

  const handleRegisterSubmit = async () => {
    const res = await register({ name, email, password, baselineCarbon: baseline });
    if (res.success) navigate('/dashboard', { replace: true });
  };

  // ── Register — step 1: credentials ──────────────────────────────────────
  const renderRegisterCredentials = () => (
    <form onSubmit={handleRegisterNext} className="space-y-5" noValidate>
      <Field label="Your name" id="name" error={fieldErrors.name}>
        <Input
          id="name" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Alex Smith" autoComplete="name"
        />
      </Field>
      <Field label="Email" id="email" error={fieldErrors.email}>
        <Input
          id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com" autoComplete="email"
        />
      </Field>
      <Field label="Password" id="password" error={fieldErrors.password}>
        <Input
          id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="8+ characters" autoComplete="new-password"
        />
      </Field>
      <button type="submit"
        className="w-full bg-[#4a7c59] hover:bg-[#5a9c70] text-[#f0ede8] font-mono font-semibold
                   text-sm py-3 rounded-lg transition-colors focus:outline-none focus:ring-2
                   focus:ring-[#a8c5a0]">
        Continue →
      </button>
    </form>
  );

  // ── Register — step 2: baseline ──────────────────────────────────────────
  const renderBaselineStep = () => (
    <div className="space-y-5">
      <p className="text-[#6b8f6b] text-sm leading-relaxed">
        Your <span className="text-[#a8c5a0]">daily baseline</span> is what you'll
        measure progress against. Pick the option that best describes your current lifestyle.
        You can update this later.
      </p>

      <div className="space-y-2.5">
        {BASELINE_PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => setBaseline(p.value)}
            className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg border text-left
                        font-mono text-sm transition-all
                        ${baseline === p.value
                          ? 'border-[#4a7c59] bg-[#4a7c59]/15 text-[#f0ede8]'
                          : 'border-[#2d4a2d] bg-[#162616] text-[#a8c5a0] hover:border-[#4a7c59]/60'}`}
          >
            <span className="text-xl w-7 text-center">{p.icon}</span>
            <div className="flex-1">
              <span>{p.label}</span>
            </div>
            <span className={`font-semibold shrink-0 ${baseline === p.value ? 'text-[#4a7c59]' : 'text-[#6b8f6b]'}`}>
              {p.value} kg/day
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-[#c0392b]/10 border border-[#c0392b]/30 rounded-lg px-4 py-3
                        text-[#ff6b6b] text-sm font-mono">{error}</div>
      )}

      <div className="flex gap-3 pt-1">
        <button onClick={() => setStep(0)}
          className="flex-1 border border-[#2d4a2d] hover:border-[#4a7c59] text-[#a8c5a0]
                     font-mono text-sm py-2.5 rounded-lg transition-colors">
          ← Back
        </button>
        <button onClick={handleRegisterSubmit} disabled={loading}
          className="flex-1 bg-[#4a7c59] hover:bg-[#5a9c70] disabled:opacity-50
                     text-[#f0ede8] font-mono font-semibold text-sm py-2.5 rounded-lg
                     transition-colors">
          {loading ? 'Creating account…' : 'Start tracking →'}
        </button>
      </div>
    </div>
  );

  // ── Login form ───────────────────────────────────────────────────────────
  const renderLogin = () => (
    <form onSubmit={handleLoginSubmit} className="space-y-5" noValidate>
      <Field label="Email" id="login-email" error={fieldErrors.email}>
        <Input
          id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com" autoComplete="email"
        />
      </Field>
      <Field label="Password" id="login-password" error={fieldErrors.password}>
        <Input
          id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password" autoComplete="current-password"
        />
      </Field>

      {error && (
        <div className="bg-[#c0392b]/10 border border-[#c0392b]/30 rounded-lg px-4 py-3
                        text-[#ff6b6b] text-sm font-mono">{error}</div>
      )}

      <button type="submit" disabled={loading}
        className="w-full bg-[#4a7c59] hover:bg-[#5a9c70] disabled:opacity-50
                   text-[#f0ede8] font-mono font-semibold text-sm py-3 rounded-lg
                   transition-colors focus:outline-none focus:ring-2 focus:ring-[#a8c5a0]">
        {loading ? 'Signing in…' : 'Sign in →'}
      </button>
    </form>
  );

  return (
    <div className="min-h-screen bg-[#111d11] flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Logo / wordmark */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🌿</div>
          <h1 className="text-[#f0ede8] text-2xl font-semibold tracking-tight">
            Carbon Tracker
          </h1>
          <p className="text-[#6b8f6b] font-mono text-xs mt-1 uppercase tracking-widest">
            {isRegister
              ? step === 0 ? 'Create your account' : 'Set your baseline'
              : 'Welcome back'}
          </p>
        </div>

        {/* Card */}
        {params.get('expired') === 'true' && !isRegister && (
          <div className="bg-[#d47c2a]/10 border border-[#d47c2a]/30 rounded-lg p-4 mb-4 text-center">
            <p className="text-[#d47c2a] font-mono text-xs font-semibold">
              ⚠️ Your session has expired. Please sign in again.
            </p>
          </div>
        )}

        <div className="bg-[#1a2e1a] border border-[#1e2e1e] rounded-xl p-7 shadow-2xl">
          {isRegister
            ? (step === 0 ? renderRegisterCredentials() : renderBaselineStep())
            : renderLogin()
          }
        </div>

        {/* Toggle */}
        <p className="text-center text-[#6b8f6b] font-mono text-sm mt-6">
          {isRegister ? (
            <>Already have an account?{' '}
              <Link to="/auth" className="text-[#a8c5a0] hover:text-[#f0ede8] transition-colors">
                Sign in
              </Link>
            </>
          ) : (
            <>New here?{' '}
              <Link to="/auth?mode=register" className="text-[#a8c5a0] hover:text-[#f0ede8] transition-colors">
                Create account
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
};

export default AuthPage;