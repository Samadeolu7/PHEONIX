export interface Account {
  id: number;
  name: string;
  description?: string;
  balance: number;
  currency?: string;
  type?: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  status?: 'active' | 'inactive';
  account_type?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' | 'LOAN' | 'SAVINGS';
  account_level?: 'PARENT' | 'CHILD';
  parent?: number | null;
  code?: string;
  createdAt?: string;
  updatedAt?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateAccountDTO {
  name?: string;
  description?: string;
  balance?: number;
  currency?: string;
  type?: Account['type'];
  status?: Account['status'];
}

export interface CreateAccountDTO {
  name: string;
  description?: string;
  balance: number;
  currency: string;
  type: Account['type'];
}

export interface AccountsService {
  getAccounts(): Promise<Account[]>;
  getAccount(id: number): Promise<Account>;
  createAccount(data: CreateAccountDTO): Promise<Account>;
  updateAccount(id: number, data: UpdateAccountDTO): Promise<Account>;
  deleteAccount(id: number): Promise<void>;
}
