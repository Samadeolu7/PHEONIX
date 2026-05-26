import { BaseService, PaginatedResponse, PaginationParams } from './baseService';

export interface Account {
  id: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountDTO {
  name: string;
  type: string;
  currency: string;
  initialBalance?: number;
}

export interface UpdateAccountDTO {
  name?: string;
  type?: string;
  currency?: string;
}

export class AccountsService extends BaseService {
  constructor() {
    super('/accounts');
  }

  async getAccounts(params: PaginationParams): Promise<PaginatedResponse<Account>> {
    try {
      return await this.getPaginated<Account>('', params);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getAccount(id: string): Promise<Account> {
    try {
      return await this.get<Account>(`/${id}`);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createAccount(data: CreateAccountDTO): Promise<Account> {
    try {
      return await this.post<Account>('', data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateAccount(id: string, data: UpdateAccountDTO): Promise<Account> {
    try {
      return await this.patch<Account>(`/${id}`, data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getChildrenSummary(id: string): Promise<any> {
    try {
      return await this.get<any>(`/${id}/children-summary/`);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteAccount(id: string): Promise<void> {
    try {
      await this.delete(`/${id}`);
    } catch (error) {
      return this.handleError(error);
    }
  }
}
