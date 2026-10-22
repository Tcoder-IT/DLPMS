import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Button, Input, ErrorBanner } from '../components/ui.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname ?? '/';

  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(form);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message ?? 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">Sign in to DLPMS</h1>
      <p className="mt-1 text-sm text-slate-600">
        Use your phone number or email and password.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}
        <Input
          label="Phone or email"
          autoComplete="username"
          required
          value={form.identifier}
          onChange={(e) => setForm({ ...form, identifier: e.target.value })}
        />
        <Input
          type="password"
          label="Password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-center text-sm text-slate-600">
          Need an account? <Link to="/register" className="text-blue-700 underline">Register as a citizen</Link>
        </p>
      </form>
    </div>
  );
}
