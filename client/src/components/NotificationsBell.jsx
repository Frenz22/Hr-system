import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api/axios';

const TYPE_ICONS = { leave: '🌴', attendance: '🕒', profile: '👤', payroll: '💰', system: '🔔' };

export default function NotificationsBell() {
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/me');
      setItems(data.notifications);
    } catch {
      // Notifications are non-critical.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, location.pathname]);

  useEffect(() => {
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (event) => {
      if (!panelRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const unread = items.filter((item) => !item.isRead).length;

  const markRead = async (id) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
    try {
      await api.patch(`/notifications/${id}/read`);
    } catch {
      load();
    }
  };

  const markAll = async () => {
    setBusy(true);
    try {
      await api.patch('/notifications/read-all');
      setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        className="relative rounded-lg p-2 text-lg transition-colors hover:bg-slate-100"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                disabled={busy}
                className="text-xs font-medium text-indigo-600 hover:underline disabled:text-slate-400"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing new yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => !item.isRead && markRead(item.id)}
                      className={`flex w-full items-start gap-2 px-4 py-3 text-left text-sm transition-colors hover:bg-slate-50 ${
                        item.isRead ? 'text-slate-400' : 'text-slate-700'
                      }`}
                    >
                      <span>{TYPE_ICONS[item.type] || '🔔'}</span>
                      <span className="flex-1">
                        <span className="block">{item.message}</span>
                        <span className="mt-0.5 block text-xs text-slate-400">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                      </span>
                      {!item.isRead && (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
