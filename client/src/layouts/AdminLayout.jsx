import { Outlet } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: '📊', end: true },
  { to: '/admin/employees', label: 'Employees', icon: '👥' },
  { to: '/admin/departments', label: 'Departments', icon: '🏢' },
  { to: '/admin/attendance', label: 'Attendance Records', icon: '🕒' },
  { to: '/admin/pay-rates', label: 'Pay Rates', icon: '💵', adminOnly: true },
  { to: '/admin/leaves', label: 'Leave Approvals', icon: '✅' },
  { to: '/admin/feedback', label: 'Feedback', icon: '💬', feedbackAdminOnly: true },
  { to: '/admin/payroll', label: 'Payroll', icon: '💰', adminOnly: true },
  { to: '/admin/account', label: 'Account settings', icon: '⚙️', adminOnly: true },
];

export default function AdminLayout() {
  const { user } = useAuth();
  // Payroll is admin-only server-side; hide the link so HR staff do not land on
  // a 403 page.
  const nav = NAV.filter(
    (item) =>
      (!item.adminOnly || user?.role === 'admin') &&
      (!item.feedbackAdminOnly || (user?.role === 'admin' && user?.email === 'admin@gmail.com'))
  );

  return (
    <AppShell title="HR / Admin Console" nav={nav}>
      <Outlet />
    </AppShell>
  );
}
