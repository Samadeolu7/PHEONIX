import React, { useState } from 'react';
import { Plus, Search, ArrowUpDown, MapPin, Edit, Trash2, X, Save } from 'lucide-react';
import {
  useInventoryLocations,
  useCreateInventoryLocation,
  useUpdateInventoryLocation,
  useDeleteInventoryLocation,
} from '../../hooks/useInventory';
import { useToast } from '../../hooks/useToast';
import type { Location, CreateLocation } from '../../services/inventoryService';

interface LocationFormData {
  name: string;
  address: string;
}

export default function StockLocationsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [ordering, setOrdering] = useState('');
  const [page, setPage] = useState(1);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [formData, setFormData] = useState<LocationFormData>({
    name: '',
    address: '',
  });

  const toast = useToast();

  const {
    data: locationsData,
    isLoading,
    error,
  } = useInventoryLocations({
    search: searchTerm,
    ordering: ordering,
    page,
  });

  const createLocationMutation = useCreateInventoryLocation();
  const updateLocationMutation = useUpdateInventoryLocation();
  const deleteLocationMutation = useDeleteInventoryLocation();

  const locations = locationsData?.results || [];
  const totalPages = Math.ceil((locationsData?.count || 0) / 20);

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createLocationMutation.mutateAsync(formData);
      toast.success(`Location "${formData.name}" created successfully!`);
      setShowCreateForm(false);
      setFormData({ name: '', address: '' });
    } catch (error) {
      console.error('Error creating location:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create location';
      toast.error(`Failed to create location: ${errorMessage}`);
    }
  };

  const handleUpdateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLocation) return;

    try {
      await updateLocationMutation.mutateAsync({
        id: editingLocation.id,
        data: formData,
      });
      toast.success(`Location "${formData.name}" updated successfully!`);
      setEditingLocation(null);
      setFormData({ name: '', address: '' });
    } catch (error) {
      console.error('Error updating location:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update location';
      toast.error(`Failed to update location: ${errorMessage}`);
    }
  };

  const handleDeleteLocation = async (id: number) => {
    // Find the location name for the toast message
    const location = locations.find(loc => loc.id === id);
    const locationName = location?.name || `Location #${id}`;

    if (window.confirm('Are you sure you want to delete this location?')) {
      try {
        await deleteLocationMutation.mutateAsync(id);
        toast.success(`Location "${locationName}" deleted successfully!`);
      } catch (error) {
        console.error('Error deleting location:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete location';
        toast.error(`Failed to delete location: ${errorMessage}`);
      }
    }
  };

  const startEdit = (location: Location) => {
    setEditingLocation(location);
    setFormData({
      name: location.name,
      address: location.address,
    });
    setShowCreateForm(false);
  };

  const cancelEdit = () => {
    setEditingLocation(null);
    setFormData({ name: '', address: '' });
  };

  const startCreate = () => {
    setShowCreateForm(true);
    setEditingLocation(null);
    setFormData({ name: '', address: '' });
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Error loading locations: {error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Locations</h1>
          <p className="text-gray-600">Manage warehouse and storage locations</p>
        </div>
        <button
          onClick={startCreate}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Location
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                placeholder="Search locations..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <div className="relative">
              <ArrowUpDown className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <select
                value={ordering}
                onChange={e => setOrdering(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Default Order</option>
                <option value="-created_at">Newest First</option>
                <option value="created_at">Oldest First</option>
                <option value="name">Name A-Z</option>
                <option value="-name">Name Z-A</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Create/Edit Form */}
      {(showCreateForm || editingLocation) && (
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {editingLocation ? 'Edit Location' : 'Create New Location'}
            </h2>
            <button
              onClick={() => {
                setShowCreateForm(false);
                cancelEdit();
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={editingLocation ? handleUpdateLocation : handleCreateLocation}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter location name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Address *</label>
                <input
                  type="text"
                  required
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter location address"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  cancelEdit();
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createLocationMutation.isPending || updateLocationMutation.isPending}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {editingLocation ? 'Update' : 'Create'} Location
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Locations Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading locations...</p>
          </div>
        ) : locations.length === 0 ? (
          <div className="p-8 text-center">
            <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No locations found</p>
            {!showCreateForm && (
              <button
                onClick={startCreate}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                Create your first location
              </button>
            )}
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {locations.map(location => (
                  <tr key={location.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <MapPin className="w-4 h-4 text-gray-400 mr-3" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">{location.name}</div>
                          <div className="text-sm text-gray-500">ID: {location.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{location.address}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(location.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEdit(location)}
                          className="text-blue-600 hover:text-blue-900 flex items-center gap-1"
                        >
                          <Edit className="w-4 h-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteLocation(location.id)}
                          disabled={deleteLocationMutation.isPending}
                          className="text-red-600 hover:text-red-900 flex items-center gap-1 disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-3 border-t border-gray-200 flex justify-between items-center">
                <div className="text-sm text-gray-700">
                  Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, locationsData?.count || 0)}{' '}
                  of {locationsData?.count || 0} locations
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
