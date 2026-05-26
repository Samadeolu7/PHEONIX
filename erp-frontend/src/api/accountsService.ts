export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface Account {
  id: number;
  name: string;
  type: string;
  balance: number;
  currency: string;
  isActive: boolean;
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
  isActive?: boolean;
}

export class AccountsService {
  async getAccounts(_params: PaginationParams): Promise<Account[]> {
    // TODO: Implement API call
    return [];
  }

  async getAccountById(_id: number): Promise<Account | null> {
    // TODO: Implement API call
    return null;
  }

  async createAccount(_data: CreateAccountDTO): Promise<Account> {
    // TODO: Implement API call
    return {} as Account;
  }

  async updateAccount(_id: number, _data: UpdateAccountDTO): Promise<Account> {
    // TODO: Implement API call
    return {} as Account;
  }

  async deleteAccount(_id: number): Promise<void> {
    // TODO: Implement API call
  }
}
