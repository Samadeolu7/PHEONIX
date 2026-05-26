// src/contexts/DomainLabelContext.tsx
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '../services/api';

interface DomainLabels {
  [key: string]: string;
}

interface DomainLabelContextType {
  labels: DomainLabels;
  domainType: string;
  tenantName: string;
  loading: boolean;
  getLabel: (key: string, defaultValue?: string) => string;
  isSchool: boolean;
  isHospital: boolean;
  isMicrofinance: boolean;
  isRetail: boolean;
}

const DomainLabelContext = createContext<DomainLabelContextType | undefined>(undefined);

interface DomainLabelProviderProps {
  children: ReactNode;
}

export const DomainLabelProvider: React.FC<DomainLabelProviderProps> = ({ children }) => {
  const [labels, setLabels] = useState<DomainLabels>({});
  const [domainType, setDomainType] = useState<string>('microfinance');
  const [tenantName, setTenantName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Only load labels if user is authenticated (check for token)
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
    if (token && !loaded) {
      loadLabels();
    } else {
      // If not authenticated, don't block - use defaults
      setLoading(false);
    }
  }, [loaded]);

  const loadLabels = async () => {
    try {
      const response = await api.get('/users/tenants/labels/');
      setLabels(response.labels || {});
      setDomainType(response.domain_type || 'microfinance');
      setTenantName(response.tenant_name || '');
      setLoaded(true);
    } catch (error) {
      console.error('Failed to load domain labels:', error);
      // Fallback to default microfinance labels
      setLabels({});
      setDomainType('microfinance');
    } finally {
      setLoading(false);
    }
  };

  const getLabel = (key: string, defaultValue?: string): string => {
    return (
      labels[key] || defaultValue || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    );
  };

  const value: DomainLabelContextType = {
    labels,
    domainType,
    tenantName,
    loading,
    getLabel,
    isSchool: domainType === 'school',
    isHospital: domainType === 'hospital',
    isMicrofinance: domainType === 'microfinance',
    isRetail: domainType === 'retail',
  };

  return <DomainLabelContext.Provider value={value}>{children}</DomainLabelContext.Provider>;
};

export const useDomainLabels = (): DomainLabelContextType => {
  const context = useContext(DomainLabelContext);
  if (!context) {
    throw new Error('useDomainLabels must be used within a DomainLabelProvider');
  }
  return context;
};

// Convenience hook for quick label lookups
export const useLabel = (key: string, defaultValue?: string): string => {
  const { getLabel } = useDomainLabels();
  return getLabel(key, defaultValue);
};
