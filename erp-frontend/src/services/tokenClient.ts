import axios from 'axios';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || '/api';

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export type RefreshResponse = {
  access: string;
  refresh?: string;
};

export async function refreshWithToken(refreshToken: string): Promise<RefreshResponse> {
  const resp = await client.post('/users/auth/refresh/', { refresh: refreshToken });
  return resp.data;
}

export default client;
