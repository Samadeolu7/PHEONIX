import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Package,
  Search,
  CheckCircle,
  Tag,
  AlertCircle,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../../hooks/useToast';
import { useCreateMaterialRequest } from '../../hooks/useLedger';
import { useAllInventoryLocations } from '../../hooks/useProcurement';
import {
  CreateMaterialRequest,
  CreateMaterialRequestItem,
  EligibleInventoryItem,
} from '../../types/ledger';
import { clientService } from '../../services/clientService';
import { invoiceService } from '../../services/invoiceService';
import { materialRequestService } from '../../services/ledgerService';

interface ItemRow extends CreateMaterialRequestItem {
  _key: string;
  item_name?: string;
  item_sku?: string;
  item_category_name?: string;
  /** Broad type label, e.g. 'Book', 'Uniform' — from category.item_type */
  item_category_item_type?: string;
  eligibility_type?: EligibleInventoryItem['eligibility_type'];
  authorized_by?: string | null;
}

const MaterialRequestCreate: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { success, error: showError } = useToast();
  const createMutation = useCreateMaterialRequest();

  // Pre-fill from query params (e.g., ?invoice=5&client=3)
  const prefillInvoice = searchParams.get('invoice');
  const prefillClient = searchParams.get('client');

  // Form state
  const [clientId, setClientId] = useState<string>(prefillClient || '');
  const [serviceInvoiceId, setServiceInvoiceId] = useState<string>(prefillInvoice || '');
  const [deliveryLocationId, setDeliveryLocationId] = useState<string>('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([
    { _key: crypto.randomUUID(), item: 0, quantity: '1', notes: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);

  // Lookup data
  const [clients, setClients] = useState<{ id: number; full_name: string }[]>([]);
  const [clientInvoices, setClientInvoices] = useState<{ id: number; invoice_number: string }[]>(
    []
  );

  // Eligible items (loaded when invoice changes)
  const [eligibleItems, setEligibleItems] = useState<EligibleInventoryItem[]>([]);
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [itemSearch, setItemSearch] = useState('');

  // ── Load clients & locations ──────────────────────────────────────────────
  useEffect(() => {
    clientService
      .getClients({ status: 'active' })
      .then((res: any) => setClients(res.results || res))
      .catch(() => {});
  }, []);

  const { data: locationsData } = useAllInventoryLocations({ is_active: true });
  const locations = locationsData?.results ?? [];

  // ── Load invoices when client changes ────────────────────────────────────
  useEffect(() => {
    if (!clientId) {
      setClientInvoices([]);
      setServiceInvoiceId('');
      return;
    }
    invoiceService
      .getInvoices({ client_id: parseInt(clientId), status: 'paid' })
      .then((res: any) => setClientInvoices(res.results || res))
      .catch(() => {});
  }, [clientId]);

  // ── Load eligible items when invoice changes ─────────────────────────────
  const loadEligibleItems = useCallback(
    async (invoiceId: string) => {
      if (!invoiceId) {
        setEligibleItems([]);
        return;
      }
      setLoadingEligible(true);
      try {
        const data = await materialRequestService.getEligibleItems(
          parseInt(invoiceId),
          itemSearch || undefined
        );
        setEligibleItems(data.eligible_items);
        // Clear item rows that are no longer eligible
        setItems(prev =>
          prev.map(row => {
            if (!row.item) return row;
            const still = data.eligible_items.find(e => e.id === row.item);
            if (!still)
              return {
                ...row,
                item: 0,
                item_name: undefined,
                item_sku: undefined,
                eligibility_type: undefined,
                authorized_by: undefined,
              };
            return row;
          })
        );
      } catch {
        setEligibleItems([]);
      } finally {
        setLoadingEligible(false);
      }
    },
    [itemSearch]
  );

  useEffect(() => {
    loadEligibleItems(serviceInvoiceId);
  }, [serviceInvoiceId, itemSearch, loadEligibleItems]);

  // ── Item row helpers ──────────────────────────────────────────────────────
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
          const found = eligibleItems.find(i => i.id === parseInt(value));
          return {
            ...row,
            item: parseInt(value) || 0,
            item_name: found?.name,
            item_sku: found?.sku,
            item_category_name: found?.category_name,
            item_category_item_type: found?.category_item_type,
            eligibility_type: found?.eligibility_type,
            authorized_by: found?.authorized_by,
          };
        }
        return { ...row, [field]: value };
      })
    );
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!clientId) {
      showError('Please select a client');
      return;
    }
    if (!serviceInvoiceId) {
      showError('Please select a service invoice');
      return;
    }
    if (!deliveryLocationId) {
      showError('Please select a delivery location');
      return;
    }
    if (!purpose.trim()) {
      showError('Please enter a purpose');
      return;
    }

    const validItems = items.filter(i => i.item > 0 && parseFloat(i.quantity) > 0);
    if (validItems.length === 0) {
      showError('Please add at least one inventory item');
      return;
    }

    const payload: CreateMaterialRequest = {
      client: parseInt(clientId),
      service_invoice: parseInt(serviceInvoiceId),
      delivery_location: parseInt(deliveryLocationId),
      purpose: purpose.trim(),
      notes: notes.trim(),
      items: validItems.map(i => ({
        item: i.item,
        quantity: i.quantity,
        notes: i.notes || '',
      })),
    };

    try {
      setSubmitting(true);
      const created = await createMutation.mutateAsync(payload);
      success('Material request created successfully');
      navigate(`/inventory/material-requests/${created.id}`);
    } catch (err: any) {
      const data = err?.response?.data;
      const msg =
        data?.items?.[0] ||
        data?.service_invoice?.[0] ||
        data?.error ||
        data?.detail ||
        'Failed to create material request';
      showError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Eligibility badge ─────────────────────────────────────────────────────
  const EligibilityBadge: React.FC<{ row: ItemRow }> = ({ row }) => {
    if (!row.item) return null;
    if (row.eligibility_type === 'exact_match') {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
          <CheckCircle className="w-3 h-3" /> Direct match
        </span>
      );
    }
    if (row.eligibility_type === 'category_match') {
      const label = row.item_category_item_type || row.item_category_name || 'Category';
      const tooltip = `Authorized by: ${row.authorized_by}${
        row.item_category_item_type ? ` · Type: ${row.item_category_item_type}` : ''
      }`;
      return (
        <span
          className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5"
          title={tooltip}
        >
          <Tag className="w-3 h-3" /> {label}
        </span>
      );
    }
    return null;
  };

  const hasInvoice = !!serviceInvoiceId;
  const filteredEligible = itemSearch
    ? eligibleItems.filter(
        i =>
          i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
          i.sku.toLowerCase().includes(itemSearch.toLowerCase())
      )
    : eligibleItems;

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/inventory/material-requests')}
          className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Material Request</h1>
          <p className="text-sm text-gray-500">Request inventory items against a client invoice</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Request Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Client */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client <span className="text-red-500">*</span>
              </label>
              <select
                value={clientId}
                onChange={e => {
                  setClientId(e.target.value);
                  setServiceInvoiceId('');
                  setEligibleItems([]);
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Select client…</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Service Invoice (required) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Service Invoice <span className="text-red-500">*</span>
              </label>
              <select
                value={serviceInvoiceId}
                onChange={e => setServiceInvoiceId(e.target.value)}
                disabled={!clientId}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
                required
              >
                <option value="">Select invoice…</option>
                {clientInvoices.map(inv => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_number}
                  </option>
                ))}
              </select>
              {!clientId && <p className="text-xs text-gray-400 mt-1">Select a client first</p>}
              {clientId && clientInvoices.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  No paid invoices found for this client
                </p>
              )}
            </div>

            {/* Delivery Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Delivery Location <span className="text-red-500">*</span>
              </label>
              <select
                value={deliveryLocationId}
                onChange={e => setDeliveryLocationId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Select location…</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Purpose */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Purpose <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={purpose}
                onChange={e => setPurpose(e.target.value)}
                placeholder="e.g. Classroom supplies for Term 1"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Any additional notes…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Items Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Requested Items</h2>
              {hasInvoice && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Only items authorized by the selected invoice are shown.{' '}
                  <span className="inline-flex items-center gap-1 text-green-600">
                    <CheckCircle className="w-3 h-3" /> Direct match
                  </span>{' '}
                  or{' '}
                  <span className="inline-flex items-center gap-1 text-blue-600">
                    <Tag className="w-3 h-3" /> Category authorized
                  </span>
                </p>
              )}
            </div>
            {/* Item search filter */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-2.5 text-gray-400" />
              <input
                type="text"
                value={itemSearch}
                onChange={e => setItemSearch(e.target.value)}
                placeholder="Filter items…"
                disabled={!hasInvoice}
                className="pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent w-44 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          </div>

          {/* No invoice selected notice */}
          {!hasInvoice && (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Select a service invoice above to see the items you can request.
            </div>
          )}

          {/* Loading */}
          {hasInvoice && loadingEligible && (
            <div className="text-sm text-gray-500 py-4 text-center">Loading eligible items…</div>
          )}

          {/* No eligible items */}
          {hasInvoice && !loadingEligible && filteredEligible.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-gray-400" />
              No eligible items found for this invoice.
              {itemSearch && ' Try clearing the search filter.'}
            </div>
          )}

          {hasInvoice && !loadingEligible && filteredEligible.length > 0 && (
            <>
              <div className="space-y-3">
                {/* Column headers */}
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase px-1">
                  <div className="col-span-5">Item</div>
                  <div className="col-span-2">Qty</div>
                  <div className="col-span-4">Notes</div>
                  <div className="col-span-1"></div>
                </div>

                {items.map(row => (
                  <div key={row._key}>
                    <div className="grid grid-cols-12 gap-2 items-start">
                      {/* Item selector */}
                      <div className="col-span-5">
                        <select
                          value={row.item || ''}
                          onChange={e => updateItem(row._key, 'item', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Select item…</option>
                          {filteredEligible.map(i => (
                            <option key={i.id} value={i.id}>
                              {i.name} ({i.sku})
                            </option>
                          ))}
                        </select>
                        {/* Eligibility badge under the selector */}
                        <div className="mt-1">
                          <EligibilityBadge row={row} />
                        </div>
                      </div>

                      {/* Quantity */}
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={row.quantity}
                          onChange={e => updateItem(row._key, 'quantity', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      {/* Notes */}
                      <div className="col-span-4">
                        <input
                          type="text"
                          value={row.notes || ''}
                          onChange={e => updateItem(row._key, 'notes', e.target.value)}
                          placeholder="Optional note"
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      {/* Remove */}
                      <div className="col-span-1 flex justify-center pt-1">
                        <button
                          type="button"
                          onClick={() => removeItem(row._key)}
                          disabled={items.length === 1}
                          className="p-1 text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addItem}
                className="mt-4 inline-flex items-center text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add another item
              </button>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/inventory/material-requests')}
            className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !hasInvoice}
            className="inline-flex items-center px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Package className="w-4 h-4 mr-2" />
            {submitting ? 'Creating…' : 'Create Material Request'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default MaterialRequestCreate;
