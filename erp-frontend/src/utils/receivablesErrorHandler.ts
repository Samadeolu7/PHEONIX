// src/utils/receivablesErrorHandler.ts
import {
  ErrorHandler,
  ApiError,
  ErrorType,
  LoadingStateManager,
  ButtonStateManager,
} from './errorHandler';

// Receivables-specific error contexts
export const RECEIVABLES_ERROR_CONTEXTS = {
  // Invoice operations
  CREATE_INVOICE: 'create-invoice',
  UPDATE_INVOICE: 'update-invoice',
  SEND_INVOICE: 'send-invoice',
  RECORD_PAYMENT: 'record-payment',
  BULK_INVOICE_GENERATION: 'bulk-invoice-generation',

  // Receivables operations
  LOAD_RECEIVABLES: 'load-receivables',
  UPDATE_AGING: 'update-aging',
  ASSIGN_COLLECTOR: 'assign-collector',
  SEND_REMINDER: 'send-reminder',
  CALCULATE_INTEREST: 'calculate-interest',
  APPLY_INTEREST: 'apply-interest',

  // Statement operations
  GENERATE_STATEMENT: 'generate-statement',
  SEND_STATEMENT: 'send-statement',
  BATCH_STATEMENT_GENERATION: 'batch-statement-generation',

  // Collection operations
  LOAD_COLLECTIONS_DATA: 'load-collections-data',
  BULK_ASSIGN_COLLECTOR: 'bulk-assign-collector',
  ESCALATE_RECEIVABLE: 'escalate-receivable',

  // Workflow operations
  TRIGGER_WORKFLOW: 'trigger-workflow',
  UPDATE_WORKFLOW_STATUS: 'update-workflow-status',

  // Data consistency operations
  RUN_CONSISTENCY_CHECK: 'run-consistency-check',
  RESOLVE_CONSISTENCY_ISSUES: 'resolve-consistency-issues',

  // Bulk operations
  BULK_PAYMENT_UPLOAD: 'bulk-payment-upload',
  BULK_AGING_UPDATE: 'bulk-aging-update',
  BULK_INTEREST_APPLICATION: 'bulk-interest-application',

  // Reporting operations
  GENERATE_AGING_REPORT: 'generate-aging-report',
  EXPORT_REPORT: 'export-report',
  LOAD_PAYMENT_TRENDS: 'load-payment-trends',
} as const;

