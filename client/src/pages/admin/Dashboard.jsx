import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import NotificationsPanel from '../../components/NotificationsPanel';
import { Card } from '../../components/ui';

export default function AdminDashboard() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api.get('/admin/summary').then(({ data }) => setSummary(data.summary)).catch(() => {});
  }, []);

  const tiles = [
    { label: 'Employees', value: summary?.totalEmployees, to: '/admin/employees', icon: '🗂️' },
    { label: 'Present today', value: summary?.presentToday, to: '/admin/attendance', icon: '🕒' },
    { label: 'Pending leave requests', value: summary?.pendingLeaves, to: '/admin/leaves', icon: '✅' },
    { label: 'HR / Admin accounts', value: summary?.totalAdmins, to: '/admin/employees', icon: '🛡️' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Operations overview</h1>
        <p className="text-sm text-slate-500">Workforce status at a glance.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{t.icon}</span>
                <span className="text-2xl font-bold text-slate-800">{t.value ?? '—'}</span>
              </div>
              <p className="mt-2 text-sm text-slate-500">{t.label}</p>
            </Card>
          </Link>
        ))}
      </div>

      <NotificationsPanel />
    </div>
  );
}
