import React, { useState } from 'react';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  MapPin,
  Building,
  Warehouse,
  Truck,
  Package,
  AlertCircle,
  Save,
  X,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import {
  useInventoryLocations,
  useCreateInventoryLocation,
  useUpdateInventoryLocation,
  useDeleteInventoryLocation,
} from '../../hooks/useInventory';
import { useToast } from '../../hooks/useToast';
import { Location } from '../../services/inventoryService';

interface LocationFormData {
  name: string;
  code: string;
  location_type: 'warehouse' | 'store' | 'vehicle' | 'other';
  address: string;
  is_active: boolean;
}

const LocationsPage: React.FC = () => {
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch locations
  const {
    data: locationsData,
    isLoading,
    error,
  } = useInventoryLocations({
    search: searchQuery || undefined,
    page: currentPage,
    ordering: 'name',
  });

  // Mutations
  const createLocationMutation = useCreateInventoryLocation();
  const updateLocationMutation = useUpdateInventoryLocation();
  const deleteLocationMutation = useDeleteInventoryLocation();

  const locations = locationsData?.results || [];
  const totalLocations = locationsData?.count || 0;
  const totalPages = Math.ceil(totalLocations / 20);

  const [formData, setFormData] = useState<LocationFormData>({
    name: '',
    code: '',
    location_type: 'warehouse',
    address: '',
    is_active: true,
  });

  const [errors, setErrors] = useState<Partial<LocationFormData>>({});

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      location_type: 'warehouse',
      address: '',
      is_active: true,
    });
    setErrors({});
    setEditingLocation(null);
    setShowForm(false);
  };

  const handleEdit = (location: Location) => {
    setFormData({
      name: location.name,
      code: location.code || '',
      location_type: location.location_type || 'warehouse',
      address: location.address || '',
      is_active: location.is_active ?? true,
    });
    setEditingLocation(location);
    setShowForm(true);
  };

  const handleDelete = async (id: number, name: string) => {
    if (
      !confirm(`Are you sure you want to delete location "${name}"? This action cannot be undone.`)
    ) {
      return;
    }

    try {
      await deleteLocationMutation.mutateAsync(id);
      toast.success('Location deleted successfully');
    } catch (err: unknown) {
      console.error('Failed to delete location:', err);
      toast.error('Failed to delete location');
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<LocationFormData> = {};

    if (!formData.name.trim()) newErrors.name = 'Name is required';

    // Validate lengths
    if (formData.name.length > 200) newErrors.name = 'Name must be 200 characters or less';
    if (formData.code.length > 20) newErrors.code = 'Code must be 20 characters or less';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the errors before submitting');
      return;
    }

    try {
      const submitData = {
        ...formData,
        code: formData.code || null, // Convert empty string to null
      };

      if (editingLocation) {
        await updateLocationMutation.mutateAsync({
          id: editingLocation.id,
          data: submitData,
        });
        toast.success('Location updated successfully');
      } else {
        await createLocationMutation.mutateAsync(submitData);
        toast.success('Location created successfully');
      }

      resetForm();
    } catch (err: unknown) {
      console.error('Failed to save location:', err);
      toast.error(`Failed to ${editingLocation ? 'update' : 'create'} location`);
    }
  };

  const getLocationTypeIcon = (type: string) => {
    switch (type) {
      case 'warehouse':
        return Warehouse;
      case 'store':
        return Building;
      case 'vehicle':
        return Truck;
      default:
        return MapPin;
    }
  };

  const getLocationTypeLabel = (type: string) => {
    switch (type) {
      case 'warehouse':
        return 'Warehouse';
      case 'store':
        return 'Store';
      case 'vehicle':
        return 'Vehicle';
      case 'other':
        return 'Other';
      default:
        return type;
    }
  };

  const getLocationTypeColor = (type: string) => {
    switch (type) {
      case 'warehouse':
        return 'bg-blue-100 text-blue-800';
      case 'store':
        return 'bg-green-100 text-green-800';
      case 'vehicle':
        return 'bg-purple-100 text-purple-800';
      case 'other':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const isLoading_form = createLocationMutation.isPending || updateLocationMutation.isPending;

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600 mb-2">Failed to load locations</p>
          <button
            onClick={() => window.location.reload()}
            className="text-blue-600 hover:text-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Locations</h1>
          <p className="text-gray-600">Manage your storage locations and warehouses</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Location
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search locations..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingLocation ? 'Edit Location' : 'Add New Location'}
                </h2>
                <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.name ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="Enter location name"
                      maxLength={200}
                    />
                    {errors.name && (
                      <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {errors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Code</label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={e => setFormData(prev => ({ ...prev, code: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.code ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="Enter location code (optional)"
                      maxLength={20}
                    />
                    {errors.code && (
                      <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {errors.code}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      Optional location code. Must be unique if provided.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Location Type
                  </label>
                  <select
                    value={formData.location_type}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, location_type: e.target.value as any }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="warehouse">Warehouse</option>
                    <option value="store">Store</option>
                    <option value="vehicle">Vehicle</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                  <textarea
                    value={formData.address}
                    onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter location address"
                  />
                </div>

                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={e =>
                        setFormData(prev => ({ ...prev, is_active: e.target.checked }))
                      }
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Active</span>
                  </label>
                </div>

                <div className="flex justify-end gap-4 pt-6 border-t">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                    disabled={isLoading_form}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading_form}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isLoading_form ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {isLoading_form
                      ? 'Saving...'
                      : editingLocation
                        ? 'Update Location'
                        : 'Create Location'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Locations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="bg-white rounded-lg shadow p-6 animate-pulse">
              <div className="flex items-center justify-between mb-4">
                <div className="h-6 bg-gray-200 rounded w-24"></div>
                <div className="h-8 w-8 bg-gray-200 rounded"></div>
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-16"></div>
                <div className="h-4 bg-gray-200 rounded w-full"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            </div>
          ))
        ) : locations.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <MapPin className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No locations found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery
                ? 'Try adjusting your search criteria'
                : 'Get started by creating a new location'}
            </p>
            {!searchQuery && (
              <div className="mt-6">
                <button
                  onClick={() => setShowForm(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
                >
                  <Plus className="w-4 h-4" />
                  Add First Location
                </button>
              </div>
            )}
          </div>
        ) : (
          locations.map(location => {
            const LocationIcon = getLocationTypeIcon(location.location_type || 'other');
            return (
              <div
                key={location.id}
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <LocationIcon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{location.name}</h3>
                      {location.code && (
                        <p className="text-sm text-gray-500">Code: {location.code}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {location.is_active ? (
                      <CheckCircle className="w-5 h-5 text-green-500" title="Active" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" title="Inactive" />
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(location)}
                        className="text-blue-600 hover:text-blue-700"
                        title="Edit Location"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(location.id, location.name)}
                        className="text-red-600 hover:text-red-700"
                        title="Delete Location"
                        disabled={deleteLocationMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getLocationTypeColor(location.location_type || 'other')}`}
                    >
                      {getLocationTypeLabel(location.location_type || 'other')}
                    </span>
                  </div>

                  {location.address && (
                    <div>
                      <p className="text-sm text-gray-600">{location.address}</p>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-sm text-gray-500">
                    <span>Created:</span>
                    <span>{new Date(location.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const page = i + 1;
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                    currentPage === page
                      ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                      : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </nav>
        </div>
      )}
    </div>
  );
};

export default LocationsPage;
