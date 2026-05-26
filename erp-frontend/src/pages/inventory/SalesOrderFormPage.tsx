// src/pages/inventory/SalesOrderFormPage.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingCart, ArrowLeft, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { inventoryService, CreateSalesOrderData } from '../../services/inventoryService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItem {
  tempId: number;
  item: number;
  item_name: string;
  quantity: number;
  unit_price: string;
  location?: number;
  notes?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const SalesOrderFormPage: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [clientName, setClientName] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [nextTempId, setNextTempId] = useState(1);

  // Load inventory items for the line-item picker
  const { data: itemsData } = useQuery({
    queryKey: ['inventory-items-picker'],
    queryFn: () => inventoryService.getAllItems(),
    staleTime: 5 * 60 * 1000,
  });
  const availableItems = itemsData ?? [];

  const createMutation = useMutation({
    mutationFn: (data: CreateSalesOrderData) => inventoryService.createSalesOrder(data),
  });

  // ─── Line helpers ────────────────────────────────────────────────────────────

  const addLine = () => {
    const newLine: LineItem = {
      tempId: nextTempId,
      item: 0,
      item_name: '',
      quantity: 1,
      unit_price: '0.00',
    };
    setLines(prev => prev.concat([newLine]));
    setNextTempId(n => n + 1);
  };

  const removeLine = (tempId: number) => {
    setLines(prev => prev.filter(l => l.tempId !== tempId));
  };

  const updateLine = (tempId: number, patch: Partial<LineItem>) => {
    setLines(prev => prev.map(l => (l.tempId === tempId ? { ...l, ...patch } : l)));
  };

  const handleItemSelect = (tempId: number, itemId: number) => {
    const found = availableItems.find(i => i.id === itemId);
    updateLine(tempId, {
      item: itemId,
      item_name: found?.name ?? '',
    });
  };

  // ─── Validation & submit ─────────────────────────────────────────────────────

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!clientName.trim()) errs.clientName = 'Client name is required';
    if (!orderDate) errs.orderDate = 'Order date is required';
    if (lines.length === 0) errs.lines = 'At least one line item is required';
    lines.forEach((l, i) => {
      if (!l.item) errs[`line_${i}_item`] = 'Select an item';
      if (l.quantity <= 0) errs[`line_${i}_qty`] = 'Quantity must be > 0';
      if (parseFloat(l.unit_price) < 0) errs[`line_${i}_price`] = 'Price must be ≥ 0';
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    const payload: CreateSalesOrderData = {
      client_name: clientName.trim(),
      order_date: orderDate,
      expected_delivery_date: deliveryDate || undefined,
      notes: notes.trim() || undefined,
      items: lines.map(l => ({
        item: l.item,
        quantity: l.quantity,
        unit_price: l.unit_price,
        location: l.location,
        notes: l.notes,
      })),
    };
    try {
      const order = await createMutation.mutateAsync(payload);
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      navigate(`/inventory/sales-orders/${order.id}`);
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { detail?: string } }; message?: string };
      setSubmitError(
        e2?.response?.data?.detail ??
          (err instanceof Error ? err.message : 'Failed to create sales order')
      );
    }
  };

  const orderTotal = lines
    .reduce((sum, l) => sum + l.quantity * parseFloat(l.unit_price || '0'), 0)
    .toFixed(2);

  return (
    <form onSubmit={handleSubmit} className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              title="Back to sales orders"
              onClick={() => navigate('/inventory/sales-orders')}
              className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <ShoppingCart className="text-blue-600" size={20} />
                New Sales Order
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">Create an inventory-level sales order</p>
            </div>
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {createMutation.isPending ? 'Creating…' : 'Create Order'}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Error banner */}
        {submitError && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} className="flex-shrink-0" />
            {submitError}
          </div>
        )}

        {/* Order Details */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Order Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Client */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="Enter client or company name"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.clientName ? 'border-red-300' : 'border-gray-200'
                }`}
              />
              {errors.clientName && (
                <p className="text-xs text-red-600 mt-1">{errors.clientName}</p>
              )}
            </div>

            {/* Order Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Order Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                title="Order date"
                value={orderDate}
                onChange={e => setOrderDate(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.orderDate ? 'border-red-300' : 'border-gray-200'
                }`}
              />
              {errors.orderDate && <p className="text-xs text-red-600 mt-1">{errors.orderDate}</p>}
            </div>

            {/* Delivery Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expected Delivery Date
              </label>
              <input
                type="date"
                title="Expected delivery date"
                value={deliveryDate}
                onChange={e => setDeliveryDate(e.target.value)}
                min={orderDate}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Special instructions, delivery notes…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Line Items
            </h2>
            <button
              type="button"
              onClick={addLine}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
            >
              <Plus size={14} /> Add Item
            </button>
          </div>

          {errors.lines && (
            <p className="px-5 py-2 text-xs text-red-600 bg-red-50">{errors.lines}</p>
          )}

          {lines.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <ShoppingCart size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No items added yet</p>
              <button
                type="button"
                onClick={addLine}
                className="mt-3 text-sm text-blue-600 hover:underline"
              >
                Add first item
              </button>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Item</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-600 w-24">Qty</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600 w-32">
                      Unit Price
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600 w-32">Total</th>
                    <th className="w-10 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lines.map((line, idx) => {
                    const lineTotal = (line.quantity * parseFloat(line.unit_price || '0')).toFixed(
                      2
                    );
                    return (
                      <tr key={line.tempId}>
                        <td className="px-4 py-2">
                          <select
                            title="Select item"
                            value={line.item}
                            onChange={e => handleItemSelect(line.tempId, Number(e.target.value))}
                            className={`w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                              errors[`line_${idx}_item`] ? 'border-red-300' : 'border-gray-200'
                            }`}
                          >
                            <option value={0}>Select item…</option>
                            {availableItems.map(item => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                          {errors[`line_${idx}_item`] && (
                            <p className="text-xs text-red-600 mt-0.5">
                              {errors[`line_${idx}_item`]}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            title="Quantity"
                            min={1}
                            step={1}
                            value={line.quantity}
                            onChange={e =>
                              updateLine(line.tempId, { quantity: Number(e.target.value) })
                            }
                            className={`w-full px-2 py-1.5 border rounded text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                              errors[`line_${idx}_qty`] ? 'border-red-300' : 'border-gray-200'
                            }`}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            title="Unit price"
                            min={0}
                            step={0.01}
                            value={line.unit_price}
                            onChange={e => updateLine(line.tempId, { unit_price: e.target.value })}
                            className={`w-full px-2 py-1.5 border rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                              errors[`line_${idx}_price`] ? 'border-red-300' : 'border-gray-200'
                            }`}
                          />
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900">
                          {parseFloat(lineTotal).toLocaleString('en-NG', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => removeLine(line.tempId)}
                            className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Remove line"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Order total */}
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
                <div className="text-sm font-semibold text-gray-900">
                  Order Total:{' '}
                  <span className="ml-2 text-base">
                    {parseFloat(orderTotal).toLocaleString('en-NG', {
                      style: 'currency',
                      currency: 'NGN',
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Bottom actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/inventory/sales-orders')}
            className="px-5 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {createMutation.isPending ? 'Creating…' : 'Create Order'}
          </button>
        </div>
      </div>
    </form>
  );
};

export default SalesOrderFormPage;
