// Staff app shell — role-aware nav that hides links the user's role cannot use.
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, MapPin, ArrowRightLeft, Receipt, Globe, Calendar, ScrollText, Users, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { clsx } from 'clsx';
import { Badge } from './ui.jsx';

const NAV = [
  { to: '/', label: 'Home', icon: Home, roles: ['LandOfficer', 'TaxOfficial', 'GISOfficer', 'SystemAdmin'] },
  { to: '/parcels', label: 'Parcels', icon: MapPin, roles: ['LandOfficer', 'SystemAdmin'] },
  { to: '/transfers', label: 'Transfers', icon: ArrowRightLeft, roles: ['LandOfficer', 'SystemAdmin'] },
  { to: '/tax', label: 'Tax', icon: Receipt, roles: ['TaxOfficial', 'SystemAdmin'] },
  { to: '/gis', label: 'GIS', icon: Globe, roles: ['GISOfficer', 'SystemAdmin'] },
  { to: '/appointments', label: 'Appointments', icon: Calendar, roles: ['LandOfficer', 'SystemAdmin'] },
  { to: '/audit-logs', label: 'Audit logs', icon: ScrollText, roles: ['SystemAdmin'] },
  { to: '/users', label: 'Users', icon: Users, roles: ['SystemAdmin'] }
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const visible = NAV.filter((n) => user && n.roles.includes(user.role));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold text-blue-800">
            <ShieldCheck size={20} />
            <span className="hidden sm:inline">DLPMS — Staff Portal</span>
            <span className="sm:hidden">DLPMS Staff</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">
              {user?.phoneNumber}
            </span>
            {user?.role && <Badge tone="purple">{user.role}</Badge>}
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
              aria-label="Log out"
            >
              <LogOut size={16} /> <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-1">
          {visible.map(({ to, label, icon: Icon }) => {
            const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={clsx(
                  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-slate-100'
                )}
              >
                <Icon size={16} /> {label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
