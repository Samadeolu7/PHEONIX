// src/services/branchService.ts
import { api } from './api';

export interface Branch {
  id: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  name: string;
  code: string;
  address?: string;
  is_active: boolean;
  owner?: number | null;
  created_by?: number | null;
}

export interface BranchFilters {
  is_active?: boolean;
  search?: string;
  ordering?: string;
  page?: number;
}

export interface CreateBranchData {
  name: string;
  code: string;
  address?: string;
  is_active?: boolean;
  is_deleted?: boolean;
  owner?: number | null;
  created_by?: number | null;
}

export interface BranchOption {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
}

export interface CloneConfigResult {
  success: boolean;
  message: string;
  source_branch: string;
  target_branch: string;
  created: Record<string, number>;
  skipped: Record<string, number>;
  errors: string[];
}

export const branchService = {
  // Get all branches with filtering
  async getBranches(filters?: BranchFilters) {
    return api.get('/branches/', { params: filters });
  },

  // Get a single branch by ID
  async getBranch(id: number): Promise<Branch> {
    return api.get(`/branches/${id}/`);
  },

  // Create a new branch
  async createBranch(data: CreateBranchData): Promise<Branch> {
    return api.post('/branches/', data);
  },

  // Update an existing branch
  async updateBranch(id: number, data: Partial<CreateBranchData>): Promise<Branch> {
    return api.put(`/branches/${id}/`, data);
  },

  // Partially update a branch
  async patchBranch(id: number, data: Partial<CreateBranchData>): Promise<Branch> {
    return api.patch(`/branches/${id}/`, data);
  },

  // Delete a branch
  async deleteBranch(id: number) {
    return api.delete(`/branches/${id}/`);
  },

  // Clone configuration data from one branch to another
  async cloneConfig(sourceBranchId: number, targetBranchId: number): Promise<CloneConfigResult> {
    return api.post('/branches/clone-config/', {
      source_branch_id: sourceBranchId,
      target_branch_id: targetBranchId,
    });
  },

  // List all branches as a flat array (for branch-switcher dropdown)
  async listBranches(): Promise<Branch[]> {
    const data = await this.getBranches({ is_active: true });
    if (Array.isArray(data)) return data;
    return (data as any)?.results ?? [];
  },

  // Get branches formatted for dropdown selection
  async getBranchOptions(filters?: { is_active?: boolean }): Promise<BranchOption[]> {
    try {
      const response = await this.getBranches({
        ...filters,
        is_active: filters?.is_active !== false, // Default to active branches only
      });

      const branches = response.results || [];
      return branches.map((branch: Branch) => ({
        id: branch.id,
        name: branch.name,
        code: branch.code,
        is_active: branch.is_active,
      }));
    } catch (error) {
      console.error('Error fetching branch options:', error);
      // Return demo data as fallback for development
      return [
        { id: 1, name: 'Main Branch', code: 'MAIN', is_active: true },
        { id: 2, name: 'Downtown Branch', code: 'DOWN', is_active: true },
        { id: 3, name: 'Uptown Branch', code: 'UP', is_active: true },
        { id: 4, name: 'East Branch', code: 'EAST', is_active: true },
        { id: 5, name: 'West Branch', code: 'WEST', is_active: false },
      ];
    }
  },
};
