import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { ProtectedRoute, PublicOnlyRoute } from './components/RouteGuards.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ParcelsListPage from './pages/ParcelsListPage.jsx';
import ParcelDetailPage from './pages/ParcelDetailPage.jsx';
import TransfersListPage from './pages/TransfersListPage.jsx';
import TransferCreatePage from './pages/TransferCreatePage.jsx';
import TransferDetailPage from './pages/TransferDetailPage.jsx';
import AppointmentsPage from './pages/AppointmentsPage.jsx';
import CertificatesPage from './pages/CertificatesPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import DocumentsPage from './pages/DocumentsPage.jsx';
import PaymentsPage from './pages/PaymentsPage.jsx';
import PublicSearchPage from './pages/PublicSearchPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public-only route: accessible without auth */}
        <Route path="/search" element={<PublicSearchPage />} />

        {/* Public-only routes (redirect to / if already logged in) */}
        <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
        <Route path="/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />

        {/* Everything else requires auth + the app shell */}
        <Route path="*" element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/parcels" element={<ParcelsListPage />} />
                <Route path="/parcels/:id" element={<ParcelDetailPage />} />
                <Route path="/transfers" element={<TransfersListPage />} />
                <Route path="/transfers/new" element={<TransferCreatePage />} />
                <Route path="/transfers/:id" element={<TransferDetailPage />} />
                <Route path="/appointments" element={<AppointmentsPage />} />
                <Route path="/certificates" element={<CertificatesPage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/documents" element={<DocumentsPage />} />
                <Route path="/payments" element={<PaymentsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } />
      </Routes>
    </AuthProvider>
  );
}
