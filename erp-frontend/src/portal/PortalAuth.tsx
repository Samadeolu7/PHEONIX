import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Customer, PortalInfo, portalApi } from './api';

interface PortalAuthState {
  customer: Customer | null;
  info: PortalInfo | null;
  loading: boolean;
  unavailable: boolean;
  refresh: () => Promise<void>;
  setCustomer: (c: Customer | null) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<PortalAuthState | null>(null);

export function PortalAuthProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [info, setInfo] = useState<PortalInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setCustomer(await portalApi.me());
    } catch {
      setCustomer(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setInfo(await portalApi.info());
        await refresh();
      } catch {
        setUnavailable(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await portalApi.logout();
    } finally {
      setCustomer(null);
    }
  }, []);

  return (
    <Ctx.Provider value={{ customer, info, loading, unavailable, refresh, setCustomer, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePortalAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePortalAuth must be used inside PortalAuthProvider');
  return v;
}

/** Client-side guard for UX only — the server enforces access on every call. */
export function RequireCustomer({ children }: { children: React.ReactNode }) {
  const { customer, loading } = usePortalAuth();
  const location = useLocation();
  if (loading) return null;
  if (!customer) {
    return <Navigate to="/portal/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