// Context-specific error messages for receivables operations
const RECEIVABLES_ERROR_MESSAGES: Record<string, Record<ErrorType, string>> = {
  [RECEIVABLES_ERROR_CONTEXTS.CREATE_INVOICE]: {
    [ErrorType.VALIDATION]: 'Please check that all required fields are filled correctly.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to create invoices.',
    [ErrorType.CONFLICT]: 'Invoice number already exists. Please use a different number.',
    [ErrorType.SERVER]: 'Failed to create invoice. Please try again.',
    [ErrorType.NETWORK]: 'Connection failed while creating invoice. Please check your connection.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try again.',
    [ErrorType.NOT_FOUND]: 'Client or fee structure not found.',
    [ErrorType.RATE_LIMIT]: 'Too many invoice creation attempts. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Invoice creation timed out. Please try again.',
    [ErrorType.UNKNOWN]: 'Failed to create invoice. Please try again.',
  },

  [RECEIVABLES_ERROR_CONTEXTS.RECORD_PAYMENT]: {
    [ErrorType.VALIDATION]: 'Please check payment amount, date, and method are valid.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to record payments.',
    [ErrorType.CONFLICT]:
      'Payment amount exceeds outstanding balance or invoice has been modified.',
    [ErrorType.SERVER]: 'Failed to record payment. Please try again.',
    [ErrorType.NETWORK]: 'Connection failed while recording payment. Please try again.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try again.',
    [ErrorType.NOT_FOUND]: 'Invoice not found. It may have been deleted.',
    [ErrorType.RATE_LIMIT]: 'Too many payment attempts. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Payment recording timed out. Please try again.',
    [ErrorType.UNKNOWN]: 'Failed to record payment. Please try again.',
  },

  [RECEIVABLES_ERROR_CONTEXTS.BULK_INVOICE_GENERATION]: {
    [ErrorType.VALIDATION]: 'Please check fee structure and client selections are valid.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to generate bulk invoices.',
    [ErrorType.CONFLICT]: 'Some clients may already have invoices for this period.',
    [ErrorType.SERVER]: 'Bulk invoice generation failed. Please try again.',
    [ErrorType.NETWORK]: 'Connection failed during bulk generation. Please try again.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try again.',
    [ErrorType.NOT_FOUND]: 'Fee structure or some clients not found.',
    [ErrorType.RATE_LIMIT]: 'Too many bulk operations. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Bulk generation timed out. Please try with fewer clients.',
    [ErrorType.UNKNOWN]: 'Bulk invoice generation failed. Please try again.',
  },

  [RECEIVABLES_ERROR_CONTEXTS.LOAD_RECEIVABLES]: {
    [ErrorType.VALIDATION]: 'Invalid filter parameters. Please check your selections.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to view receivables.',
    [ErrorType.SERVER]: 'Failed to load receivables. Please refresh the page.',
    [ErrorType.NETWORK]:
      'Connection failed while loading receivables. Please check your connection.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in again.',
    [ErrorType.NOT_FOUND]: 'No receivables found matching your criteria.',
    [ErrorType.RATE_LIMIT]: 'Too many requests. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Loading timed out. Please try again.',
    [ErrorType.UNKNOWN]: 'Failed to load receivables. Please refresh the page.',
  },

  [RECEIVABLES_ERROR_CONTEXTS.UPDATE_AGING]: {
    [ErrorType.VALIDATION]: 'Invalid receivable data for aging calculation.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to update aging.',
    [ErrorType.CONFLICT]: 'Receivable has been modified. Please refresh and try again.',
    [ErrorType.SERVER]: 'Failed to update aging. Please try again.',
    [ErrorType.NETWORK]: 'Connection failed while updating aging. Please try again.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try again.',
    [ErrorType.NOT_FOUND]: 'Receivable not found. It may have been deleted.',
    [ErrorType.RATE_LIMIT]: 'Too many aging updates. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Aging update timed out. Please try again.',
    [ErrorType.UNKNOWN]: 'Failed to update aging. Please try again.',
  },

  [RECEIVABLES_ERROR_CONTEXTS.SEND_REMINDER]: {
    [ErrorType.VALIDATION]: 'Please check email address and reminder template.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to send reminders.',
    [ErrorType.CONFLICT]: 'Reminder may have already been sent recently.',
    [ErrorType.SERVER]: 'Failed to send reminder. Please try again.',
    [ErrorType.NETWORK]: 'Connection failed while sending reminder. Please try again.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try again.',
    [ErrorType.NOT_FOUND]: 'Receivable or email template not found.',
    [ErrorType.RATE_LIMIT]: 'Too many reminder attempts. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Reminder sending timed out. Please try again.',
    [ErrorType.UNKNOWN]: 'Failed to send reminder. Please try again.',
  },

  [RECEIVABLES_ERROR_CONTEXTS.GENERATE_STATEMENT]: {
    [ErrorType.VALIDATION]: 'Please check client ID and date range are valid.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to generate statements.',
    [ErrorType.CONFLICT]: 'Statement may already exist for this period.',
    [ErrorType.SERVER]: 'Failed to generate statement. Please try again.',
    [ErrorType.NETWORK]: 'Connection failed while generating statement. Please try again.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try again.',
    [ErrorType.NOT_FOUND]: 'Client not found or no transactions in period.',
    [ErrorType.RATE_LIMIT]: 'Too many statement generation requests. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Statement generation timed out. Please try again.',
    [ErrorType.UNKNOWN]: 'Failed to generate statement. Please try again.',
  },

  [RECEIVABLES_ERROR_CONTEXTS.BULK_PAYMENT_UPLOAD]: {
    [ErrorType.VALIDATION]: 'Please check your CSV file format and data.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to upload bulk payments.',
    [ErrorType.CONFLICT]: 'Some payments may conflict with existing records.',
    [ErrorType.SERVER]: 'Bulk payment upload failed. Please try again.',
    [ErrorType.NETWORK]: 'Connection failed during upload. Please try again.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try again.',
    [ErrorType.NOT_FOUND]: 'Some invoices in the file were not found.',
    [ErrorType.RATE_LIMIT]: 'Too many upload attempts. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Upload timed out. Please try with a smaller file.',
    [ErrorType.UNKNOWN]: 'Bulk payment upload failed. Please try again.',
  },

  [RECEIVABLES_ERROR_CONTEXTS.RUN_CONSISTENCY_CHECK]: {
    [ErrorType.VALIDATION]: 'Invalid parameters for consistency check.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to run consistency checks.',
    [ErrorType.SERVER]: 'Consistency check failed. Please try again.',
    [ErrorType.NETWORK]: 'Connection failed during consistency check. Please try again.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try again.',
    [ErrorType.NOT_FOUND]: 'No data found for consistency check.',
    [ErrorType.RATE_LIMIT]: 'Too many consistency check requests. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Consistency check timed out. Please try again.',
    [ErrorType.UNKNOWN]: 'Consistency check failed. Please try again.',
  },
};

