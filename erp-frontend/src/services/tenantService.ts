import { api } from '../api/axios';

export interface Tenant {
  id: number;
  name: string;
  slug: string;
  theme: Record<string, string>;
  config: Record<string, any>;
}

class TenantService {
  private static instance: TenantService;
  private currentTenant: Tenant | null = null;

  static getInstance(): TenantService {
    if (!TenantService.instance) {
      TenantService.instance = new TenantService();
    }
    return TenantService.instance;
  }

  async resolveTenant(slug?: string): Promise<Tenant | null> {
    try {
      // Try to get tenant from URL first
      const tenantSlug = slug || this.getTenantFromUrl();

      if (!tenantSlug) {
        console.warn('No tenant slug found');
        return null;
      }

      const response = await api.get<Tenant>(`/tenants/${tenantSlug}/`);
      this.currentTenant = response.data;

      // Store tenant slug in localStorage for subsequent requests
      localStorage.setItem('tenant_slug', tenantSlug);

      // Apply tenant theme if provided
      if (this.currentTenant.theme) {
        this.applyTenantTheme(this.currentTenant.theme);
      }

      return this.currentTenant;
    } catch (error) {
      console.error('Failed to resolve tenant:', error);
      return null;
    }
  }

  private getTenantFromUrl(): string | null {
    // For krystartrust.ng domains, always use 'mt' tenant
    if (window.location.hostname.includes('krystartrust.ng')) {
      return 'mt';
    }

    // Check for subdomain first
    const subdomain = window.location.hostname.split('.')[0];
    const commonSubdomains = ['www', 'erp', 'api', 'admin', 'app', 'localhost'];

    if (subdomain && !commonSubdomains.includes(subdomain)) {
      return subdomain;
    }

    // Check URL path (e.g., /tenant-name/...)
    const pathParts = window.location.pathname.split('/');
    if (pathParts.length > 1 && pathParts[1]) {
      return pathParts[1];
    }

    // Fall back to query param or default
    const params = new URLSearchParams(window.location.search);
    return params.get('tenant') || 'mt';
  }

  private applyTenantTheme(theme: Record<string, string>): void {
    const root = document.documentElement;
    Object.entries(theme).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });
  }

  getCurrentTenant(): Tenant | null {
    return this.currentTenant;
  }
}

export const tenantService = TenantService.getInstance();
