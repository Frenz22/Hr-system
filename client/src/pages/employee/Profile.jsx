import { useEffect, useRef, useState } from 'react';
import api from '../../api/axios';
import { Card, Field, Input, Button, Alert, Spinner, apiError } from '../../components/ui';
import { Avatar, SalaryCard, JobCard, DocumentsCard } from '../../components/ProfileView';

export default function EmployeeProfile() {
  const [profile, setProfile] = useState(null);
  const [user, setUser] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState({ kind: 'info', text: '' });
  const [busy, setBusy] = useState(false);
  const pictureInput = useRef();
  const docInput = useRef();

  useEffect(() => {
    api.get('/profiles/me').then(({ data }) => {
      setProfile(data.profile);
      setUser(data.user);
      setForm({
        firstName: data.profile.firstName || '',
        lastName: data.profile.lastName || '',
        phone: data.profile.phone || '',
        address: data.profile.address || '',
      });
    });
  }, []);

  if (!profile || !form) return <Spinner />;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg({ kind: 'info', text: '' });
    try {
      const { data } = await api.patch('/profiles/me', form);
      setProfile(data.profile);
      setMsg({ kind: 'success', text: 'Profile updated.' });
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err) });
    } finally {
      setBusy(false);
    }
  };

  const upload = async (endpoint, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true);
    setMsg({ kind: 'info', text: '' });
    try {
      const { data } = await api.post(endpoint, fd);
      setProfile(data.profile);
      setMsg({ kind: 'success', text: 'Upload complete.' });
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err, 'Upload failed') });
    } finally {
      setBusy(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const reloadProfile = async () => {
    const { data } = await api.get('/profiles/me');
    setProfile(data.profile);
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-4">
          <Avatar url={profile.profilePictureUrl} />
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-slate-800">
              {profile.firstName} {profile.lastName || ''}
            </h1>
            <p className="text-sm text-slate-500">
              {user?.employeeId ? `${user.employeeId} · ` : ''}
              {user?.email || profile.designation || 'Employee'}
            </p>
          </div>
          <Button variant="secondary" onClick={() => pictureInput.current.click()} disabled={busy}>
            Change photo
          </Button>
          <input
            ref={pictureInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => upload('/profiles/me/picture', e.target.files[0])}
          />
        </div>
      </Card>

      <Alert kind={msg.kind}>{msg.text}</Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold text-slate-700">Contact details (editable)</h2>
          <form onSubmit={save} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name">
                <Input value={form.firstName} onChange={set('firstName')} />
              </Field>
              <Field label="Last name">
                <Input value={form.lastName} onChange={set('lastName')} />
              </Field>
            </div>
            <Field label="Phone">
              <Input value={form.phone} onChange={set('phone')} />
            </Field>
            <Field label="Address">
              <Input value={form.address} onChange={set('address')} />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        </Card>

        <div className="space-y-4">
          <JobCard profile={profile} />
          <SalaryCard salary={profile.salary} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DocumentsCard documents={profile.documents} onDeleted={reloadProfile} />
        <Card>
          <h2 className="mb-3 font-semibold text-slate-700">Upload a document</h2>
          <p className="mb-3 text-sm text-slate-500">PDF or image, up to 5 MB.</p>
          <Button variant="secondary" onClick={() => docInput.current.click()} disabled={busy}>
            Choose file…
          </Button>
          <input
            ref={docInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => upload('/profiles/me/documents', e.target.files[0])}
          />
        </Card>
      </div>
    </div>
  );
}
