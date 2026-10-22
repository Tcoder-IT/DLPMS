import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Button, Input, ErrorBanner } from '../components/ui.jsx';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    phoneNumber: '',
    email: '',
    password: '',
    fullName: '',
    nationalId: '',
    physicalAddress: '',
    contactPhone: '',
    contactEmail: ''
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function setField(name) {
    return (e) => setForm({ ...form, [name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(form);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Register as a citizen</h1>
      <p className="mt-1 text-sm text-slate-600">
        You will use your phone number and password to sign in. Your owner profile
        is created at the same time.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}
        <Input label="Phone number" required value={form.phoneNumber} onChange={setField('phoneNumber')} placeholder="+2519…" />
        <Input label="Email (optional)" type="email" value={form.email} onChange={setField('email')} />
        <Input
          label="Password"
          type="password"
          required
          minLength={8}
          value={form.password}
          onChange={setField('password')}
          hint="At least 8 characters."
        />
        <Input label="Full name" required value={form.fullName} onChange={setField('fullName')} />
        <Input label="National ID" required value={form.nationalId} onChange={setField('nationalId')} />
        <Input label="Physical address" required value={form.physicalAddress} onChange={setField('physicalAddress')} />
        <Input label="Contact phone (optional)" value={form.contactPhone} onChange={setField('contactPhone')} />
        <Input label="Contact email (optional)" type="email" value={form.contactEmail} onChange={setField('contactEmail')} />
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
        <p className="text-center text-sm text-slate-600">
          Already registered? <Link to="/login" className="text-blue-700 underline">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
