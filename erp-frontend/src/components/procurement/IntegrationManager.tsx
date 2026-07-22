import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { procurementService } from '../../services/procurementService';
import {
  GRNIntegrationStatus,
  ReturnIntegrationStatus,
  PendingIntegration,
  BatchProcessingResult,
  CostCenter,
  BudgetCode,
} from '../../types/procurement';

interface IntegrationManagerProps {
  entityType: 'grn' | 'return';
  entityId?: number;
  onIntegrationComplete?: () => void;
}

export const IntegrationManager: React.FC<IntegrationManagerProps> = ({
  entityType,
  entityId,
  onIntegrationComplete,
}) => {
  const queryClient = useQueryClient();
  const [selectedItems, setSelectedItems] = useState<number[]>([]);

  const [postingData, setPostingData] = useState({
    posting_date: new Date().toISOString().split('T')[0],
    cost_center: '',
    budget_code: '',
    notes: '',
  });

  const { data: integrationStatus, isLoading: loadingStatus } = useQuery<
    GRNIntegrationStatus | ReturnIntegrationStatus | null
  >({
    queryKey: ['integration-status', entityType, entityId],
    queryFn: () => {
      if (!entityId) return Promise.resolve(null);
      return entityType === 'grn'
        ? procurementService.getGRNIntegrationStatus(entityId)
        : procurementService.getReturnIntegrationStatus(entityId);
    },
    enabled: !!entityId,
  });

  const { data: pendingData, isLoading: loadingPending } = useQuery<{
    results: PendingIntegration[];
  }>({
    queryKey: ['pending-integrations', entityType],
    queryFn: () => procurementService.getPendingIntegrations({ type: entityType } as any),
  });

  const pendingIntegrations = pendingData?.results || [];

  const { data: costCentersData } = useQuery<{ results: CostCenter[] }>({
    queryKey: ['cost-centers'],
    queryFn: () => procurementService.getCostCenters({ is_active: true } as any),
  });

  const { data: budgetCodesData } = useQuery<{ results: BudgetCode[] }>({
    queryKey: ['budget-codes'],
    queryFn: () => procurementService.getBudgetCodes({ is_active: true } as any),
  });

  const costCenters = costCentersData?.results || [];
  const budgetCodes = budgetCodesData?.results || [];

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['integration-status'] });
    queryClient.invalidateQueries({ queryKey: ['pending-integrations'] });
    onIntegrationComplete?.();
  };

  const postToInventoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      entityType === 'grn'
        ? procurementService.postGRNToInventoryWithDetails(id, data)
        : procurementService.postReturnToInventory(id, data),
    onSuccess: () => invalidateAll(),
  });

  const postToAccountingMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      entityType === 'grn'
        ? procurementService.postGRNToAccountingWithDetails(id, data)
        : procurementService.postReturnToAccounting(id, data),
    onSuccess: () => invalidateAll(),
  });

  const postToBothMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      entityType === 'grn'
        ? procurementService.postGRNToBothSystems(id, data)
        : procurementService.postReturnToBothSystems(id, data),
    onSuccess: () => invalidateAll(),
  });

  const batchMutation = useMutation({
    mutationFn: ({ ids, data }: { ids: number[]; data: any }) =>
      entityType === 'grn'
        ? procurementService.batchPostGRNsToAccounting(ids, data)
        : procurementService.batchPostReturnsToBothSystems(ids, data),
    onSuccess: () => {
      setSelectedItems([]);
      invalidateAll();
    },
  });

  const reverseInventoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      procurementService.reverseGRNInventoryPosting(id, data),
    onSuccess: () => invalidateAll(),
  });

  const reverseAccountingMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      procurementService.reverseGRNAccountingPosting(id, data),
    onSuccess: () => invalidateAll(),
  });

  const loading = loadingStatus || loadingPending || postToInventoryMutation.isPending || postToAccountingMutation.isPending || postToBothMutation.isPending || batchMutation.isPending;
  const error = postToInventoryMutation.error?.message || postToAccountingMutation.error?.message || postToBothMutation.error?.message || batchMutation.error?.message || reverseInventoryMutation.error?.message || reverseAccountingMutation.error?.message || null;

  const handlePostToInventory = (id: number) => {
    postToInventoryMutation.mutate({
      id,
      data: {
        posting_date: postingData.posting_date,
        cost_center: postingData.cost_center || undefined,
        notes: postingData.notes || undefined,
      },
    });
  };

  const handlePostToAccounting = (id: number) => {
    postToAccountingMutation.mutate({
      id,
      data: {
        posting_date: postingData.posting_date,
        cost_center: postingData.cost_center || undefined,
        budget_code: postingData.budget_code || undefined,
        notes: postingData.notes || undefined,
      },
    });
  };

  const handlePostToBothSystems = (id: number) => {
    postToBothMutation.mutate({
      id,
      data: {
        posting_date: postingData.posting_date,
        cost_center: postingData.cost_center || undefined,
        budget_code: postingData.budget_code || undefined,
        notes: postingData.notes || undefined,
      },
    });
  };

  const handleBatchProcessing = () => {
    if (selectedItems.length === 0) return;
    batchMutation.mutate({
      ids: selectedItems,
      data: {
        posting_date: postingData.posting_date,
        cost_center: postingData.cost_center || undefined,
        budget_code: postingData.budget_code || undefined,
        notes: postingData.notes || undefined,
      },
    });
  };

  const handleReversePosting = (id: number, system: 'inventory' | 'accounting') => {
    const reason = prompt('Please provide a reason for reversal:');
    if (!reason) return;

    const data = {
      reversal_date: new Date().toISOString().split('T')[0],
      reason,
      notes: postingData.notes || undefined,
    };

    if (system === 'inventory') {
      reverseInventoryMutation.mutate({ id, data });
    } else {
      reverseAccountingMutation.mutate({ id, data });
    }
  };

  if (loading && !integrationStatus && pendingIntegrations.length === 0) {
    return <div className="p-4">Loading integration data...</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800">{error}</div>
        </div>
      )}

      {/* Posting Configuration */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Integration Configuration</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Posting Date</label>
            <input
              type="date"
              value={postingData.posting_date}
              onChange={e => setPostingData(prev => ({ ...prev, posting_date: e.target.value }))}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Cost Center</label>
            <select
              value={postingData.cost_center}
              onChange={e => setPostingData(prev => ({ ...prev, cost_center: e.target.value }))}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select Cost Center</option>
              {costCenters.map(cc => (
                <option key={cc.id} value={cc.id}>
                  {cc.code} - {cc.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Budget Code</label>
            <select
              value={postingData.budget_code}
              onChange={e => setPostingData(prev => ({ ...prev, budget_code: e.target.value }))}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select Budget Code</option>
              {budgetCodes.map(bc => (
                <option key={bc.id} value={bc.id}>
                  {bc.code} - {bc.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Notes</label>
            <input
              type="text"
              value={postingData.notes}
              onChange={e => setPostingData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Optional notes"
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Individual Integration Status */}
      {integrationStatus && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Integration Status - {entityType === 'grn' ? 'GRN' : 'Return'} #{entityId}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Inventory Integration</h4>
              <div className="space-y-2">
                <div
                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    'inventory_posted' in integrationStatus && integrationStatus.inventory_posted
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {'inventory_posted' in integrationStatus && integrationStatus.inventory_posted
                    ? 'Posted'
                    : 'Pending'}
                </div>

                {!(
                  'inventory_posted' in integrationStatus && integrationStatus.inventory_posted
                ) && (
                  <div className="space-x-2">
                    <button
                      onClick={() => handlePostToInventory(entityId!)}
                      disabled={loading}
                      className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      Post to Inventory
                    </button>
                  </div>
                )}

                {'inventory_posted' in integrationStatus && integrationStatus.inventory_posted && (
                  <button
                    onClick={() => handleReversePosting(entityId!, 'inventory')}
                    disabled={loading}
                    className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    Reverse Inventory Posting
                  </button>
                )}
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-2">Accounting Integration</h4>
              <div className="space-y-2">
                <div
                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    'accounting_posted' in integrationStatus && integrationStatus.accounting_posted
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {'accounting_posted' in integrationStatus && integrationStatus.accounting_posted
                    ? 'Posted'
                    : 'Pending'}
                </div>

                {!(
                  'accounting_posted' in integrationStatus && integrationStatus.accounting_posted
                ) && (
                  <div className="space-x-2">
                    <button
                      onClick={() => handlePostToAccounting(entityId!)}
                      disabled={loading}
                      className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                    >
                      Post to Accounting
                    </button>
                  </div>
                )}

                {'accounting_posted' in integrationStatus &&
                  integrationStatus.accounting_posted && (
                    <button
                      onClick={() => handleReversePosting(entityId!, 'accounting')}
                      disabled={loading}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      Reverse Accounting Posting
                    </button>
                  )}
              </div>
            </div>
          </div>

          {/* Combined Posting Button */}
          {!('inventory_posted' in integrationStatus && integrationStatus.inventory_posted) &&
            !('accounting_posted' in integrationStatus && integrationStatus.accounting_posted) && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <button
                  onClick={() => handlePostToBothSystems(entityId!)}
                  disabled={loading}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
                >
                  Post to Both Systems
                </button>
              </div>
            )}
        </div>
      )}

      {/* Pending Integrations */}
      {pendingIntegrations.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Pending {entityType === 'grn' ? 'GRN' : 'Return'} Integrations
            </h3>

            {selectedItems.length > 0 && (
              <button
                onClick={handleBatchProcessing}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                Batch Process ({selectedItems.length})
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedItems(pendingIntegrations.map(p => p.entity_id));
                        } else {
                          setSelectedItems([]);
                        }
                      }}
                      checked={selectedItems.length === pendingIntegrations.length}
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pending Systems
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pendingIntegrations.map(pending => (
                  <tr key={pending.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(pending.entity_id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedItems(prev => [...prev, pending.entity_id]);
                          } else {
                            setSelectedItems(prev => prev.filter(id => id !== pending.entity_id));
                          }
                        }}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {pending.entity_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex space-x-1">
                        {pending.pending_systems.map(system => (
                          <span
                            key={system}
                            className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800"
                          >
                            {system}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          pending.priority === 'urgent'
                            ? 'bg-red-100 text-red-800'
                            : pending.priority === 'high'
                              ? 'bg-orange-100 text-orange-800'
                              : pending.priority === 'medium'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {pending.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(pending.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      {pending.pending_systems.includes('inventory') && (
                        <button
                          onClick={() => handlePostToInventory(pending.entity_id)}
                          disabled={loading}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Inventory
                        </button>
                      )}
                      {pending.pending_systems.includes('accounting') && (
                        <button
                          onClick={() => handlePostToAccounting(pending.entity_id)}
                          disabled={loading}
                          className="text-green-600 hover:text-green-900"
                        >
                          Accounting
                        </button>
                      )}
                      <button
                        onClick={() => handlePostToBothSystems(pending.entity_id)}
                        disabled={loading}
                        className="text-purple-600 hover:text-purple-900"
                      >
                        Both
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntegrationManager;
