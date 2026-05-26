// src/hooks/useProcurementIntegration.ts
import { useState, useCallback } from 'react';
import {
  procurementIntegrationService,
  IntegrationPostingData,
  IntegrationResult,
} from '../services/procurementIntegrationService';
import {
  GRNIntegrationStatus,
  ReturnIntegrationStatus,
  BatchProcessingResult,
  PendingIntegration,
} from '../types/procurement';
import { useToast } from './useToast';

export interface UseProcurementIntegrationOptions {
  onSuccess?: (result: IntegrationResult | BatchProcessingResult) => void;
  onError?: (error: string) => void;
  autoRefresh?: boolean;
}

export interface UseProcurementIntegrationReturn {
  // State
  loading: boolean;
  error: string | null;

  // GRN Integration Methods
  postGRNToInventory: (grnId: number, postingData: IntegrationPostingData) => Promise<void>;
  postGRNToAccounting: (grnId: number, postingData: IntegrationPostingData) => Promise<void>;
  postGRNToBothSystems: (grnId: number, postingData: IntegrationPostingData) => Promise<void>;
  getGRNIntegrationStatus: (grnId: number) => Promise<GRNIntegrationStatus | null>;

  // Return Integration Methods
  postReturnToInventory: (returnId: number, postingData: IntegrationPostingData) => Promise<void>;
  postReturnToAccounting: (returnId: number, postingData: IntegrationPostingData) => Promise<void>;
  postReturnToBothSystems: (returnId: number, postingData: IntegrationPostingData) => Promise<void>;
  getReturnIntegrationStatus: (returnId: number) => Promise<ReturnIntegrationStatus | null>;

  // Batch Processing Methods
  batchProcessGRNs: (grnIds: number[], postingData: IntegrationPostingData) => Promise<void>;
  batchProcessReturns: (returnIds: number[], postingData: IntegrationPostingData) => Promise<void>;

  // Utility Methods
  getPendingIntegrations: (params?: {
    type?: 'grn' | 'return';
    system?: 'inventory' | 'accounting' | 'both';
  }) => Promise<PendingIntegration[]>;
  clearError: () => void;
}

