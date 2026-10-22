import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { ProtectedRoute, PublicOnlyRoute } from './components/RouteGuards.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ParcelsAdminPage from './pages/ParcelsAdminPage.jsx';
import TransfersReviewPage from './pages/TransfersReviewPage.jsx';
import TransferReviewDetailPage from './pages/TransferReviewDetailPage.jsx';
import TaxDashboardPage from './pages/TaxDashboardPage.jsx';
import GisPage from './pages/GisPage.jsx';
import AuditLogsPage from './pages/AuditLogsPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
        <Route path="*" element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/parcels" element={<ParcelsAdminPage />} />
                <Route path="/parcels/:id" element={<ParcelsAdminPage />} />
                <Route path="/transfers" element={<TransfersReviewPage />} />
                <Route path="/transfers/:id" element={<TransferReviewDetailPage />} />
                <Route path="/tax" element={<TaxDashboardPage />} />
                <Route path="/gis" element={<GisPage />} />
                <Route path="/appointments" element={<DashboardPage />} />
                <Route path="/audit-logs" element={<AuditLogsPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } />
      </Routes>
    </AuthProvider>
  );
}
