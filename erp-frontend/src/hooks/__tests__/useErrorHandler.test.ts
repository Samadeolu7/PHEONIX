import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { useErrorHandler } from '../useErrorHandler';
import { useToast } from '../useToast';

// Mock useToast hook
vi.mock('../useToast');
const mockUseToast = useToast as vi.MockedFunction<typeof useToast>;

describe('useErrorHandler', () => {
  const mockToast = {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseToast.mockReturnValue(mockToast);
    console.error = vi.fn();
  });

  describe('handleError', () => {
    it('should handle basic error with default options', () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new Error('Test error');

      const errorInfo = result.current.handleError(error, 'test operation');

      expect(errorInfo.message).toBe('Test error');
      expect(errorInfo.code).toBe('UNKNOWN_ERROR');
      expect(mockToast.error).toHaveBeenCalledWith('Test error');
    });

    it('should handle HTTP 400 error', () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new Error('HTTP 400');

      const errorInfo = result.current.handleError(error, 'test operation');

      expect(errorInfo.code).toBe('BAD_REQUEST');
      expect(errorInfo.message).toBe('Invalid request. Please check your input and try again.');
      expect(errorInfo.retryable).toBe(false);
    });

    it('should handle HTTP 401 error', () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new Error('HTTP 401');

      const errorInfo = result.current.handleError(error, 'test operation');

      expect(errorInfo.code).toBe('UNAUTHORIZED');
      expect(errorInfo.message).toBe('Authentication required. Please log in and try again.');
      expect(errorInfo.retryable).toBe(false);
    });

    it('should handle HTTP 500 error as retryable', () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new Error('HTTP 500');

      const errorInfo = result.current.handleError(error, 'test operation');

      expect(errorInfo.code).toBe('INTERNAL_SERVER_ERROR');
      expect(errorInfo.message).toBe('Server error. Please try again later.');
      expect(errorInfo.retryable).toBe(true);
    });

    it('should handle network error as retryable', () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new Error('NetworkError');

      const errorInfo = result.current.handleError(error, 'test operation');

      expect(errorInfo.code).toBe('NETWORK_ERROR');
      expect(errorInfo.message).toBe(
        'Network connection failed. Please check your internet connection.'
      );
      expect(errorInfo.retryable).toBe(true);
    });

    it('should not show toast when showToast is false', () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new Error('Test error');

      result.current.handleError(error, 'test operation', { showToast: false });

      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it('should not log error when logError is false', () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new Error('Test error');

      result.current.handleError(error, 'test operation', { logError: false });

      expect(console.error).not.toHaveBeenCalled();
    });

    it('should show retry action for retryable errors', () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new Error('HTTP 500');
      const onRetry = vi.fn();

      result.current.handleError(error, 'test operation', { onRetry });

      expect(mockToast.error).toHaveBeenCalledWith('Server error. Please try again later.', {
        action: {
          label: 'Retry',
          onClick: onRetry,
        },
      });
    });

    it('should handle API response errors', () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = {
        response: {
          status: 422,
          data: {
            message: 'Validation failed',
          },
        },
      };

      const errorInfo = result.current.handleError(error, 'test operation');

      expect(errorInfo.code).toBe('VALIDATION_ERROR');
      expect(errorInfo.message).toBe('Validation failed');
    });

    it('should handle validation errors array', () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = {
        errors: ['Field 1 is required', 'Field 2 is invalid'],
      };

      const errorInfo = result.current.handleError(error, 'test operation');

      expect(errorInfo.message).toBe('Field 1 is required, Field 2 is invalid');
      expect(errorInfo.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('handleAsyncError', () => {
    it('should handle successful async operation', async () => {
      const { result } = renderHook(() => useErrorHandler());
      const asyncOperation = vi.fn().mockResolvedValue('success');

      const response = await result.current.handleAsyncError(asyncOperation, 'test operation');

      expect(response).toBe('success');
      expect(asyncOperation).toHaveBeenCalled();
    });

    it('should handle failed async operation', async () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new Error('Async error');
      const asyncOperation = vi.fn().mockRejectedValue(error);

      await expect(
        result.current.handleAsyncError(asyncOperation, 'test operation')
      ).rejects.toMatchObject({
        message: 'Async error',
        code: 'UNKNOWN_ERROR',
      });

      expect(mockToast.error).toHaveBeenCalledWith('Async error');
    });

    it('should pass through options to handleError', async () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new Error('Async error');
      const asyncOperation = vi.fn().mockRejectedValue(error);

      await expect(
        result.current.handleAsyncError(asyncOperation, 'test operation', { showToast: false })
      ).rejects.toMatchObject({
        message: 'Async error',
      });

      expect(mockToast.error).not.toHaveBeenCalled();
    });
  });

  describe('error parsing', () => {
    it('should handle string errors', () => {
      const { result } = renderHook(() => useErrorHandler());

      const errorInfo = result.current.handleError('String error', 'test operation');

      expect(errorInfo.message).toBe('String error');
      expect(errorInfo.code).toBe('UNKNOWN_ERROR');
    });

    it('should handle already parsed ProcurementError', () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = {
        message: 'Procurement error',
        code: 'CUSTOM_ERROR',
        retryable: true,
      };

      const errorInfo = result.current.handleError(error, 'test operation');

      expect(errorInfo).toEqual(error);
    });

    it('should handle timeout errors', () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new Error('Request timeout');

      const errorInfo = result.current.handleError(error, 'test operation');

      expect(errorInfo.code).toBe('TIMEOUT_ERROR');
      expect(errorInfo.message).toBe('Request timed out. Please try again.');
      expect(errorInfo.retryable).toBe(true);
    });
  });
});
