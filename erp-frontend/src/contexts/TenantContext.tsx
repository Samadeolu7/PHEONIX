// src/contexts/TenantContext.tsx - UPDATED
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { TenantService, Tenant } from '../services/api/tenantService';
import { DomainType } from '../config/domainConfig';

interface TenantTheme {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    error: string;
  };
  logo?: string;
  fonts?: {
    primary: string;
    secondary: string;
  };
}

interface TenantContextType {
  tenant: Tenant | null;
  theme: TenantTheme | null;
  isLoading: boolean;
  error: Error | null;
  setCurrentTenant: (tenantId: string) => Promise<void>;
  // NEW: Domain type from tenant settings
  domainType: DomainType;
}

const defaultTheme: TenantTheme = {
  colors: {
    primary: '#1976d2',
    secondary: '#dc004e',
    background: '#ffffff',
    text: '#000000',
    error: '#f44336',
  },
  fonts: {
    primary: 'Roboto, sans-serif',
    secondary: 'Arial, sans-serif',
  },
};

const TenantContext = createContext<TenantContextType | undefined>(undefined);

const tenantService = new TenantService();

export const TenantProvider = ({ children }: { children: ReactNode }) => {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [theme, setTheme] = useState<TenantTheme | null>(defaultTheme);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [domainType, setDomainType] = useState<DomainType>('microfinance');

  useEffect(() => {
    const loadTenantAndTheme = async () => {
      try {
        // Try to get tenant from domain first
        const domain = window.location.hostname;
        const tenantData = await tenantService.getTenantByDomain(domain);
        setTenant(tenantData);

        // NEW: Extract domain type from tenant settings
        if (tenantData.settings?.domain_type) {
          setDomainType(tenantData.settings.domain_type as DomainType);
        }

        // Apply tenant theme
        if (tenantData.settings?.theme as TenantTheme) {
          const theme = tenantData.settings.theme as TenantTheme;
          setTheme(theme);

          // Apply theme to document root
          const root = document.documentElement;
          Object.entries(theme.colors).forEach(([key, value]) => {
            if (typeof value === 'string') {
              root.style.setProperty(`--color-${key}`, value);
            }
          });

          if (theme.fonts) {
            Object.entries(theme.fonts).forEach(([key, value]) => {
              if (typeof value === 'string') {
                root.style.setProperty(`--font-${key}`, value);
              }
            });
          }
        }

        setError(null);
        localStorage.setItem('currentTenant', tenantData.id);
      } catch (domainError: unknown) {
        // If domain resolution fails, try to get current tenant from stored ID
        try {
          const currentTenantId = localStorage.getItem('currentTenant');
          if (!currentTenantId) {
            throw new Error('No tenant found');
          }

          const currentTenant = await tenantService.getCurrentTenant();
          setTenant(currentTenant);

          // Extract domain type
          if (currentTenant.settings?.domain_type) {
            setDomainType(currentTenant.settings.domain_type as DomainType);
          }

          setError(null);
        } catch (err: unknown) {
          setTenant(null);
          setError(err instanceof Error ? err : new Error('Failed to resolve tenant'));
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadTenantAndTheme();
  }, []);

  const setCurrentTenant = async (tenantId: string) => {
    try {
      setIsLoading(true);
      await tenantService.setCurrentTenant(tenantId);
      const tenantData = await tenantService.getCurrentTenant();
      setTenant(tenantData);

      // Update domain type
      if (tenantData.settings?.domain_type) {
        setDomainType(tenantData.settings.domain_type as DomainType);
      }

      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error('Failed to set tenant'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TenantContext.Provider
      value={{
        tenant,
        theme,
        isLoading,
        error,
        setCurrentTenant,
        domainType, // NEW: Expose domain type
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
