import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import LandingNavbar from './components/LandingNavbar';
import LandingPage from './pages/LandingPage';
import AboutPage from './pages/AboutPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MapPage from './pages/MapPage';
import StaffDashboard from './pages/StaffDashboard';
import CitizenDashboard from './pages/CitizenDashboard';
import TaxPaymentPage from './pages/TaxPaymentPage';
import AuditLogs from './pages/AuditLogs';
import DashboardDispatcher from './pages/DashboardDispatcher';
import ProtectedRoute from './components/ProtectedRoute';
import UserManagement from './pages/UserManagement';
import ValuationModule from './pages/ValuationModule';
import ParcelManagement from './pages/ParcelManagement';
import ReportsModule from './pages/ReportsModule';
import TransferManagement from './pages/TransferManagement';
import AppointmentManagement from './pages/AppointmentManagement';
import {
  SettingsPage,
  ModulePlaceholder
} from './pages/ModulePlaceholders';

function App() {
  const location = useLocation();
  // Show navbar on Landing and About pages
  const isPublicHeaderPage = location.pathname === '/' || location.pathname === '/about';

  return (
    <>
      {/* Show the Global Landing Navbar on relevant public pages */}
      {isPublicHeaderPage && <LandingNavbar />}

      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected Routes */}
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardDispatcher />} />
          <Route path="/cases" element={<StaffDashboard />} />
          <Route path="/gis" element={<MapPage />} />
          <Route path="/tax" element={<TaxPaymentPage />} />
          <Route path="/audit" element={<AuditLogs />} />

          <Route path="/tasks" element={<ModulePlaceholder title="My Tasks" />} />
          <Route path="/parcels" element={<ParcelManagement />} />
          <Route path="/admin/parcels" element={<ParcelManagement />} />
          <Route path="/transfers" element={<TransferManagement />} />
          <Route path="/complaints" element={<ModulePlaceholder title="Complaints" />} />
          <Route path="/migrations" element={<ModulePlaceholder title="Migrations" />} />
          <Route path="/land-bank" element={<ModulePlaceholder title="Land Bank" />} />
          <Route path="/valuation" element={<ValuationModule />} />
          <Route path="/reports" element={<ReportsModule />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/appointments" element={<AppointmentManagement />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* 404 Redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
