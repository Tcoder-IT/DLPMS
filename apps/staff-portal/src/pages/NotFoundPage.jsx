import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return <p>Page not found. <Link className="text-blue-800 underline" to="/">Return to the portal</Link>.</p>;
}
