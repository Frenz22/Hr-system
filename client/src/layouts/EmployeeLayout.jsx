import { Outlet } from 'react-router-dom';
import AppShell from '../components/AppShell';

const NAV = [
  { to: '/app', label: 'Dashboard', icon: '🏠', end: true },
  { to: '/app/profile', label: 'My Profile', icon: '👤' },
  { to: '/app/attendance', label: 'Attendance', icon: '🕒' },
  { to: '/app/leave', label: 'Leave', icon: '🌴' },
  { to: '/app/payroll', label: 'Salary', icon: '💰' },
];

export default function EmployeeLayout() {
  return (
    <AppShell title="Employee Portal" nav={NAV}>
      <Outlet />
    </AppShell>
  );
}
