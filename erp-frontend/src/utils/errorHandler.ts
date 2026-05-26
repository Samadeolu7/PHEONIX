// src/utils/errorHandler.ts
import { tokenManager } from '../services/tokenManager';

export interface ApiError {
  message: string;
  code: string;
  status?: number;
  details?: any;
  retryable: boolean;
  userFriendly: boolean;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableStatuses: number[];
}

export interface ErrorHandlerOptions {
  showToast?: boolean;
  logError?: boolean;
  context?: string;
  retryConfig?: Partial<RetryConfig>;
}

// Default retry configuration
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  retryableStatuses: [429, 500, 502, 503, 504],
};

// Error classification types
export enum ErrorType {
  NETWORK = 'NETWORK',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  VALIDATION = 'VALIDATION',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT = 'RATE_LIMIT',
  SERVER = 'SERVER',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

// Error classification mapping
const ERROR_CLASSIFICATIONS: Record<
  number,
  { type: ErrorType; retryable: boolean; userFriendly: boolean }
> = {
  400: { type: ErrorType.VALIDATION, retryable: false, userFriendly: true },
  401: { type: ErrorType.AUTHENTICATION, retryable: false, userFriendly: true },
  403: { type: ErrorType.AUTHORIZATION, retryable: false, userFriendly: true },
  404: { type: ErrorType.NOT_FOUND, retryable: false, userFriendly: true },
  409: { type: ErrorType.CONFLICT, retryable: false, userFriendly: true },
  422: { type: ErrorType.VALIDATION, retryable: false, userFriendly: true },
  429: { type: ErrorType.RATE_LIMIT, retryable: true, userFriendly: true },
  500: { type: ErrorType.SERVER, retryable: true, userFriendly: true },
  502: { type: ErrorType.SERVER, retryable: true, userFriendly: true },
  503: { type: ErrorType.SERVER, retryable: true, userFriendly: true },
  504: { type: ErrorType.TIMEOUT, retryable: true, userFriendly: true },
};

// User-friendly error messages
const USER_FRIENDLY_MESSAGES: Record<ErrorType, string> = {
  [ErrorType.NETWORK]:
    'Network connection failed. Please check your internet connection and try again.',
  [ErrorType.AUTHENTICATION]: 'Your session has expired. Please log in again.',
  [ErrorType.AUTHORIZATION]: 'You do not have permission to perform this action.',
  [ErrorType.VALIDATION]: 'Please check your input and try again.',
  [ErrorType.NOT_FOUND]: 'The requested resource was not found.',
  [ErrorType.CONFLICT]: 'This action conflicts with existing data. Please refresh and try again.',
  [ErrorType.RATE_LIMIT]: 'Too many requests. Please wait a moment and try again.',
  [ErrorType.SERVER]: 'Server error. Please try again in a few moments.',
  [ErrorType.TIMEOUT]: 'Request timed out. Please try again.',
  [ErrorType.UNKNOWN]: 'An unexpected error occurred. Please try again.',
};

// Context-specific error messages for procurement operations
const CONTEXT_SPECIFIC_MESSAGES: Record<string, Record<ErrorType, string>> = {
  'submit-requisition': {
    [ErrorType.VALIDATION]: 'Please check that all required fields are filled and items are added.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to submit requisitions.',
    [ErrorType.CONFLICT]: 'This requisition may have been modified. Please refresh and try again.',
    [ErrorType.SERVER]: 'Failed to submit requisition. Please try again.',
    [ErrorType.NETWORK]: 'Connection failed while submitting requisition. Please try again.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try again.',
    [ErrorType.NOT_FOUND]: 'Requisition not found. It may have been deleted.',
    [ErrorType.RATE_LIMIT]: 'Too many submission attempts. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Submission timed out. Please try again.',
    [ErrorType.UNKNOWN]: 'Failed to submit requisition. Please try again.',
  },
  'convert-requisition': {
    [ErrorType.VALIDATION]: 'Requisition must be approved before converting to purchase order.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to convert requisitions.',
    [ErrorType.CONFLICT]: 'This requisition may have already been converted.',
    [ErrorType.SERVER]: 'Failed to convert requisition to purchase order. Please try again.',
    [ErrorType.NETWORK]: 'Connection failed while converting requisition. Please try again.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try again.',
    [ErrorType.NOT_FOUND]: 'Requisition not found. It may have been deleted.',
    [ErrorType.RATE_LIMIT]: 'Too many conversion attempts. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Conversion timed out. Please try again.',
    [ErrorType.UNKNOWN]: 'Failed to convert requisition. Please try again.',
  },
  'create-stock-adjustment': {
    [ErrorType.VALIDATION]: 'Please check item, location, quantity, and reason fields.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to create stock adjustments.',
    [ErrorType.CONFLICT]: 'Stock levels may have changed. Please refresh and try again.',
    [ErrorType.SERVER]: 'Failed to create stock adjustment. Please try again.',
    [ErrorType.NETWORK]: 'Connection failed while creating adjustment. Please try again.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try again.',
    [ErrorType.NOT_FOUND]: 'Item or location not found.',
    [ErrorType.RATE_LIMIT]: 'Too many adjustment requests. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Request timed out. Please try again.',
    [ErrorType.UNKNOWN]: 'Failed to create stock adjustment. Please try again.',
  },
  'create-stock-transfer': {
    [ErrorType.VALIDATION]: 'Please check item, locations, and quantity fields.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to create stock transfers.',
    [ErrorType.CONFLICT]: 'Stock levels may have changed. Please refresh and try again.',
    [ErrorType.SERVER]: 'Failed to create stock transfer. Please try again.',
    [ErrorType.NETWORK]: 'Connection failed while creating transfer. Please try again.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try again.',
    [ErrorType.NOT_FOUND]: 'Item or location not found.',
    [ErrorType.RATE_LIMIT]: 'Too many transfer requests. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Request timed out. Please try again.',
    [ErrorType.UNKNOWN]: 'Failed to create stock transfer. Please try again.',
  },
  'fetch-stock-levels': {
    [ErrorType.VALIDATION]: 'Invalid request parameters.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to view stock levels.',
    [ErrorType.SERVER]: 'Failed to load stock levels. Please try again.',
    [ErrorType.NETWORK]: 'Connection failed while loading stock levels. Please try again.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try again.',
    [ErrorType.NOT_FOUND]: 'No stock levels found for this item.',
    [ErrorType.RATE_LIMIT]: 'Too many requests. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Request timed out. Please try again.',
    [ErrorType.UNKNOWN]: 'Failed to load stock levels. Please try again.',
  },
  'fetch-movements': {
    [ErrorType.VALIDATION]: 'Invalid request parameters.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to view stock movements.',
    [ErrorType.SERVER]: 'Failed to load stock movements. Please try again.',
    [ErrorType.NETWORK]: 'Connection failed while loading movements. Please try again.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try again.',
    [ErrorType.NOT_FOUND]: 'No movements found for this item.',
    [ErrorType.RATE_LIMIT]: 'Too many requests. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Request timed out. Please try again.',
    [ErrorType.UNKNOWN]: 'Failed to load stock movements. Please try again.',
  },
  'create-requisition-with-workflow': {
    [ErrorType.VALIDATION]: 'Please check that all required fields are filled and items are added.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to create requisitions with workflow.',
    [ErrorType.CONFLICT]: 'Workflow system may be busy. Please try again.',
    [ErrorType.SERVER]: 'Workflow system is currently unavailable. Please try again.',
    [ErrorType.NETWORK]:
      'Connection failed while creating requisition with workflow. Please try again.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try again.',
    [ErrorType.NOT_FOUND]: 'Workflow configuration not found. Please contact administrator.',
    [ErrorType.RATE_LIMIT]: 'Too many workflow requests. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Workflow creation timed out. Please try again.',
    [ErrorType.UNKNOWN]: 'Failed to create requisition with workflow. Please try again.',
  },
  'convert-requisition-with-details': {
    [ErrorType.VALIDATION]:
      'Please provide supplier, delivery location, and expected delivery date.',
    [ErrorType.AUTHORIZATION]:
      'You do not have permission to convert requisitions to purchase orders.',
    [ErrorType.CONFLICT]: 'This requisition may have already been converted or is not approved.',
    [ErrorType.SERVER]: 'Failed to convert requisition to purchase order. Please try again.',
    [ErrorType.NETWORK]: 'Connection failed while converting requisition. Please try again.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try again.',
    [ErrorType.NOT_FOUND]: 'Requisition not found or supplier/location invalid.',
    [ErrorType.RATE_LIMIT]: 'Too many conversion attempts. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Conversion timed out. Please try again.',
    [ErrorType.UNKNOWN]: 'Failed to convert requisition. Please try again.',
  },
  'save-requisition-draft': {
    [ErrorType.VALIDATION]: 'Please check your form data before saving as draft.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to save requisition drafts.',
    [ErrorType.CONFLICT]: 'This requisition may have been modified. Please refresh and try again.',
    [ErrorType.SERVER]: 'Failed to save draft. Please try again.',
    [ErrorType.NETWORK]: 'Connection failed while saving draft. Your changes will be preserved.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try saving again.',
    [ErrorType.NOT_FOUND]: 'Requisition not found. It may have been deleted.',
    [ErrorType.RATE_LIMIT]: 'Too many save attempts. Please wait a moment and try again.',
    [ErrorType.TIMEOUT]: 'Save operation timed out. Please try again.',
    [ErrorType.UNKNOWN]: 'Failed to save draft. Please try again.',
  },
  'submit-requisition-manual': {
    [ErrorType.VALIDATION]:
      'Please ensure all required fields are completed before submitting for approval.',
    [ErrorType.AUTHORIZATION]:
      'You do not have permission to submit requisitions for manual approval.',
    [ErrorType.CONFLICT]: 'This requisition may have been modified. Please refresh and try again.',
    [ErrorType.SERVER]: 'Failed to submit requisition for approval. Please try again.',
    [ErrorType.NETWORK]: 'Connection failed while submitting for approval. Please try again.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try submitting again.',
    [ErrorType.NOT_FOUND]: 'Requisition not found. It may have been deleted.',
    [ErrorType.RATE_LIMIT]: 'Too many submission attempts. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Submission timed out. Please try again.',
    [ErrorType.UNKNOWN]: 'Failed to submit requisition for approval. Please try again.',
  },
};

/**
 * Loading state manager for tracking operation states
 */
export class LoadingStateManager {
  private static loadingOperations = new Set<string>();
  private static listeners = new Set<(operations: Set<string>) => void>();

