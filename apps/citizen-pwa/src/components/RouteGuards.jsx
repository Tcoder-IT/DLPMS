// Route guards. <ProtectedRoute> requires a logged-in user; redirect to
// /login otherwise. <PublicOnlyRoute> redirects to / if already logged in
// (used for login/register pages).

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Spinner } from './ui.jsx';

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

export function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return children;
}
