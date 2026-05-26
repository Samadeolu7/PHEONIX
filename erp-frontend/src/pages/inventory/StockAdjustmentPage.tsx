import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Search, Plus, Minus, Package } from 'lucide-react';
import {
  useInventoryItems,
  useInventoryLocationsList,
  useCreateStockAdjustment,
} from '../../hooks/useInventory';
import { useToast } from '../../hooks/useToast';

export default function StockAdjustmentPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [quantityChange, setQuantityChange] = useState(0);
  const [reason, setReason] = useState('Count Adjustment');
  const [notes, setNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: items } = useInventoryItems({ search: searchTerm });
  const { data: locations } = useInventoryLocationsList();
  const createAdjustmentMutation = useCreateStockAdjustment();

  const reasonOptions = [
    'Count Adjustment',
    'Damage',
    'Theft',
    'Expired',
    'Lost',
    'Found',
    'Quality Issue',
    'Other',
  ];

  const handleItemSelect = (item: any) => {
    setSelectedItem(item);
    setSearchTerm('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedItem) {
      toast.error('Please select an item to adjust');
      return;
    }

    if (!selectedLocation) {
      toast.error('Please select a location');
      return;
    }

    if (quantityChange === 0) {
      toast.error('Please enter a quantity change');
      return;
    }

    if (!reason.trim()) {
      toast.error('Please provide a reason for the adjustment');
      return;
    }

    try {
      const adjustmentData = {
        requested_by: 1, // TODO: Get from auth context
        item: selectedItem.id,
        location: parseInt(selectedLocation),
        adjustment_type: quantityChange > 0 ? 'increase' : 'decrease',
        quantity: Math.abs(quantityChange).toString(),
        reason: reason,
        notes: notes || '',
        status: 'pending',
      };

      await createAdjustmentMutation.mutateAsync(adjustmentData);
      toast.success('Stock adjustment created successfully!');
      navigate('/inventory/adjustments');
    } catch (error) {
      console.error('Error creating adjustment:', error);
      toast.error('Failed to create stock adjustment');
    }
  };

  const currentStock = selectedItem?.current_stock || 0;
  const newStock = currentStock + quantityChange;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/inventory/adjustments')}
          className="p-2 hover:bg-gray-100 rounded-md"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Stock Adjustment</h1>
          <p className="text-gray-600">Adjust inventory quantity for a single item</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Item Selection */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Select Item</h3>

          {!selectedItem ? (
            <>
              <div className="relative mb-4">
                <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search for an item to adjust..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {searchTerm && items?.results && items.results.length > 0 && (
                <div className="border border-gray-200 rounded-md max-h-64 overflow-y-auto">
                  {items.results.map(item => (
                    <div
                      key={item.id}
                      className="p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      onClick={() => handleItemSelect(item)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium text-gray-900">{item.name}</div>
                          <div className="text-sm text-gray-500">SKU: {item.sku}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">
                            {item.current_stock} {item.unit_of_measure}
                          </div>
                          <div className="text-xs text-gray-500">Current Stock</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searchTerm && items?.results && items.results.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>No items found matching "{searchTerm}"</p>
                </div>
              )}
            </>
          ) : (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-medium text-gray-900">{selectedItem.name}</div>
                  <div className="text-sm text-gray-500">SKU: {selectedItem.sku}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Current Stock:{' '}
                    <span className="font-medium">
                      {selectedItem.current_stock} {selectedItem.unit_of_measure}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  Change Item
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Adjustment Details */}
        {selectedItem && (
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Adjustment Details</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Location *</label>
                <select
                  value={selectedLocation}
                  onChange={e => setSelectedLocation(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select Location</option>
                  {locations?.map(location => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Reason *</label>
                <select
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  {reasonOptions.map(reasonOption => (
                    <option key={reasonOption} value={reasonOption}>
                      {reasonOption}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quantity Adjustment *
              </label>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setQuantityChange(quantityChange - 1)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-md border border-red-200"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  value={quantityChange}
                  onChange={e => setQuantityChange(parseInt(e.target.value) || 0)}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-md text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0"
                />
                <button
                  type="button"
                  onClick={() => setQuantityChange(quantityChange + 1)}
                  className="p-2 text-green-600 hover:bg-green-50 rounded-md border border-green-200"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <div className="text-sm text-gray-600">
                  {quantityChange > 0 ? (
                    <span className="text-green-600">+{quantityChange} (Increase)</span>
                  ) : quantityChange < 0 ? (
                    <span className="text-red-600">{quantityChange} (Decrease)</span>
                  ) : (
                    <span className="text-gray-500">No change</span>
                  )}
                </div>
              </div>
            </div>

            {/* Stock Preview */}
            {quantityChange !== 0 && (
              <div className="mt-4 p-4 bg-gray-50 rounded-md">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Current Stock:</span>
                  <span className="font-medium">
                    {currentStock} {selectedItem.unit_of_measure}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm mt-1">
                  <span className="text-gray-600">Adjustment:</span>
                  <span
                    className={`font-medium ${quantityChange > 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {quantityChange > 0 ? '+' : ''}
                    {quantityChange} {selectedItem.unit_of_measure}
                  </span>
                </div>
                <div className="border-t border-gray-200 mt-2 pt-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium text-gray-900">New Stock:</span>
                    <span
                      className={`font-bold ${newStock < 0 ? 'text-red-600' : 'text-gray-900'}`}
                    >
                      {newStock} {selectedItem.unit_of_measure}
                      {newStock < 0 && ' (Negative Stock!)'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Additional notes about this adjustment..."
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/inventory/adjustments')}
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createAdjustmentMutation.isPending || !selectedItem || quantityChange === 0}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {createAdjustmentMutation.isPending ? 'Creating...' : 'Create Adjustment'}
          </button>
        </div>
      </form>
    </div>
  );
}
