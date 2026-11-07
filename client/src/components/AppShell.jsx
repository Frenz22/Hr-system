import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FeedbackModal from './FeedbackModal';
import NotificationsBell from './NotificationsBell';

export default function AppShell({ title, nav, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const menuRef = useRef(null);

  // Close the account menu on outside click or Escape. It deliberately has no
  // hover trigger, so moving the pointer across the header cannot sign you out.
  useEffect(() => {
    if (!menuOpen) return undefined;

    const onMouseDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const onLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 sm:flex">
        <div className="mb-6 px-2">
          <div className="text-lg font-bold text-indigo-700">HR System</div>
          <div className="text-xs text-slate-500">{title}</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <span className="mr-2">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          className="mt-4 flex w-full items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-left text-sm font-medium text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0">
            <path d="M5 5.5h14A1.5 1.5 0 0 1 20.5 7v9a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3v-3H5A1.5 1.5 0 0 1 3.5 16V7A1.5 1.5 0 0 1 5 5.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M8 10h8M8 13.5h5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          Feedback
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="font-semibold text-slate-700">{title}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Open feedback form"
              title="Feedback"
              onClick={() => setFeedbackOpen(true)}
              className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-indigo-700 transition-colors hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:hidden"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                <path d="M5 5.5h14A1.5 1.5 0 0 1 20.5 7v9a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3v-3H5A1.5 1.5 0 0 1 3.5 16V7A1.5 1.5 0 0 1 5 5.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M8 10h8M8 13.5h5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
            <NotificationsBell />
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                aria-controls="account-menu"
                className="flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-slate-100"
              >
                <span className="text-sm text-slate-500">
                  {user?.email} · <span className="uppercase">{user?.employeeId}</span>
                </span>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold uppercase text-indigo-700">
                  {user?.role}
                </span>
              </button>

              {menuOpen && (
                <div
                  id="account-menu"
                  aria-label="Account menu"
                  className="absolute right-0 z-50 mt-2 w-48"
                >
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    <div className="border-b border-slate-100 px-4 py-3">
                      <p className="text-xs font-medium uppercase text-slate-400">Signed in as</p>
                      <p className="truncate text-sm font-semibold text-slate-700">{user?.email}</p>
                    </div>
                    <div className="p-1">
                      {user?.role === 'admin' && (
                        <Link
                          to="/admin/account"
                          onClick={() => setMenuOpen(false)}
                          className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100"
                        >
                          Account settings
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={onLogout}
                        className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                      >
                        <span className="mr-2">🚪</span> Sign out
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
}
