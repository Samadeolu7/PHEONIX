import { useCallback, useState, useEffect } from 'react';
import { authService, User } from '../services/authService';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    loading: true,
  });

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      setAuthState(prev => ({ ...prev, loading: true }));

      const { user } = await authService.login({
        username: email,
        password,
      });

      setAuthState({
        user,
        isAuthenticated: true,
        loading: false,
      });

      return true;
    } catch (error: any) {
      setAuthState(prev => ({
        ...prev,
        loading: false,
      }));

      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setAuthState({
      user: null,
      isAuthenticated: false,
      loading: false,
    });
  }, []);

  const checkAuth = useCallback(async (): Promise<boolean> => {
    try {
      if (!authService.isAuthenticated()) {
        setAuthState({
          user: null,
          isAuthenticated: false,
          loading: false,
        });
        return false;
      }

      const user = await authService.getCurrentUser();
      setAuthState({
        user,
        isAuthenticated: true,
        loading: false,
      });
      return true;
    } catch (error) {
      // Token might be invalid, clear storage
      authService.logout();
      setAuthState({
        user: null,
        isAuthenticated: false,
        loading: false,
      });
      return false;
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const getToken = useCallback(() => {
    return authService.getStoredToken();
  }, []);

  const ensureAuth = useCallback(async (): Promise<boolean> => {
    if (authState.isAuthenticated) {
      return true;
    }
    return await checkAuth();
  }, [authState.isAuthenticated, checkAuth]);

  return {
    login,
    logout,
    loading: authState.loading,
    isAuthenticated: authState.isAuthenticated,
    user: authState.user,
    token: getToken(),
    getToken,
    ensureAuth,
  };
};