export const useProcurementIntegration = (
  options: UseProcurementIntegrationOptions = {}
): UseProcurementIntegrationReturn => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const { onSuccess, onError, autoRefresh = true } = options;

  const handleError = useCallback(
    (err: unknown, operation: string) => {
      const errorMessage = err instanceof Error ? err.message : `Failed to ${operation}`;
      setError(errorMessage);
      onError?.(errorMessage);
      showToast(errorMessage, 'error');
    },
    [onError, showToast]
  );

  const handleSuccess = useCallback(
    (result: IntegrationResult | BatchProcessingResult, operation: string) => {
      setError(null);
      onSuccess?.(result);

      if ('success' in result) {
        // IntegrationResult
        if (result.success) {
          showToast(`Successfully ${operation}`, 'success');
        } else {
          const errorMsg = result.errors.join('; ');
          setError(errorMsg);
          showToast(errorMsg, 'error');
        }

        if (result.warnings.length > 0) {
          showToast(result.warnings.join('; '), 'warning');
        }
      } else {
        // BatchProcessingResult
        if (result.successful > 0) {
          showToast(
            `Batch processing completed: ${result.successful} successful, ${result.failed} failed`,
            result.failed === 0 ? 'success' : 'warning'
          );
        } else {
          showToast('Batch processing failed for all items', 'error');
        }
      }
    },
    [onSuccess, showToast]
  );

  // ============================================================================
  // GRN INTEGRATION METHODS
  // ============================================================================

  const postGRNToInventory = useCallback(
    async (grnId: number, postingData: IntegrationPostingData) => {
      try {
        setLoading(true);
        setError(null);

        const inventoryResult = await procurementIntegrationService.postGRNToInventory(
          grnId,
          postingData
        );

        const result: IntegrationResult = {
          success: inventoryResult.success,
          inventory_result: inventoryResult,
          errors: inventoryResult.errors || [],
          warnings: [],
        };

        handleSuccess(result, `post GRN ${grnId} to inventory`);
      } catch (err) {
        handleError(err, `post GRN ${grnId} to inventory`);
      } finally {
        setLoading(false);
      }
    },
    [handleError, handleSuccess]
  );

  const postGRNToAccounting = useCallback(
    async (grnId: number, postingData: IntegrationPostingData) => {
      try {
        setLoading(true);
        setError(null);

        const accountingResult = await procurementIntegrationService.postGRNToAccounting(
          grnId,
          postingData
        );

        const result: IntegrationResult = {
          success: accountingResult.success,
          accounting_result: accountingResult,
          errors: accountingResult.errors || [],
          warnings: [],
        };

        handleSuccess(result, `post GRN ${grnId} to accounting`);
      } catch (err) {
        handleError(err, `post GRN ${grnId} to accounting`);
      } finally {
        setLoading(false);
      }
    },
    [handleError, handleSuccess]
  );

  const postGRNToBothSystems = useCallback(
    async (grnId: number, postingData: IntegrationPostingData) => {
      try {
        setLoading(true);
        setError(null);

        const result = await procurementIntegrationService.postGRNToBothSystems(grnId, postingData);
        handleSuccess(result, `post GRN ${grnId} to both systems`);
      } catch (err) {
        handleError(err, `post GRN ${grnId} to both systems`);
      } finally {
        setLoading(false);
      }
    },
    [handleError, handleSuccess]
  );

  const getGRNIntegrationStatus = useCallback(
    async (grnId: number): Promise<GRNIntegrationStatus | null> => {
      try {
        setLoading(true);
        setError(null);

        const status = await procurementIntegrationService.getGRNIntegrationStatus(grnId);
        return status;
      } catch (err) {
        handleError(err, `get GRN ${grnId} integration status`);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [handleError]
  );

  // ============================================================================
  // RETURN INTEGRATION METHODS
  // ============================================================================

  const postReturnToInventory = useCallback(
    async (returnId: number, postingData: IntegrationPostingData) => {
      try {
        setLoading(true);
        setError(null);

        const inventoryResult = await procurementIntegrationService.postReturnToInventory(
          returnId,
          postingData
        );

        const result: IntegrationResult = {
          success: inventoryResult.success,
          inventory_result: inventoryResult,
          errors: inventoryResult.errors || [],
          warnings: [],
        };

        handleSuccess(result, `post return ${returnId} to inventory`);
      } catch (err) {
        handleError(err, `post return ${returnId} to inventory`);
      } finally {
        setLoading(false);
      }
    },
    [handleError, handleSuccess]
  );

  const postReturnToAccounting = useCallback(
    async (returnId: number, postingData: IntegrationPostingData) => {
      try {
        setLoading(true);
        setError(null);

        const accountingResult = await procurementIntegrationService.postReturnToAccounting(
          returnId,
          postingData
        );

        const result: IntegrationResult = {
          success: accountingResult.success,
          accounting_result: accountingResult,
          errors: accountingResult.errors || [],
          warnings: [],
        };

        handleSuccess(result, `post return ${returnId} to accounting`);
      } catch (err) {
        handleError(err, `post return ${returnId} to accounting`);
      } finally {
        setLoading(false);
      }
    },
    [handleError, handleSuccess]
  );

  const postReturnToBothSystems = useCallback(
    async (returnId: number, postingData: IntegrationPostingData) => {
      try {
        setLoading(true);
        setError(null);

        const result = await procurementIntegrationService.postReturnToBothSystems(
          returnId,
          postingData
        );
        handleSuccess(result, `post return ${returnId} to both systems`);
      } catch (err) {
        handleError(err, `post return ${returnId} to both systems`);
      } finally {
        setLoading(false);
      }
    },
    [handleError, handleSuccess]
  );

  const getReturnIntegrationStatus = useCallback(
    async (returnId: number): Promise<ReturnIntegrationStatus | null> => {
      try {
        setLoading(true);
        setError(null);

        const status = await procurementIntegrationService.getReturnIntegrationStatus(returnId);
        return status;
      } catch (err) {
        handleError(err, `get return ${returnId} integration status`);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [handleError]
  );

  // ============================================================================
  // BATCH PROCESSING METHODS
  // ============================================================================

  const batchProcessGRNs = useCallback(
    async (grnIds: number[], postingData: IntegrationPostingData) => {
      try {
        setLoading(true);
        setError(null);

        const result = await procurementIntegrationService.batchProcessGRNs(grnIds, postingData);
        handleSuccess(result, `batch process ${grnIds.length} GRNs`);
      } catch (err) {
        handleError(err, `batch process ${grnIds.length} GRNs`);
      } finally {
        setLoading(false);
      }
    },
    [handleError, handleSuccess]
  );

  const batchProcessReturns = useCallback(
    async (returnIds: number[], postingData: IntegrationPostingData) => {
      try {
        setLoading(true);
        setError(null);

        const result = await procurementIntegrationService.batchProcessReturns(
          returnIds,
          postingData
        );
        handleSuccess(result, `batch process ${returnIds.length} returns`);
      } catch (err) {
        handleError(err, `batch process ${returnIds.length} returns`);
      } finally {
        setLoading(false);
      }
    },
    [handleError, handleSuccess]
  );

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  const getPendingIntegrations = useCallback(
    async (params?: {
      type?: 'grn' | 'return';
      system?: 'inventory' | 'accounting' | 'both';
    }): Promise<PendingIntegration[]> => {
      try {
        setLoading(true);
        setError(null);

        const response = await procurementIntegrationService.getPendingIntegrations(params);
        return response.results || [];
      } catch (err) {
        handleError(err, 'get pending integrations');
        return [];
      } finally {
        setLoading(false);
      }
    },
    [handleError]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    loading,
    error,

    // GRN Integration Methods
    postGRNToInventory,
    postGRNToAccounting,
    postGRNToBothSystems,
    getGRNIntegrationStatus,

    // Return Integration Methods
    postReturnToInventory,
    postReturnToAccounting,
    postReturnToBothSystems,
    getReturnIntegrationStatus,

    // Batch Processing Methods
    batchProcessGRNs,
    batchProcessReturns,

    // Utility Methods
    getPendingIntegrations,
    clearError,
  };
};

export default useProcurementIntegration;
