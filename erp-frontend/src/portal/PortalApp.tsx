/**
 * Customer portal root. Mounted by main.tsx for any /portal/* URL, *instead
 * of* the staff App — so none of the staff providers, token handling or API
 * interceptors are loaded for members of the public.
 */
import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import '../index.css';
import { BRAND } from '../constants/brand';
import { PortalAuthProvider, RequireCustomer, usePortalAuth } from './PortalAuth';
import { PortalShell, Notice } from './ui';
import {
  AcceptInvitePage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from './pages/AuthPages';
import {
  AccountPage,
  ApplicationDetailPage,
  DashboardPage,
  LandingPage,
} from './pages/CustomerPages';
import { ApplyPage } from './pages/ApplyPage';
import { AccountsPage } from './pages/AccountsPage';

function Routed() {
  const { loading, unavailable } = usePortalAuth();
  if (loading)
    return (
      <PortalShell>
        <p className="text-sm text-gray-500">Loading…</p>
      </PortalShell>
    );
  if (unavailable) {
    return (
      <PortalShell>
        <Notice>
          Online applications are not available right now. Please visit any of our branches.
        </Notice>
      </PortalShell>
    );
  }
  return (
    <PortalShell>
      <Routes>
        <Route path="/portal" element={<LandingPage />} />
        <Route path="/portal/register" element={<RegisterPage />} />
        <Route path="/portal/login" element={<LoginPage />} />
        <Route path="/portal/accept-invite" element={<AcceptInvitePage />} />
        <Route path="/portal/verify-email" element={<VerifyEmailPage />} />
        <Route path="/portal/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/portal/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/portal/dashboard"
          element={
            <RequireCustomer>
              <DashboardPage />
            </RequireCustomer>
          }
        />
        <Route
          path="/portal/apply"
          element={
            <RequireCustomer>
              <ApplyPage />
            </RequireCustomer>
          }
        />
        <Route
          path="/portal/applications/:reference"
          element={
            <RequireCustomer>
              <ApplicationDetailPage />
            </RequireCustomer>
          }
        />
        <Route
          path="/portal/accounts"
          element={
            <RequireCustomer>
              <AccountsPage />
            </RequireCustomer>
          }
        />
        <Route
          path="/portal/account"
          element={
            <RequireCustomer>
              <AccountPage />
            </RequireCustomer>
          }
        />
        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Routes>
    </PortalShell>
  );
}

export default function PortalApp() {
  useEffect(() => {
    document.title = `Apply online — ${BRAND.companyName}`;
    // Verification / reset tokens arrive in the URL: never send it as a Referer.
    let meta = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'referrer';
      document.head.appendChild(meta);
    }
    meta.content = 'no-referrer';
  }, []);

  return (
    <BrowserRouter>
      <PortalAuthProvider>
        <Routed />
      </PortalAuthProvider>
    </BrowserRouter>
  );
}
