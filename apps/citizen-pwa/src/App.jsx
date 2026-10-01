import { Link, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export default function App() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-slate-900">
      <header className="mb-10 border-b border-slate-200 pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-800">DLPMS</p>
        <nav className="mt-3"><Link className="text-blue-800 underline" to="/">Citizen portal</Link></nav>
      </header>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </main>
  );
}
