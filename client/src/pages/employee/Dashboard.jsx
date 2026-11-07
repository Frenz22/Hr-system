import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import NotificationsPanel from '../../components/NotificationsPanel';
import { Card } from '../../components/ui';

const CARDS = [
  { to: '/app/profile', icon: '👤', title: 'My Profile', text: 'View and update your personal details' },
  { to: '/app/attendance', icon: '🕒', title: 'Attendance', text: 'View your daily attendance history' },
  { to: '/app/leave', icon: '🌴', title: 'Leave Requests', text: 'Apply for leave and track approvals' },
  { to: '/app/payroll', icon: '💰', title: 'Salary', text: 'View your salary breakdown' },
];

export default function EmployeeDashboard() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Welcome back 👋</h1>
        <p className="text-sm text-slate-500">
          Signed in as {user?.email} ({user?.employeeId})
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((c) => (
          <Link key={c.to} to={c.to}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <div className="mb-2 text-2xl">{c.icon}</div>
              <div className="font-semibold text-slate-800">{c.title}</div>
              <p className="mt-1 text-sm text-slate-500">{c.text}</p>
            </Card>
          </Link>
        ))}
      </div>

      <NotificationsPanel />
    </div>
  );
}