// Progress tracking for long-running operations
export interface OperationProgress {
  operationId: string;
  context: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number; // 0-100
  message: string;
  startTime: Date;
  endTime?: Date;
  totalItems?: number;
  processedItems?: number;
  errors?: string[];
}

class ProgressTracker {
  private static operations = new Map<string, OperationProgress>();
  private static listeners = new Set<(operations: Map<string, OperationProgress>) => void>();

  static startOperation(operationId: string, context: string, totalItems?: number): void {
    const operation: OperationProgress = {
      operationId,
      context,
      status: 'in_progress',
      progress: 0,
      message: 'Starting operation...',
      startTime: new Date(),
      totalItems,
      processedItems: 0,
      errors: [],
    };

    this.operations.set(operationId, operation);
    this.notifyListeners();
  }

  static updateProgress(
    operationId: string,
    progress: number,
    message: string,
    processedItems?: number
  ): void {
    const operation = this.operations.get(operationId);
    if (operation) {
      operation.progress = Math.min(100, Math.max(0, progress));
      operation.message = message;
      if (processedItems !== undefined) {
        operation.processedItems = processedItems;
      }
      this.notifyListeners();
    }
  }

  static completeOperation(
    operationId: string,
    message: string = 'Operation completed successfully'
  ): void {
    const operation = this.operations.get(operationId);
    if (operation) {
      operation.status = 'completed';
      operation.progress = 100;
      operation.message = message;
      operation.endTime = new Date();
      this.notifyListeners();

      // Auto-remove completed operations after 5 seconds
      setTimeout(() => {
        this.operations.delete(operationId);
        this.notifyListeners();
      }, 5000);
    }
  }

  static failOperation(operationId: string, error: string): void {
    const operation = this.operations.get(operationId);
    if (operation) {
      operation.status = 'failed';
      operation.message = error;
      operation.endTime = new Date();
      operation.errors = operation.errors || [];
      operation.errors.push(error);
      this.notifyListeners();

      // Auto-remove failed operations after 10 seconds
      setTimeout(() => {
        this.operations.delete(operationId);
        this.notifyListeners();
      }, 10000);
    }
  }

  static addError(operationId: string, error: string): void {
    const operation = this.operations.get(operationId);
    if (operation) {
      operation.errors = operation.errors || [];
      operation.errors.push(error);
      this.notifyListeners();
    }
  }

  static getOperation(operationId: string): OperationProgress | undefined {
    return this.operations.get(operationId);
  }

  static getAllOperations(): OperationProgress[] {
    return Array.from(this.operations.values());
  }

