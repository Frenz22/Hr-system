import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import { Alert, Button, Card, Select, apiError } from '../../components/ui';
import StatusBadge from '../../components/StatusBadge';

const CATEGORIES = ['Bug Report', 'Feature Request', 'UI / Usability', 'Other'];
const STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'in_review', label: 'In Review' },
  { value: 'resolved', label: 'Resolved' },
];

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function FeedbackDetails({
  item,
  onClose,
  onDelete,
  onStatusChange,
  status,
  setStatus,
  saving,
  deleting,
  notice,
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving && !deleting) onClose();
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-detail-title"
          className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {item.category}
              </p>
              <h2 id="feedback-detail-title" className="mt-1 text-lg font-semibold text-slate-800">
                Feedback #{item.id}
              </h2>
            </div>
            <button
              type="button"
              aria-label="Close feedback details"
              disabled={saving || deleting}
              onClick={onClose}
              className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            >
              ×
            </button>
          </div>
          <div className="mt-3"><Alert kind={notice.kind}>{notice.text}</Alert></div>

          <dl className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Submitted by</dt>
              <dd className="font-medium text-slate-800">{item.submitterName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Email</dt>
              <dd className="break-all font-medium text-slate-800">{item.submitterEmail}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Submitted</dt>
              <dd className="text-slate-700">{formatDate(item.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Current status</dt>
              <dd className="mt-1"><StatusBadge status={item.status} /></dd>
            </div>
          </dl>

          <div className="mt-4">
            <h3 className="text-sm font-medium text-slate-700">Message</h3>
            <p className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700">
              {item.message}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
            <label className="w-full max-w-xs">
              <span className="mb-1 block text-sm font-medium text-slate-700">Update status</span>
              <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                {STATUSES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="danger"
                disabled={saving || deleting}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
              <Button
                type="button"
                disabled={saving || deleting || status === item.status}
                onClick={() => onStatusChange(item.id, status)}
              >
                {saving ? 'Saving…' : 'Save status'}
              </Button>
            </div>
          </div>
        </section>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="feedback-delete-title"
            aria-describedby="feedback-delete-description"
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h2 id="feedback-delete-title" className="text-lg font-semibold text-slate-800">
              Delete this feedback?
            </h2>
            <p id="feedback-delete-description" className="mt-2 text-sm text-red-700">
              This permanently deletes the selected feedback submission. This action cannot be undone.
            </p>
            <div className="mt-3"><Alert kind={notice.kind}>{notice.text}</Alert></div>
            <dl className="mt-4 space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
              <div><dt className="inline text-slate-500">Category: </dt><dd className="inline font-medium">{item.category}</dd></div>
              <div><dt className="inline text-slate-500">From: </dt><dd className="inline font-medium">{item.submitterName} ({item.submitterEmail})</dd></div>
              <div><dt className="inline text-slate-500">Submitted: </dt><dd className="inline">{formatDate(item.createdAt)}</dd></div>
            </dl>
            <p className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
              {item.message}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button type="button" variant="danger" disabled={deleting} onClick={() => onDelete(item.id)}>
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default function FeedbackManagement() {
  const [feedback, setFeedback] = useState([]);
  const [category, setCategory] = useState('');
  const [status, setStatusFilter] = useState('');
  const [sort, setSort] = useState('newest');
  const [selected, setSelected] = useState(null);
  const [nextStatus, setNextStatus] = useState('new');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState({ kind: 'success', text: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = { sort };
      if (category) params.category = category;
      if (status) params.status = status;
      const { data } = await api.get('/feedback/admin', { params });
      setFeedback(data.feedback);
    } catch (err) {
      setLoadError(apiError(err, 'Could not load feedback submissions.'));
    } finally {
      setLoading(false);
    }
  }, [category, sort, status]);

  useEffect(() => {
    load();
  }, [load]);

  const openFeedback = (item) => {
    setSelected(item);
    setNextStatus(item.status);
    setNotice({ kind: 'success', text: '' });
  };

  const updateStatus = async (id, value) => {
    setSaving(true);
    setNotice({ kind: 'success', text: '' });
    try {
      const { data } = await api.patch(`/feedback/admin/${id}`, { status: value });
      setSelected(data.feedback);
      setNextStatus(data.feedback.status);
      setNotice({ kind: 'success', text: 'Feedback status updated.' });
      await load();
    } catch (err) {
      setNotice({ kind: 'error', text: apiError(err, 'Could not update the feedback status.') });
    } finally {
      setSaving(false);
    }
  };

  const deleteFeedback = async (id) => {
    setDeleting(true);
    setNotice({ kind: 'success', text: '' });
    try {
      await api.delete(`/feedback/admin/${id}`);
      setSelected(null);
      setNotice({ kind: 'success', text: 'Feedback submission deleted.' });
      await load();
    } catch (err) {
      setNotice({ kind: 'error', text: apiError(err, 'Could not delete the feedback submission.') });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Feedback</h1>
        <p className="mt-1 text-sm text-slate-500">Review submissions and update their status.</p>
      </div>

      <Alert kind={notice.kind}>{notice.text}</Alert>
      <Alert>{loadError}</Alert>

      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-600">Category</span>
          <Select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
          </Select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-600">Status</span>
          <Select value={status} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-600">Sort</span>
          <Select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </Select>
        </label>
      </div>

      <Card className="p-0">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Loading feedback…</p>
        ) : loadError ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Feedback could not be displayed.</p>
        ) : feedback.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">No feedback submissions found.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {feedback.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openFeedback(item)}
                  className="w-full px-4 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-indigo-700">{item.category}</p>
                      <p className="mt-1 truncate text-sm font-medium text-slate-800">
                        {item.submitterName} <span className="font-normal text-slate-500">({item.submitterEmail})</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-slate-500">{formatDate(item.createdAt)}</span>
                      <StatusBadge status={item.status} />
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-slate-600">{item.message}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {selected && (
        <FeedbackDetails
          item={selected}
          onClose={() => setSelected(null)}
          onDelete={deleteFeedback}
          onStatusChange={updateStatus}
          status={nextStatus}
          setStatus={setNextStatus}
          saving={saving}
          deleting={deleting}
          notice={notice}
        />
      )}
    </div>
  );
}
