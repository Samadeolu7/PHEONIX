import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Search, ArrowRight } from 'lucide-react';
import {
  useInventoryItems,
  useInventoryLocationsList,
  useCreateStockTransfer,
} from '../../hooks/useInventory';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';

export default function StockTransferPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Debounce search term - only search after user stops typing for 500ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Only fetch items when we have a debounced search term (minimum 2 characters)
  const shouldFetchItems = debouncedSearchTerm.length >= 2;
  const { data: items } = useInventoryItems(
    shouldFetchItems ? { search: debouncedSearchTerm } : undefined
  );
  const { data: locations } = useInventoryLocationsList();
  const createTransferMutation = useCreateStockTransfer();
  const { user } = useAuth();

  // Handle item selection
  const handleItemSelect = (itemId: string) => {
    setSelectedItem(itemId);

    // Auto-set unit cost when item is selected
    const selectedItemData = items?.results?.find(item => item.id.toString() === itemId);
    if (selectedItemData?.cost_price) {
      setUnitCost(selectedItemData.cost_price);
    }
  };

  // Handle search on Enter key press
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setDebouncedSearchTerm(searchTerm);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedItem || !fromLocation || !toLocation || !quantity) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (fromLocation === toLocation) {
      toast.error('From and to locations cannot be the same');
      return;
    }

    const quantityNum = parseFloat(quantity);
    if (isNaN(quantityNum) || quantityNum <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    if (!user?.id) {
      toast.error('User not authenticated');
      return;
    }

    try {
      const payload = {
        requested_by: user.id,
        item: parseInt(selectedItem),
        from_location: parseInt(fromLocation),
        to_location: parseInt(toLocation),
        quantity: quantity,
        unit_cost: unitCost || null,
        reason: notes || 'Manual stock transfer',
        notes: notes || '',
        reference_number: referenceNumber || undefined,
      };

      await createTransferMutation.mutateAsync(payload);
      toast.success('Stock transfer created successfully!');
      navigate('/inventory/movements');
    } catch (error) {
      console.error('Error creating transfer:', error);
      toast.error('Failed to create stock transfer');
    }
  };

  const selectedItemData = items?.results?.find(item => item.id.toString() === selectedItem);
  const fromLocationData = locations?.find(loc => loc.id.toString() === fromLocation);
  const toLocationData = locations?.find(loc => loc.id.toString() === toLocation);

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/inventory/movements')}
          className="p-2 hover:bg-gray-100 rounded-md"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Transfer</h1>
          <p className="text-gray-600">Transfer inventory between locations</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Item Selection */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Select Item</h3>

          <div className="mb-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                placeholder="Search items... (type at least 2 characters or press Enter)"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {searchTerm && items?.results && items.results.length > 0 && (
            <div className="border border-gray-200 rounded-md max-h-48 overflow-y-auto mb-4">
              {items.results.map(item => (
                <div
                  key={item.id}
                  className={`p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                    selectedItem === item.id.toString() ? 'bg-blue-50 border-blue-200' : ''
                  }`}
                  onClick={() => handleItemSelect(item.id.toString())}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium text-gray-900">{item.name}</div>
                      <div className="text-sm text-gray-500">SKU: {item.sku}</div>
                      {item.cost_price && (
                        <div className="text-sm text-gray-500">Cost: ${item.cost_price}</div>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      Stock: {item.total_stock} {item.unit_of_measure}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedItemData && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-medium text-green-900">{selectedItemData.name}</div>
                  <div className="text-sm text-green-700">SKU: {selectedItemData.sku}</div>
                  {selectedItemData.cost_price && (
                    <div className="text-sm text-green-700">
                      Unit Cost: ${selectedItemData.cost_price}
                    </div>
                  )}
                </div>
                <div className="text-sm text-green-700">
                  Available: {selectedItemData.total_available} {selectedItemData.unit_of_measure}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Transfer Details */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Transfer Details</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                From Location *
              </label>
              <select
                value={fromLocation}
                onChange={e => setFromLocation(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Select From Location</option>
                {locations?.map(location => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-center">
              <ArrowRight className="w-6 h-6 text-gray-400 mt-6" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Location *</label>
              <select
                value={toLocation}
                onChange={e => setToLocation(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Select To Location</option>
                {locations
                  ?.filter(loc => loc.id.toString() !== fromLocation)
                  .map(location => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {fromLocationData && toLocationData && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-medium">From:</span> {fromLocationData.name}
                </div>
                <ArrowRight className="w-4 h-4 text-blue-600" />
                <div className="text-sm">
                  <span className="font-medium">To:</span> {toLocationData.name}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter quantity"
                required
              />
              {selectedItemData && (
                <div className="text-xs text-gray-500 mt-1">
                  Unit: {selectedItemData.unit_of_measure}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitCost}
                onChange={e => setUnitCost(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter unit cost"
              />
              {selectedItemData?.cost_price && (
                <div className="text-xs text-gray-500 mt-1">
                  Default cost: ${selectedItemData.cost_price}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reference Number
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={e => setReferenceNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter reference number (optional)"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter transfer notes"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/inventory/movements')}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createTransferMutation.isPending}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {createTransferMutation.isPending ? 'Processing...' : 'Create Transfer'}
          </button>
        </div>
      </form>
    </div>
  );
}
