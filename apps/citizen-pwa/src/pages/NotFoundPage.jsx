import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="py-16 text-center">
      <p className="text-4xl font-bold text-slate-900">404</p>
      <p className="mt-2 text-sm text-slate-600">We couldn't find that page.</p>
      <Link to="/" className="mt-4 inline-block text-sm text-blue-700 underline">Back to dashboard</Link>
    </div>
  );
}
