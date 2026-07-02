/**
 * Integration tests for LoginPageStyled with Toast notifications
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import LoginPageStyled from '../LoginPageStyled';
import { ToastProvider } from '../../../contexts/ToastContext';
import { authService } from '../../../services/authService';

// Mock the auth service
vi.mock('../../../services/authService', () => ({
  authService: {
    login: vi.fn(),
  },
}));

// Mock the role-based redirect utility
vi.mock('../../../utils/roleBasedRedirect', () => ({
  getRedirectPathForUser: vi.fn(() => '/dashboard'),
}));

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <BrowserRouter>
    <ToastProvider>{children}</ToastProvider>
  </BrowserRouter>
);

describe('LoginPageStyled Toast Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Login Success Scenarios', () => {
    it('should show success toast on successful login', async () => {
      const mockUser = {
        id: '1',
        username: 'testuser',
        email: 'test@example.com',
        role: 'user',
      };

      (authService.login as any).mockResolvedValue({ user: mockUser });

      render(
        <TestWrapper>
          <LoginPageStyled />
        </TestWrapper>
      );

      // Fill in login form
      fireEvent.change(screen.getByPlaceholderText('samuel'), {
        target: { value: 'testuser' },
      });
      fireEvent.change(screen.getByPlaceholderText('••••••••'), {
        target: { value: 'password123' },
      });

      // Submit form
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      // Wait for success toast to appear
      await waitFor(() => {
        expect(screen.getByText('Welcome back, testuser!')).toBeInTheDocument();
      });

      // Check that the toast has the correct title
      expect(screen.getByText('Login Successful')).toBeInTheDocument();

      // Verify navigation was called
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });

    it('should show success toast with email when username is not available', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        role: 'user',
      };

      (authService.login as any).mockResolvedValue({ user: mockUser });

      render(
        <TestWrapper>
          <LoginPageStyled />
        </TestWrapper>
      );

      // Fill in login form
      fireEvent.change(screen.getByPlaceholderText('samuel'), {
        target: { value: 'test@example.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('••••••••'), {
        target: { value: 'password123' },
      });

      // Submit form
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      // Wait for success toast to appear
      await waitFor(() => {
        expect(screen.getByText('Welcome back, test@example.com!')).toBeInTheDocument();
      });
    });
  });

  describe('Login Error Scenarios', () => {
    it('should show error toast on login failure', async () => {
      const errorMessage = 'Invalid credentials';
      (authService.login as any).mockRejectedValue(new Error(errorMessage));

      render(
        <TestWrapper>
          <LoginPageStyled />
        </TestWrapper>
      );

      // Fill in login form
      fireEvent.change(screen.getByPlaceholderText('samuel'), {
        target: { value: 'wronguser' },
      });
      fireEvent.change(screen.getByPlaceholderText('••••••••'), {
        target: { value: 'wrongpassword' },
      });

      // Submit form
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      // Wait for error toast to appear
      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });

      // Check that the toast has the correct title
      expect(screen.getByText('Authentication Failed')).toBeInTheDocument();

      // Verify navigation was not called
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should show generic error toast when no error message is provided', async () => {
      (authService.login as any).mockRejectedValue(new Error());

      render(
        <TestWrapper>
          <LoginPageStyled />
        </TestWrapper>
      );

      // Fill in login form
      fireEvent.change(screen.getByPlaceholderText('samuel'), {
        target: { value: 'testuser' },
      });
      fireEvent.change(screen.getByPlaceholderText('••••••••'), {
        target: { value: 'password123' },
      });

      // Submit form
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      // Wait for error toast to appear
      await waitFor(() => {
        expect(
          screen.getByText('Login failed. Please check your credentials.')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Form Interaction with Toasts', () => {
    it('should clear error state and toast when user starts typing', async () => {
      const errorMessage = 'Invalid credentials';
      (authService.login as any).mockRejectedValue(new Error(errorMessage));

      render(
        <TestWrapper>
          <LoginPageStyled />
        </TestWrapper>
      );

      // Fill in login form and submit to trigger error
      fireEvent.change(screen.getByPlaceholderText('samuel'), {
        target: { value: 'wronguser' },
      });
      fireEvent.change(screen.getByPlaceholderText('••••••••'), {
        target: { value: 'wrongpassword' },
      });
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });

      // Start typing in username field
      fireEvent.change(screen.getByPlaceholderText('samuel'), {
        target: { value: 'newuser' },
      });

      // Error should be cleared from the form (but toast may still be visible)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

  });

  describe('Toast Accessibility', () => {
    it('should have proper ARIA attributes for toast notifications', async () => {
      const mockUser = {
        id: '1',
        username: 'testuser',
        email: 'test@example.com',
        role: 'user',
      };

      (authService.login as any).mockResolvedValue({ user: mockUser });

      render(
        <TestWrapper>
          <LoginPageStyled />
        </TestWrapper>
      );

      // Fill in and submit form
      fireEvent.change(screen.getByPlaceholderText('samuel'), {
        target: { value: 'testuser' },
      });
      fireEvent.change(screen.getByPlaceholderText('••••••••'), {
        target: { value: 'password123' },
      });
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      // Wait for toast to appear
      await waitFor(() => {
        expect(screen.getByText('Welcome back, testuser!')).toBeInTheDocument();
      });

      // Check for ARIA live regions
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });
});
