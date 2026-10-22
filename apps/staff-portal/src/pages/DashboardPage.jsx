// Staff dashboard — role-aware cards summarizing what the signed-in
// officer/official/admin can do.

import { Link } from 'react-router-dom';
import { MapPin, ArrowRightLeft, Receipt, Globe, ScrollText, Users, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Card, Badge } from '../components/ui.jsx';

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role;

  const cards = [];
  if (role === 'LandOfficer' || role === 'SystemAdmin') {
    cards.push({ to: '/parcels', label: 'Parcels', desc: 'Register and update land parcels.', icon: MapPin });
    cards.push({ to: '/transfers', label: 'Transfers', desc: 'Review pending transfer requests.', icon: ArrowRightLeft });
  }
  if (role === 'TaxOfficial' || role === 'SystemAdmin') {
    cards.push({ to: '/tax', label: 'Tax', desc: 'Calculate tax, view arrears and dashboard.', icon: Receipt });
  }
  if (role === 'GISOfficer' || role === 'SystemAdmin') {
    cards.push({ to: '/gis', label: 'GIS', desc: 'Manage boundaries, verify against neighbours.', icon: Globe });
  }
  if (role === 'SystemAdmin') {
    cards.push({ to: '/audit-logs', label: 'Audit logs', desc: 'View and export the tamper-evident log chain.', icon: ScrollText });
    cards.push({ to: '/users', label: 'Users', desc: 'Manage accounts and role assignments.', icon: Users });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Staff dashboard</h1>
        <p className="text-sm text-slate-600">
          Signed in as <Badge tone="purple">{role}</Badge> · {user?.phoneNumber}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ to, label, desc, icon: Icon }) => (
          <Link key={to} to={to}>
            <Card className="transition-colors hover:border-blue-500 hover:bg-blue-50">
              <div className="flex items-center justify-between">
                <Icon size={20} className="text-blue-700" />
                <ArrowRight size={14} className="text-slate-400" />
              </div>
              <p className="mt-3 text-lg font-semibold text-slate-900">{label}</p>
              <p className="text-sm text-slate-600">{desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
