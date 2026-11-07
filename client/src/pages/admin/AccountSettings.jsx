import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import { Alert, Button, Card, Field, Input, apiError } from '../../components/ui';

export default function AdminAccountSettings() {
  const { user, updateSession } = useAuth();
  const [form, setForm] = useState({
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [message, setMessage] = useState({ kind: 'info', text: '' });
  const [busy, setBusy] = useState(false);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage({ kind: 'info', text: '' });
    const body = {
      currentPassword: form.currentPassword,
      ...(form.email.trim().toLowerCase() !== user?.email
        ? { email: form.email.trim() }
        : {}),
      ...(form.newPassword ? {
        newPassword: form.newPassword,
        confirmPassword: form.confirmPassword,
      } : {}),
    };

    try {
      const { data } = await api.patch('/auth/me/credentials', body);
      updateSession(data);
      setForm((current) => ({
        ...current,
        email: data.user.email,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      }));
      setMessage({
        kind: 'success',
        text: form.newPassword
          ? 'Account updated. Other active sessions have been signed out.'
          : 'Email address updated.',
      });
    } catch (err) {
      setMessage({ kind: 'error', text: apiError(err, 'Could not update account credentials') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Admin account settings</h1>
        <p className="text-sm text-slate-500">Update your sign-in email or password.</p>
      </div>
      <Card>
        <Alert kind={message.kind}>{message.text}</Alert>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <Field label="Email">
            <Input type="email" required value={form.email} onChange={set('email')} />
          </Field>
          <hr className="border-slate-200" />
          <Field label="Current password">
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={form.currentPassword}
              onChange={set('currentPassword')}
            />
          </Field>
          <Field label="New password (leave blank to keep the current password)">
            <Input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={form.newPassword}
              onChange={set('newPassword')}
            />
          </Field>
          {form.newPassword && (
            <Field label="Confirm new password">
              <Input
                type="password"
                autoComplete="new-password"
                required
                value={form.confirmPassword}
                onChange={set('confirmPassword')}
              />
            </Field>
          )}
          <Button type="submit" disabled={busy || (!form.newPassword && form.email.trim().toLowerCase() === user?.email)}>
            {busy ? 'Saving…' : 'Save account settings'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
