import { useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import { Alert, Button, apiError } from './ui';

const CATEGORIES = ['Bug Report', 'Feature Request', 'UI / Usability', 'Other'];

export default function FeedbackModal({ open, onClose }) {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ kind: 'success', text: '' });
  const submitInProgress = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  const onSubmit = async (event) => {
    event.preventDefault();
    if (submitInProgress.current) return;
    const cleanMessage = message.trim();
    if (!cleanMessage) {
      setNotice({ kind: 'error', text: 'Enter a message before submitting.' });
      return;
    }

    submitInProgress.current = true;
    setBusy(true);
    setNotice({ kind: 'success', text: '' });
    try {
      await api.post('/feedback', { category, message: cleanMessage });
      setMessage('');
      setNotice({ kind: 'success', text: 'Thanks, your feedback was submitted.' });
    } catch (err) {
      setNotice({ kind: 'error', text: apiError(err, 'Could not submit feedback. Please try again.') });
    } finally {
      submitInProgress.current = false;
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="feedback-title" className="text-lg font-semibold text-slate-800">
              Share feedback
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Tell us about an issue or something that could work better.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close feedback form"
            disabled={busy}
            onClick={onClose}
            className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
          >
            ×
          </button>
        </div>
        <Alert kind={notice.kind}>{notice.text}</Alert>
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Feedback category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            >
              {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Message</span>
            <textarea
              required
              maxLength={2000}
              rows={6}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Write your feedback here..."
              className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <span className="mt-1 block text-right text-xs text-slate-500" aria-live="polite">
              {message.length} / 2000
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !message.trim()}>
              {busy ? 'Submitting…' : 'Submit feedback'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
