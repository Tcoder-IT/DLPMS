// App shell — top bar with logout + nav links, main content area.

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, MapPin, ArrowRightLeft, Calendar, FileText, Bell, FolderOpen, CreditCard, Search, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { clsx } from 'clsx';
import { Badge } from './ui.jsx';

const NAV = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/parcels', label: 'My parcels', icon: MapPin },
  { to: '/transfers', label: 'Transfers', icon: ArrowRightLeft },
  { to: '/documents', label: 'Documents', icon: FolderOpen },
  { to: '/payments', label: 'Payments', icon: CreditCard },
  { to: '/appointments', label: 'Appointments', icon: Calendar },
  { to: '/certificates', label: 'Certificates', icon: FileText },
  { to: '/notifications', label: 'Notifications', icon: Bell }
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold text-blue-800">
            <ShieldCheck size={20} />
            <span className="hidden sm:inline">DLPMS — Citizen Portal</span>
            <span className="sm:hidden">DLPMS</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/search" className="inline-flex items-center gap-1 text-sm text-slate-700 hover:text-blue-700">
              <Search size={14} /> <span className="hidden sm:inline">Public search</span>
            </Link>
            <span className="hidden text-sm text-slate-600 sm:inline">
              {user?.phoneNumber}
            </span>
            {user?.role && <Badge tone="blue">{user.role}</Badge>}
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
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 pb-1">
          {NAV.map(({ to, label, icon: Icon }) => {
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
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
