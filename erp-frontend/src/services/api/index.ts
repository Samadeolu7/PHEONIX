// Barrel file for api services

import { apiClient } from './apiClient';

export { api as apiClient } from '../api';
export { BaseService } from './baseService';
export { AuthService } from './authService';
export { TenantService } from './tenantService';
export { AccountsService } from './accountsService';

// Backwards-compatible alias used across the codebase
export const api = apiClient;
