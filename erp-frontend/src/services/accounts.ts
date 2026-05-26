import { Account, CreateAccountDTO, UpdateAccountDTO } from '../types/account';
import { api } from '../api/axios';

export class AccountsService {
  private static instance: AccountsService;
  private readonly baseUrl = '/accounts';

  private constructor() {}

  public static getInstance(): AccountsService {
    if (!AccountsService.instance) {
      AccountsService.instance = new AccountsService();
    }
    return AccountsService.instance;
  }

  async getAccounts(): Promise<Account[]> {
    const response = await api.get<Account[]>(this.baseUrl);
    return response.data;
  }

  async getAccount(id: number): Promise<Account> {
    const response = await api.get<Account>(`${this.baseUrl}/${id}`);
    return response.data;
  }

  async createAccount(data: CreateAccountDTO): Promise<Account> {
    const response = await api.post<Account>(this.baseUrl, data);
    return response.data;
  }

  async updateAccount(id: number, data: UpdateAccountDTO): Promise<Account> {
    const response = await api.patch<Account>(`${this.baseUrl}/${id}`, data);
    return response.data;
  }

  async deleteAccount(id: number): Promise<void> {
    await api.delete(`${this.baseUrl}/${id}`);
  }
}
