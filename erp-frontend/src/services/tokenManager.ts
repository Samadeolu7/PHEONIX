// src/services/tokenManager.ts
// Centralized token management with event notifications

type TokenRefreshListener = (tokens: { access: string; refresh?: string }) => void;

class TokenManager {
  private listeners: TokenRefreshListener[] = [];
  private refreshPromise: Promise<boolean> | null = null;

  // Add listener for token refresh events
  addRefreshListener(listener: TokenRefreshListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // Notify all listeners when tokens are refreshed
  private notifyListeners(tokens: { access: string; refresh?: string }) {
    this.listeners.forEach(listener => {
      try {
        listener(tokens);
      } catch (error) {
        console.error('Token refresh listener error:', error);
      }
    });
  }

  // Get current tokens from storage
  getTokens() {
    const accessToken =
      localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
    const refreshToken =
      localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken');
    return { accessToken, refreshToken };
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    const { accessToken } = this.getTokens();
    return !!accessToken;
  }

  // Store tokens and notify listeners
  setTokens(tokens: { access: string; refresh?: string }) {
    // Determine storage type based on remember me preference
    const rememberMe = localStorage.getItem('rememberMe') === 'true';
    const storage = rememberMe ? localStorage : sessionStorage;

    // Save new access token
    storage.setItem('accessToken', tokens.access);

    // Save new refresh token if provided
    if (tokens.refresh) {
      storage.setItem('refreshToken', tokens.refresh);
    }

    // Notify all listeners about the token refresh
    this.notifyListeners(tokens);
  }

  // Clear all tokens and notify listeners
  clearTokens() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('rememberMe');
    localStorage.removeItem('savedCredentials');
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('user');
  }

  // Centralized token refresh with deduplication
  async refreshToken(): Promise<boolean> {
    // If a refresh is already in progress, wait for it
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performTokenRefresh();

    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performTokenRefresh(): Promise<boolean> {
    try {
      const { refreshToken } = this.getTokens();

      if (!refreshToken) {
        console.log('❌ No refresh token available');
        return false;
      }

      console.log('🔄 Attempting automatic token refresh...');

      const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || '/api';
      const response = await fetch(`${BASE_URL}/users/auth/refresh/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh: refreshToken }),
      });

      if (!response.ok) {
        throw new Error(`Refresh failed: ${response.status}`);
      }

      const data = await response.json();

      // Store new tokens and notify listeners
      this.setTokens({
        access: data.access,
        refresh: data.refresh,
      });

      console.log('✅ Token refresh successful');
      return true;
    } catch (error) {
      console.error('❌ Token refresh failed:', error);

      // Clear all auth data on refresh failure
      this.clearTokens();
      return false;
    }
  }
}

// Export singleton instance
export const tokenManager = new TokenManager();
