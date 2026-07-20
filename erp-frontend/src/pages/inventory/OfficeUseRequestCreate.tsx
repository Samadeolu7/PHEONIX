import React, { useState } from 'react';
import { ArrowLeft, Plus, Trash2, Package, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../hooks/useToast';
import { useCreateOfficeUseRequest } from '../../hooks/useLedger';
import { useExpenseAccounts } from '../../hooks/useAccountsSimple';
import { useInventoryLocationsList, useInventoryItems } from '../../hooks/useInventory';
import { CreateOfficeUseRequest, CreateOfficeUseRequestItem } from '../../types/ledger';

interface ItemRow extends CreateOfficeUseRequestItem {
  _key: string;
  item_name?: string;
  item_sku?: string;
  unit_of_measure?: string;
}

const OfficeUseRequestCreate: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const createMutation = useCreateOfficeUseRequest();

  // Form state
  const [department, setDepartment] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [deliveryLocationId, setDeliveryLocationId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([
    { _key: crypto.randomUUID(), item: 0, quantity: '1', notes: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [itemSearch, setItemSearch] = useState('');

  // Lookup data via React Query
  const { data: expenseAccountsRaw } = useExpenseAccounts();
  const expenseAccounts = (
    Array.isArray(expenseAccountsRaw) ? expenseAccountsRaw : (expenseAccountsRaw?.results ?? [])
  ).map((a: any) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    account_type: a.account_type || a.type,
  }));
  const { data: locationsRaw } = useInventoryLocationsList();
  const locations = Array.isArray(locationsRaw)
    ? locationsRaw
    : ((locationsRaw as any)?.results ?? []);

  // Inventory items with debounced search
  const { data: itemsData, isLoading: loadingItems } = useInventoryItems({
    search: itemSearch || undefined,
  });
  const inventoryItems = (itemsData?.results ?? []).map((i: any) => ({
    id: i.id,
    name: i.name,
    sku: i.sku,
    unit_of_measure: i.unit_of_measure,
  }));

  // Item row helpers
  const addItem = () => {
    setItems(prev => [...prev, { _key: crypto.randomUUID(), item: 0, quantity: '1', notes: '' }]);
  };

  const removeItem = (key: string) => {
    setItems(prev => prev.filter(r => r._key !== key));
  };

  const updateItem = (key: string, field: keyof ItemRow, value: any) => {
    setItems(prev =>
      prev.map(row => {
        if (row._key !== key) return row;
        if (field === 'item') {
          const found = inventoryItems.find(i => i.id === parseInt(value));
          return {
            ...row,
            item: parseInt(value) || 0,
            item_name: found?.name,
            item_sku: found?.sku,
            unit_of_measure: found?.unit_of_measure,
          };
        }
        return { ...row, [field]: value };
      })
    );
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!expenseAccountId) {
      showError('Please select an expense account');
      return;
    }
    if (!deliveryLocationId) {
      showError('Please select a delivery location');
      return;
    }
    if (!purpose.trim()) {
      showError('Please enter a purpose for this request');
      return;
    }

    const validItems = items.filter(i => i.item > 0 && parseFloat(i.quantity) > 0);
    if (validItems.length === 0) {
      showError('Please add at least one item');
      return;
    }

    const payload: CreateOfficeUseRequest = {
      department: department.trim() || undefined,
      expense_account: parseInt(expenseAccountId),
      delivery_location: parseInt(deliveryLocationId),
      purpose: purpose.trim(),
      notes: notes.trim() || undefined,
      items: validItems.map(i => ({
        item: i.item,
        quantity: i.quantity,
        notes: i.notes || '',
      })),
    };

    try {
      setSubmitting(true);
      const created = await createMutation.mutateAsync(payload);
      success('Office use request created successfully');
      navigate(`/inventory/office-use-requests/${created.id}`);
    } catch (err: any) {
      const data = err?.response?.data;
      const msg =
        data?.expense_account?.[0] ||
        data?.items?.[0] ||
        data?.error ||
        data?.detail ||
        'Failed to create office use request';
      showError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/inventory/office-use-requests')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Office Use Requests
        </button>
        <h1 className="text-3xl font-bold text-gray-900">New Office Use Request</h1>
        <p className="text-gray-600 mt-1">
          Request inventory items for internal office use. On fulfilment, an expense journal entry
          (Dr Expense / Cr Inventory) will be posted automatically.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Request Details */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Request Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Requested by — read-only, comes from the session user */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Requested By</label>
              <p className="text-sm text-gray-500 italic">
                (Current logged-in user will be recorded automatically)
              </p>
            </div>

            {/* Department */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Department / Cost Centre
              </label>
              <input
                type="text"
                value={department}
                onChange={e => setDepartment(e.target.value)}
                placeholder="e.g. Administration, IT, Finance"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Expense Account */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expense Account <span className="text-red-500">*</span>
              </label>
              <select
                aria-label="Expense account"
                value={expenseAccountId}
                onChange={e => setExpenseAccountId(e.target.value)}
                required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select expense account...</option>
                {expenseAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.code} – {a.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                GL account that will be debited when this request is fulfilled
              </p>
            </div>

            {/* Delivery Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Issue From Location <span className="text-red-500">*</span>
              </label>
              <select
                aria-label="Delivery location"
                value={deliveryLocationId}
                onChange={e => setDeliveryLocationId(e.target.value)}
                required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select inventory location...</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Purpose */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Purpose <span className="text-red-500">*</span>
              </label>
              <textarea
                value={purpose}
                onChange={e => setPurpose(e.target.value)}
                rows={2}
                required
                placeholder="Describe why these items are needed..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional Notes
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Any additional information..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Items Requested</h2>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search items..."
                  value={itemSearch}
                  onChange={e => setItemSearch(e.target.value)}
                  className="pl-8 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {items.map(row => (
              <div key={row._key} className="flex gap-3 items-start p-3 bg-gray-50 rounded-lg">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                  {/* Item select */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Inventory Item <span className="text-red-500">*</span>
                    </label>
                    <select
                      aria-label="Inventory item"
                      value={row.item || ''}
                      onChange={e => updateItem(row._key, 'item', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">
                        {loadingItems ? 'Loading items...' : 'Select item...'}
                      </option>
                      {inventoryItems.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.sku} – {item.name}
                        </option>
                      ))}
                    </select>
                    {row.unit_of_measure && (
                      <span className="text-xs text-gray-500 mt-0.5 block">
                        Unit: {row.unit_of_measure}
                      </span>
                    )}
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      aria-label="Quantity"
                      min="0.01"
                      step="0.01"
                      value={row.quantity}
                      onChange={e => updateItem(row._key, 'quantity', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Line Notes
                    </label>
                    <input
                      type="text"
                      value={row.notes || ''}
                      onChange={e => updateItem(row._key, 'notes', e.target.value)}
                      placeholder="Optional"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  aria-label="Remove item"
                  onClick={() => removeItem(row._key)}
                  disabled={items.length === 1}
                  className="mt-5 p-2 text-red-400 hover:text-red-600 disabled:opacity-30"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addItem}
            className="mt-3 flex items-center text-sm text-blue-600 hover:text-blue-800"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Item
          </button>
        </div>

        {/* Accounting Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Package className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-900">Accounting Impact on Fulfilment</p>
              <p className="text-sm text-blue-700 mt-1">
                When this request is fulfilled after approval, the system will automatically:
              </p>
              <ul className="text-sm text-blue-700 mt-1 list-disc list-inside space-y-0.5">
                <li>Reduce inventory stock at the selected location</li>
                <li>
                  Post a journal entry: <strong>Dr</strong> selected expense account /{' '}
                  <strong>Cr</strong> inventory asset account(s)
                </li>
                <li>Record the requester&apos;s name in the journal for full traceability</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/inventory/office-use-requests')}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {submitting ? 'Creating...' : 'Create Request'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default OfficeUseRequestCreate;