  static addOperation(operationId: string): void {
    this.loadingOperations.add(operationId);
    this.notifyListeners();
  }

  static removeOperation(operationId: string): void {
    this.loadingOperations.delete(operationId);
    this.notifyListeners();
  }

  static isLoading(operationId?: string): boolean {
    if (operationId) {
      return this.loadingOperations.has(operationId);
    }
    return this.loadingOperations.size > 0;
  }

  static getLoadingOperations(): string[] {
    return Array.from(this.loadingOperations);
  }

  static subscribe(listener: (operations: Set<string>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private static notifyListeners(): void {
    this.listeners.forEach(listener => listener(new Set(this.loadingOperations)));
  }

  static clear(): void {
    this.loadingOperations.clear();
    this.notifyListeners();
  }
}

/**
 * Button state manager for disabling buttons during operations
 */
export class ButtonStateManager {
  private static disabledButtons = new Map<string, Set<string>>();
  private static listeners = new Set<(disabledButtons: Map<string, Set<string>>) => void>();

  static disableButton(operationId: string, buttonId: string): void {
    if (!this.disabledButtons.has(operationId)) {
      this.disabledButtons.set(operationId, new Set());
    }
    this.disabledButtons.get(operationId)!.add(buttonId);
    this.notifyListeners();
  }

  static enableButton(operationId: string, buttonId: string): void {
    const buttons = this.disabledButtons.get(operationId);
    if (buttons) {
      buttons.delete(buttonId);
      if (buttons.size === 0) {
        this.disabledButtons.delete(operationId);
      }
    }
    this.notifyListeners();
  }

  static isButtonDisabled(buttonId: string): boolean {
    for (const buttons of this.disabledButtons.values()) {
      if (buttons.has(buttonId)) {
        return true;
      }
    }
    return false;
  }

  static getDisabledButtons(): string[] {
    const allDisabled = new Set<string>();
    for (const buttons of this.disabledButtons.values()) {
      buttons.forEach(button => allDisabled.add(button));
    }
    return Array.from(allDisabled);
  }

  static subscribe(listener: (disabledButtons: Map<string, Set<string>>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private static notifyListeners(): void {
    this.listeners.forEach(listener => listener(new Map(this.disabledButtons)));
  }

  static clear(): void {
    this.disabledButtons.clear();
    this.notifyListeners();
  }
}

/**
 * Utility class for comprehensive error handling
 */
export class ErrorHandler {
  /**
   * Sleep utility for retry delays
   */
  private static async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate exponential backoff delay
   */
  private static calculateDelay(attempt: number, config: RetryConfig): number {
    const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    return Math.min(delay, config.maxDelay);
  }

  /**
   * Classify error based on various error types
   */
  static classifyError(error: any): ApiError {
    let status: number | undefined;
    let message = 'An unexpected error occurred';
    let details = error;

    // Extract status code from different error formats
    if (error?.response?.status) {
      status = error.response.status;
    } else if (error?.status) {
      status = error.status;
    } else if (typeof error === 'string' && error.includes('HTTP')) {
      const statusMatch = error.match(/HTTP (\d+)/);
      if (statusMatch) {
        status = parseInt(statusMatch[1]);
      }
    }

    // Extract message from different error formats
    if (error?.response?.data?.message) {
      message = error.response.data.message;
    } else if (error?.response?.data?.detail) {
      message = error.response.data.detail;
    } else if (error?.response?.data?.error) {
      message = error.response.data.error;
    } else if (error?.message) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    }

    // Handle network errors
    if (
      !status &&
      (message.toLowerCase().includes('network') ||
        message.toLowerCase().includes('fetch') ||
        message.toLowerCase().includes('connection') ||
        error?.name === 'NetworkError')
    ) {
      return {
        message,
        code: ErrorType.NETWORK,
        retryable: true,
        userFriendly: true,
        details,
      };
    }

    // Handle timeout errors
    if (!status && (message.toLowerCase().includes('timeout') || error?.name === 'TimeoutError')) {
      return {
        message,
        code: ErrorType.TIMEOUT,
        retryable: true,
        userFriendly: true,
        details,
      };
    }

    // Classify based on HTTP status code
    if (status) {
      const classification = ERROR_CLASSIFICATIONS[status] || {
        type: ErrorType.UNKNOWN,
        retryable: status >= 500,
        userFriendly: true,
      };

      return {
        message,
        code: classification.type,
        status,
        retryable: classification.retryable,
        userFriendly: classification.userFriendly,
        details,
      };
    }

    // Default classification for unknown errors
    return {
      message,
      code: ErrorType.UNKNOWN,
      retryable: false,
      userFriendly: true,
      details,
    };
  }

  /**
   * Get user-friendly error message based on context
   */
  static getUserFriendlyMessage(error: ApiError, context?: string): string {
    // Try context-specific message first
    if (context && CONTEXT_SPECIFIC_MESSAGES[context]?.[error.code as ErrorType]) {
      return CONTEXT_SPECIFIC_MESSAGES[context][error.code as ErrorType];
    }

    // Fall back to general user-friendly message
    return USER_FRIENDLY_MESSAGES[error.code as ErrorType] || error.message;
  }

  /**
   * Execute operation with retry logic and exponential backoff
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    context: string,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: ApiError;

    for (let attempt = 1; attempt <= retryConfig.maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = this.classifyError(error);

        // Handle authentication errors immediately
        if (lastError.code === ErrorType.AUTHENTICATION) {
          // Try to refresh token
          const refreshSuccess = await tokenManager.refreshToken();
          if (refreshSuccess && attempt <= retryConfig.maxRetries) {
            // Retry with new token
            const delay = this.calculateDelay(attempt, retryConfig);
            console.warn(
              `Authentication error in ${context}, token refreshed, retrying in ${delay}ms (attempt ${attempt})`
            );
            await this.sleep(delay);
            continue;
          } else {
            // Redirect to login if refresh fails
            console.error(`Authentication failed in ${context}, redirecting to login`);
            throw lastError;
          }
        }

        // Don't retry if it's the last attempt or error is not retryable
        if (attempt > retryConfig.maxRetries || !lastError.retryable) {
          console.error(`Operation failed in ${context} after ${attempt} attempts:`, lastError);
          throw lastError;
        }

        // Wait before retrying
        const delay = this.calculateDelay(attempt, retryConfig);
        console.warn(
          `Attempt ${attempt} failed for ${context}, retrying in ${delay}ms:`,
          lastError.message
        );
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Handle authentication errors by redirecting to login
   */
  static handleAuthenticationError(): void {
    // Clear tokens
    tokenManager.clearTokens();

    // Redirect to login page
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }

  /**
   * Check if error should trigger a redirect to login
   */
  static shouldRedirectToLogin(error: ApiError): boolean {
    return error.code === ErrorType.AUTHENTICATION;
  }

  /**
   * Log error with appropriate level based on error type
   */
  static logError(error: ApiError, context: string): void {
    const logData = {
      context,
      code: error.code,
      status: error.status,
      message: error.message,
      retryable: error.retryable,
      timestamp: new Date().toISOString(),
      details: error.details,
    };

    if (error.retryable) {
      console.warn('Retryable error:', logData);
    } else {
      console.error('Non-retryable error:', logData);
    }

    // In production, you might want to send this to an error tracking service
    // like Sentry, LogRocket, or your own logging endpoint
  }
}

export default ErrorHandler;
