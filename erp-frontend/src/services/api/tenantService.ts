import { BaseService } from './baseService';

export interface Tenant {
  id: string;
  name: string;
  domain: string;
  settings: Record<string, unknown>;
  status: 'active' | 'inactive';
}

export class TenantService extends BaseService {
  constructor() {
    super('/tenants');
  }

  async getCurrentTenant(): Promise<Tenant> {
    try {
      return await this.get<Tenant>('/current');
    } catch (error) {
      return this.handleError(error);
    }
  }

  async setCurrentTenant(tenantId: string): Promise<void> {
    try {
      await this.post('/current', { tenantId });
      localStorage.setItem('currentTenant', tenantId);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getTenantByDomain(domain: string): Promise<Tenant> {
    try {
      return await this.get<Tenant>(`/by-domain/${domain}`);
    } catch (error) {
      return this.handleError(error);
    }
  }
}
