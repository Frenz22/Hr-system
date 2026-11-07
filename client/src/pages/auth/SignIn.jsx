import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, homePathFor } from '../../context/AuthContext';
import { Field, Input, Button, Alert, Card, apiError } from '../../components/ui';

const trialPassword = '123456789';
const trialAccounts = [
  {
    role: 'Admin',
    email: 'trial.admin.20261029@hr-system.local',
    buttonStyle: '!border-indigo-200 !bg-indigo-50 !text-indigo-700 hover:!bg-indigo-100 focus-visible:ring-2 focus-visible:ring-indigo-300',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
        <path d="M12 3 19 6v5c0 4.5-2.9 8-7 10-4.1-2-7-5.5-7-10V6l7-3Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="m9 12 2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    role: 'HR',
    email: 'trial.hr.20261029@hr-system.local',
    buttonStyle: '!border-emerald-200 !bg-emerald-50 !text-emerald-700 hover:!bg-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-300',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
        <circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3.5 19v-1.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V19M16 5.5a3 3 0 0 1 0 5.8M17 13h.5a3 3 0 0 1 3 3V19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    role: 'Employee',
    email: 'trial.employee3.20261029@hr-system.local',
    buttonStyle: '!border-sky-200 !bg-sky-50 !text-sky-700 hover:!bg-sky-100 focus-visible:ring-2 focus-visible:ring-sky-300',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
        <circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5 20v-1.2a7 7 0 0 1 14 0V20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function SignIn() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submitLogin = async (email, password) => {
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      navigate(homePathFor(user), { replace: true });
    } catch (err) {
      setError(apiError(err, 'Sign in failed'));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    submitLogin(form.email, form.password);
  };

  const onTrialLogin = (account) => {
    setForm({ email: account.email, password: trialPassword });
    submitLogin(account.email, trialPassword);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <h1 className="mb-1 text-xl font-semibold">Sign in to HR System</h1>
        <p className="mb-4 text-sm text-slate-500">Use your work email and password.</p>
        <div className="space-y-3">
          <Alert>{error}</Alert>
          <form onSubmit={onSubmit} className="space-y-3">
            <Field label="Email">
              <Input
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                required
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
        <section
          aria-labelledby="trial-access-heading"
          className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4"
        >
          <h2 id="trial-access-heading" className="text-sm font-semibold text-slate-800">
            Try the System
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Explore the system using one of our demo accounts.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {trialAccounts.map((account) => (
              <Button
                key={account.role}
                type="button"
                variant="secondary"
                disabled={busy}
                aria-label={`Log in as ${account.role}`}
                onClick={() => onTrialLogin(account)}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 px-1.5 py-2 text-center text-xs ${account.buttonStyle}`}
              >
                {account.icon}
                <span className="leading-tight">Log in as {account.role}</span>
              </Button>
            ))}
          </div>
        </section>
      </Card>
    </div>
  );
}