  static subscribe(listener: (operations: Map<string, OperationProgress>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private static notifyListeners(): void {
    this.listeners.forEach(listener => listener(new Map(this.operations)));
  }

  static clear(): void {
    this.operations.clear();
    this.notifyListeners();
  }
}

// Enhanced error handler for receivables operations
export class ReceivablesErrorHandler extends ErrorHandler {
  /**
   * Handle receivables-specific errors with context-aware messages
   */
  static handleReceivablesError(error: any, context: string, operationId?: string): ApiError {
    const classifiedError = this.classifyError(error);

    // Log the error with receivables context
    this.logError(classifiedError, context);

    // Update operation progress if tracking
    if (operationId) {
      const userMessage = this.getReceivablesUserMessage(classifiedError, context);
      ProgressTracker.failOperation(operationId, userMessage);
    }

    return classifiedError;
  }

  /**
   * Get user-friendly message for receivables operations
   */
  static getReceivablesUserMessage(error: ApiError, context: string): string {
    // Try receivables-specific message first
    if (RECEIVABLES_ERROR_MESSAGES[context]?.[error.code as ErrorType]) {
      return RECEIVABLES_ERROR_MESSAGES[context][error.code as ErrorType];
    }

    // Fall back to general error handler
    return this.getUserFriendlyMessage(error, context);
  }

  /**
   * Execute receivables operation with enhanced error handling and progress tracking
   */
  static async executeWithProgress<T>(
    operation: () => Promise<T>,
    context: string,
    operationId: string,
    totalItems?: number,
    progressCallback?: (progress: number, message: string) => void
  ): Promise<T> {
    // Start progress tracking
    ProgressTracker.startOperation(operationId, context, totalItems);
    LoadingStateManager.addOperation(operationId);

    try {
      // Update progress callback to also update tracker
      const enhancedProgressCallback = (
        progress: number,
        message: string,
        processedItems?: number
      ) => {
        ProgressTracker.updateProgress(operationId, progress, message, processedItems);
        progressCallback?.(progress, message);
      };

      // Execute operation with retry logic
      const result = await this.withRetry(
        async () => {
          enhancedProgressCallback(10, 'Executing operation...');
          const result = await operation();
          enhancedProgressCallback(90, 'Finalizing...');
          return result;
        },
        context,
        {
          maxRetries: 2,
          baseDelay: 1000,
          retryableStatuses: [429, 500, 502, 503, 504],
        }
      );

      // Complete successfully
      ProgressTracker.completeOperation(operationId, 'Operation completed successfully');
      return result;
    } catch (error) {
      const classifiedError = this.handleReceivablesError(error, context, operationId);
      throw classifiedError;
    } finally {
      LoadingStateManager.removeOperation(operationId);
    }
  }

  /**
   * Execute bulk operation with item-by-item progress tracking
   */
  static async executeBulkOperation<T, R>(
    items: T[],
    operation: (item: T, index: number) => Promise<R>,
    context: string,
    operationId: string,
    options: {
      batchSize?: number;
      continueOnError?: boolean;
      progressCallback?: (progress: number, message: string, processedItems: number) => void;
    } = {}
  ): Promise<{ results: R[]; errors: Array<{ item: T; error: ApiError }> }> {
    const { batchSize = 10, continueOnError = true, progressCallback } = options;

    // Start progress tracking
    ProgressTracker.startOperation(operationId, context, items.length);
    LoadingStateManager.addOperation(operationId);

    const results: R[] = [];
    const errors: Array<{ item: T; error: ApiError }> = [];

    try {
      // Process items in batches
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, Math.min(i + batchSize, items.length));

        // Process batch items
        const batchPromises = batch.map(async (item, batchIndex) => {
          const itemIndex = i + batchIndex;
          try {
            const result = await operation(item, itemIndex);
            results[itemIndex] = result;

            // Update progress
            const progress = ((itemIndex + 1) / items.length) * 100;
            const message = `Processing item ${itemIndex + 1} of ${items.length}`;
            ProgressTracker.updateProgress(operationId, progress, message, itemIndex + 1);
            progressCallback?.(progress, message, itemIndex + 1);
          } catch (error) {
            const classifiedError = this.classifyError(error);
            errors.push({ item, error: classifiedError });

            // Add error to progress tracker
            ProgressTracker.addError(
              operationId,
              `Item ${itemIndex + 1}: ${classifiedError.message}`
            );

            if (!continueOnError) {
              throw classifiedError;
            }
          }
        });

        // Wait for batch to complete
        await Promise.all(batchPromises);

        // Small delay between batches to avoid overwhelming the server
        if (i + batchSize < items.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Complete operation
      const successCount = results.filter(r => r !== undefined).length;
      const message =
        errors.length > 0
          ? `Completed with ${successCount} successes and ${errors.length} errors`
          : `Successfully processed all ${successCount} items`;

      ProgressTracker.completeOperation(operationId, message);

      return { results, errors };
    } catch (error) {
      const classifiedError = this.handleReceivablesError(error, context, operationId);
      throw classifiedError;
    } finally {
      LoadingStateManager.removeOperation(operationId);
    }
  }

  /**
   * Handle file upload operations with progress tracking
   */
  static async executeFileUpload<T>(
    file: File,
    uploadOperation: (file: File, progressCallback: (progress: number) => void) => Promise<T>,
    context: string,
    operationId: string
  ): Promise<T> {
    // Start progress tracking
    ProgressTracker.startOperation(operationId, context);
    LoadingStateManager.addOperation(operationId);

    try {
      const result = await uploadOperation(file, progress => {
        ProgressTracker.updateProgress(
          operationId,
          progress,
          `Uploading... ${progress.toFixed(1)}%`
        );
      });

      ProgressTracker.completeOperation(operationId, 'File uploaded successfully');
      return result;
    } catch (error) {
      const classifiedError = this.handleReceivablesError(error, context, operationId);
      throw classifiedError;
    } finally {
      LoadingStateManager.removeOperation(operationId);
    }
  }
}

// Export progress tracker for use in components
export { ProgressTracker };

// Export default as ReceivablesErrorHandler
export default ReceivablesErrorHandler;
