/**
 * Asset Registration & Edit Form
 *
 * Handles both creating new fixed assets and editing existing ones.
 * Supports:
 *  - Generic assets (equipment, furniture, machinery)
 *  - Vehicle/fleet assets (buses, trucks, cars) with vehicle-specific fields
 *  - Full accounting setup: asset account, depreciation accounts
 *  - Photo upload
 *  - Metadata for vehicle specs (fuel type, capacity, VIN, etc.)
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  useFixedAsset,
  useCreateFixedAsset,
  useUpdateFixedAsset,
  useAssetCategories,
  useCreateAssetCategory,
} from '../../hooks/useAssets';
import { useAllStaff } from '../../hooks/useStaff';
import type { CreateFixedAssetRequest, CreateAssetCategoryRequest } from '../../types/assets';
import { AccountsService } from '../../services/accounts';
import type { Account } from '../../types/account';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import {
  ArrowLeft,
  Save,
  Truck,
  Package,
  FileText,
  Info,
  Plus,
  X,
  ClipboardList,
} from 'lucide-react';

type FormData = Partial<CreateFixedAssetRequest> & {
  // Vehicle-specific metadata fields
  meta_vehicle_type?: string;
  meta_fuel_type?: string;
  meta_engine_capacity?: string;
  meta_seating_capacity?: string;
  meta_color?: string;
  meta_vin?: string;
};

const DEPRECIATION_METHODS = [
  { value: 'straight_line', label: 'Straight Line' },
  { value: 'declining_balance', label: 'Declining Balance' },
  { value: 'units_of_production', label: 'Units of Production' },
];

const ASSET_STATUSES = [
  { value: 'draft', label: 'Draft (Registered — not yet acquired)' },
  { value: 'active', label: 'Active / In Use' },
  { value: 'idle', label: 'Idle' },
  { value: 'maintenance', label: 'Under Maintenance' },
];

const VEHICLE_TYPES = [
  { value: 'bus', label: 'Bus' },
  { value: 'minibus', label: 'Mini-Bus / Van' },
  { value: 'truck', label: 'Truck' },
  { value: 'car', label: 'Car / Saloon' },
  { value: 'suv', label: 'SUV / 4x4' },
  { value: 'pickup', label: 'Pick-Up Truck' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'other', label: 'Other Vehicle' },
];

const FUEL_TYPES = [
  { value: 'petrol', label: 'Petrol (Gasoline)' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'electric', label: 'Electric' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'lpg', label: 'LPG / CNG' },
];

// Detect if a category is vehicle-related based on its name/code
const isVehicleCategory = (categoryName: string): boolean => {
  const name = categoryName.toLowerCase();
  return (
    name.includes('vehicle') ||
    name.includes('bus') ||
    name.includes('truck') ||
    name.includes('car') ||
    name.includes('fleet') ||
    name.includes('transport') ||
    name.includes('motor')
  );
};

// ── Inline account search picker used in the category modal ──────────────────
interface AccountPickerProps {
  label: string;
  value?: number;
  onChange: (id: number | undefined) => void;
  accounts: Account[];
  filterType?: string;
  error?: string;
  required?: boolean;
  hint?: string;
}

const AccountPicker: React.FC<AccountPickerProps> = ({
  label,
  value,
  onChange,
  accounts,
  filterType,
  error,
  required,
  hint,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = filterType ? accounts.filter(a => a.account_type === filterType) : accounts;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(a => `${a.code ?? ''} ${a.name}`.toLowerCase().includes(q));
    }
    return list.slice(0, 60);
  }, [accounts, filterType, query]);

  const selected = accounts.find(a => a.id === value);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {hint && <p className="text-xs text-gray-400 mb-1">{hint}</p>}
      <div className="relative">
        <input
          type="text"
          placeholder="Search accounts…"
          value={
            open ? query : selected ? `[${selected.code ?? selected.id}] ${selected.name}` : ''
          }
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          onChange={e => setQuery(e.target.value)}
          className={`w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${
            error ? 'border-red-400' : 'border-gray-300'
          }`}
        />
        {open && (
          <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">No accounts found</div>
            ) : (
              filtered.map(acc => (
                <button
                  key={acc.id}
                  type="button"
                  onMouseDown={() => {
                    onChange(acc.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0 ${
                    acc.id === value ? 'bg-blue-50 font-medium' : ''
                  }`}
                >
                  <span className="font-mono text-xs text-gray-500 mr-2">
                    [{acc.code ?? acc.id}]
                  </span>
                  {acc.name}
                  <span className="ml-2 text-xs text-gray-400">{acc.account_type}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
};

const AssetFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;

  const { data: existingAsset, isLoading: loadingAsset } = useFixedAsset(
    isEditing ? parseInt(id!) : 0
  );
  const { data: categories = [] } = useAssetCategories();

  const createMutation = useCreateFixedAsset();
  const updateMutation = useUpdateFixedAsset();
  const createCategoryMutation = useCreateAssetCategory();

  const { data: staffList = [] } = useAllStaff({ is_active: true });

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);

  // Load GL accounts once when the category modal is first opened
  useEffect(() => {
    if (showCategoryModal && !accountsLoaded) {
      AccountsService.getInstance()
        .getAccounts()
        .then(data => {
          const list = Array.isArray(data)
            ? data
            : ((data as { results?: Account[] }).results ?? []);
          setAllAccounts(list);
          setAccountsLoaded(true);
        })
        .catch(() => {
          /* silent – pickers will just be empty */
        });
    }
  }, [showCategoryModal, accountsLoaded]);

  const [categoryForm, setCategoryForm] = useState<Partial<CreateAssetCategoryRequest>>({
    default_depreciation_method: 'straight_line',
    default_useful_life_years: 5,
    default_salvage_value_percentage: '10.00',
  });
  const [categoryErrors, setCategoryErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<FormData>({
    status: 'draft',
    depreciation_method: 'straight_line',
    useful_life_years: 5,
    salvage_value: '0',
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showVehicleSection, setShowVehicleSection] = useState(false);

  // Populate form for editing
  useEffect(() => {
    if (isEditing && existingAsset) {
      const meta = existingAsset.metadata || {};
      setFormData({
        asset_number: existingAsset.asset_number,
        category: existingAsset.category,
        name: existingAsset.name,
        description: existingAsset.description,
        serial_number: existingAsset.serial_number,
        registration_number: existingAsset.registration_number,
        make: existingAsset.make,
        model: existingAsset.model,
        year: existingAsset.year,
        purchase_date: existingAsset.purchase_date ?? undefined,
        purchase_price: existingAsset.purchase_price,
        salvage_value: existingAsset.salvage_value || '0',
        depreciation_method: existingAsset.depreciation_method || 'straight_line',
        useful_life_years: existingAsset.useful_life_years ?? 5,
        depreciation_start_date: existingAsset.depreciation_start_date ?? undefined,
        current_location: existingAsset.current_location,
        assigned_to: existingAsset.assigned_to,
        assigned_to_staff: existingAsset.assigned_to_staff,
        status: existingAsset.status,
        // Vehicle metadata
        meta_vehicle_type: meta.vehicle_type || '',
        meta_fuel_type: meta.fuel_type || '',
        meta_engine_capacity: meta.engine_capacity || '',
        meta_seating_capacity: meta.seating_capacity || '',
        meta_color: meta.color || '',
        meta_vin: meta.vin || '',
      });

      if (existingAsset.photo) {
        setPhotoPreview(existingAsset.photo);
      }

      // Auto-show vehicle section if category is vehicle-related, has vehicle data,
      // or is a skeleton asset (no serial/reg/make — created via acquisition, needs completion)
      const cat = categories.find(c => c.id === existingAsset.category);
      if (
        (cat && isVehicleCategory(cat.name)) ||
        existingAsset.registration_number ||
        existingAsset.make ||
        (!existingAsset.serial_number && !existingAsset.registration_number && !existingAsset.make)
      ) {
        setShowVehicleSection(true);
      }
    }
  }, [isEditing, existingAsset, categories]);

  // Auto-detect vehicle category on category change
  useEffect(() => {
    if (formData.category) {
      const cat = categories.find(c => c.id === formData.category);
      if (cat && isVehicleCategory(cat.name)) {
        setShowVehicleSection(true);
      }
    }
  }, [formData.category, categories]);

  const handleChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onload = ev => setPhotoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.asset_number?.trim()) newErrors.asset_number = 'Asset number is required';
    if (!formData.category) newErrors.category = 'Category is required';
    if (!formData.name?.trim()) newErrors.name = 'Asset name is required';

    // Financial fields are optional on registration (filled via Requisition → Activate)
    if (formData.purchase_price && parseFloat(formData.purchase_price) < 0) {
      newErrors.purchase_price = 'Purchase price cannot be negative';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const buildMetadata = (): Record<string, any> => {
    const meta: Record<string, any> = {};
    if (formData.meta_vehicle_type) meta.vehicle_type = formData.meta_vehicle_type;
    if (formData.meta_fuel_type) meta.fuel_type = formData.meta_fuel_type;
    if (formData.meta_engine_capacity) meta.engine_capacity = formData.meta_engine_capacity;
    if (formData.meta_seating_capacity) meta.seating_capacity = formData.meta_seating_capacity;
    if (formData.meta_color) meta.color = formData.meta_color;
    if (formData.meta_vin) meta.vin = formData.meta_vin;
    return meta;
  };

  const handleCategoryFormChange = (field: keyof CreateAssetCategoryRequest, value: any) => {
    setCategoryForm(prev => ({ ...prev, [field]: value }));
    if (categoryErrors[field]) {
      setCategoryErrors(prev => {
        const n = { ...prev };
        delete n[field];
        return n;
      });
    }
  };

  const validateCategoryForm = (): boolean => {
    const errs: Record<string, string> = {};
    if (!categoryForm.code?.trim()) errs.code = 'Code is required';
    if (!categoryForm.name?.trim()) errs.name = 'Name is required';
    if (!categoryForm.default_depreciation_method)
      errs.default_depreciation_method = 'Method is required';
    if (!categoryForm.default_useful_life_years || categoryForm.default_useful_life_years < 1)
      errs.default_useful_life_years = 'Useful life must be at least 1 year';
    if (!categoryForm.default_salvage_value_percentage?.trim())
      errs.default_salvage_value_percentage = 'Salvage % is required';
    if (!categoryForm.asset_account) errs.asset_account = 'Asset account is required';
    if (!categoryForm.accumulated_depreciation_account)
      errs.accumulated_depreciation_account = 'Accumulated depreciation account is required';
    if (!categoryForm.depreciation_account)
      errs.depreciation_account = 'Depreciation expense account is required';
    setCategoryErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCategorySubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateCategoryForm()) return;
    try {
      const created = await createCategoryMutation.mutateAsync(
        categoryForm as CreateAssetCategoryRequest
      );
      // auto-select the newly created category
      handleChange('category', created.id);
      setShowCategoryModal(false);
      setCategoryForm({
        default_depreciation_method: 'straight_line',
        default_useful_life_years: 5,
        default_salvage_value_percentage: '10.00',
      });
      setCategoryErrors({});
    } catch (err: any) {
      if (err.response?.data) {
        const apiErrs: Record<string, string> = {};
        Object.entries(err.response.data).forEach(([k, v]) => {
          apiErrs[k] = Array.isArray(v) ? v[0] : String(v);
        });
        setCategoryErrors(apiErrs);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const payload: CreateFixedAssetRequest = {
      asset_number: formData.asset_number!,
      category: formData.category!,
      name: formData.name!,
      description: formData.description,
      serial_number: formData.serial_number,
      registration_number: formData.registration_number,
      make: formData.make,
      model: formData.model,
      year: formData.year ? Number(formData.year) : undefined,
      purchase_date: formData.purchase_date || null,
      purchase_price: formData.purchase_price,
      salvage_value: formData.salvage_value,
      depreciation_method: formData.depreciation_method || '',
      useful_life_years: formData.useful_life_years ? Number(formData.useful_life_years) : null,
      depreciation_start_date: formData.depreciation_start_date || null,
      current_location: formData.current_location,
      assigned_to: formData.assigned_to,
      assigned_to_staff: formData.assigned_to_staff ?? null,
      status: formData.status ?? 'draft',
      metadata: buildMetadata(),
      photo: photo || undefined,
    };

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: parseInt(id!), data: payload });
        navigate(`/assets/${id}`);
      } else {
        const created = await createMutation.mutateAsync(payload);
        navigate(`/assets/${created.id}`);
      }
    } catch (err: any) {
      if (err.response?.data) {
        const apiErrors: Record<string, string> = {};
        Object.entries(err.response.data).forEach(([key, value]) => {
          apiErrors[key] = Array.isArray(value) ? value[0] : String(value);
        });
        setErrors(apiErrors);
      }
    }
  };

  if (isEditing && loadingAsset) {
    return <div className="container mx-auto p-6">Loading asset...</div>;
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/assets')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditing ? 'Edit Asset' : 'Register New Asset'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isEditing
              ? 'Update asset details'
              : 'Register the existence of an asset — financial value is added later via a Requisition'}
          </p>
        </div>
      </div>

      {/* Workflow info banner (create mode only) */}
      {!isEditing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
          <ClipboardList className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">How the asset workflow works:</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-700">
              <li>
                <strong>Register</strong> — create the asset shell here (no financial value yet)
              </li>
              <li>
                <strong>Purchase</strong> — attach a supplier &amp; confirm the price
              </li>
              <li>
                <strong>Activate</strong> — Finance approves &amp; activates: GL entry + AP record
                are posted, asset becomes active
              </li>
            </ol>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Section 1: Core Identity ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-blue-600" />
              Asset Identity
            </CardTitle>
            <CardDescription>Basic identification information</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Asset Number <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.asset_number || ''}
                onChange={e => handleChange('asset_number', e.target.value)}
                placeholder="e.g. COMP-001, VEH-001, FURN-001"
                className={errors.asset_number ? 'border-red-500' : ''}
              />
              {errors.asset_number && (
                <p className="text-xs text-red-500 mt-1">{errors.asset_number}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <select
                    aria-label="Category"
                    value={formData.category?.toString() || ''}
                    onChange={e =>
                      handleChange(
                        'category',
                        e.target.value ? parseInt(e.target.value) : undefined
                      )
                    }
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${
                      errors.category ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Select category</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id.toString()}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {errors.category && (
                    <p className="text-xs text-red-500 mt-1">{errors.category}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  className="shrink-0 mt-0.5"
                  onClick={() => setShowCategoryModal(true)}
                  title="Create new category"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  New
                </Button>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Asset Name / Description <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.name || ''}
                onChange={e => handleChange('name', e.target.value)}
                placeholder="e.g. HP ProBook Laptop, Toyota Coaster Bus, Canon iR Copier"
                className={errors.name ? 'border-red-500' : ''}
              />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                className="w-full border rounded-md px-3 py-2 text-sm resize-none"
                rows={2}
                value={formData.description || ''}
                onChange={e => handleChange('description', e.target.value)}
                placeholder="Additional details..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <Select
                value={formData.status || 'active'}
                onValueChange={v => handleChange('status', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
              <Input
                value={formData.serial_number || ''}
                onChange={e => handleChange('serial_number', e.target.value)}
                placeholder="Chassis / Serial number"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Location
              </label>
              <Input
                value={formData.current_location || ''}
                onChange={e => handleChange('current_location', e.target.value)}
                placeholder="e.g. Main Campus Garage"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assign to Staff Member
              </label>
              <select
                aria-label="Staff Assignment"
                value={formData.assigned_to_staff?.toString() || ''}
                onChange={e =>
                  handleChange(
                    'assigned_to_staff',
                    e.target.value ? parseInt(e.target.value) : null
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">— Not assigned to a staff member —</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id.toString()}>
                    {s.full_name} ({s.employee_id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assigned To
                <span className="text-xs text-gray-400 ml-1">
                  (department / other — used when no staff member is selected above)
                </span>
              </label>
              <Input
                value={formData.assigned_to || ''}
                onChange={e => handleChange('assigned_to', e.target.value)}
                placeholder="e.g. Finance Dept, Admin Block"
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Section 3: Vehicle Details (toggle) ── */}
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setShowVehicleSection(v => !v)}>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-orange-600" />
                Vehicle / Equipment Details
              </span>
              <span className="text-xs font-normal text-gray-500">
                {showVehicleSection ? '▲ Hide' : '▼ Show (vehicles, trackable equipment)'}
              </span>
            </CardTitle>
            <CardDescription>
              Registration / serial details, make &amp; model — expand for vehicles, generators, and
              other trackable equipment
            </CardDescription>
          </CardHeader>

          {showVehicleSection && (
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Registration / Plate Number
                  <span className="text-xs text-gray-400 ml-1">(vehicles)</span>
                </label>
                <Input
                  value={formData.registration_number || ''}
                  onChange={e => handleChange('registration_number', e.target.value)}
                  placeholder="e.g. LAG-123-XYZ"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Type</label>
                <Select
                  value={formData.meta_vehicle_type || ''}
                  onValueChange={v => handleChange('meta_vehicle_type', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Make</label>
                <Input
                  value={formData.make || ''}
                  onChange={e => handleChange('make', e.target.value)}
                  placeholder="e.g. Toyota"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <Input
                  value={formData.model || ''}
                  onChange={e => handleChange('model', e.target.value)}
                  placeholder="e.g. Coaster / Hiace"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                <Input
                  type="number"
                  min="1980"
                  max={new Date().getFullYear() + 1}
                  value={formData.year || ''}
                  onChange={e => handleChange('year', parseInt(e.target.value))}
                  placeholder={String(new Date().getFullYear())}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fuel Type
                  <span className="text-xs text-gray-400 ml-1">
                    (used for consumption tracking)
                  </span>
                </label>
                <Select
                  value={formData.meta_fuel_type || ''}
                  onValueChange={v => handleChange('meta_fuel_type', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select fuel type" />
                  </SelectTrigger>
                  <SelectContent>
                    {FUEL_TYPES.map(f => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Engine Capacity
                </label>
                <Input
                  value={formData.meta_engine_capacity || ''}
                  onChange={e => handleChange('meta_engine_capacity', e.target.value)}
                  placeholder="e.g. 2.8L"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Seating Capacity
                </label>
                <Input
                  type="number"
                  min="1"
                  value={formData.meta_seating_capacity || ''}
                  onChange={e => handleChange('meta_seating_capacity', e.target.value)}
                  placeholder="Number of seats"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Colour</label>
                <Input
                  value={formData.meta_color || ''}
                  onChange={e => handleChange('meta_color', e.target.value)}
                  placeholder="e.g. White"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  VIN / Chassis Number
                </label>
                <Input
                  value={formData.meta_vin || ''}
                  onChange={e => handleChange('meta_vin', e.target.value)}
                  placeholder="Vehicle Identification Number"
                />
              </div>

              <div className="md:col-span-2 p-3 bg-amber-50 rounded-lg text-sm text-amber-800">
                <Info className="inline h-4 w-4 mr-1" />
                Fuel and resource consumption tracking is linked to this asset via the{' '}
                <strong>Resource Consumption</strong> module. Record fill-ups (vehicles) or
                consumables (generators, printers) there to track usage and build a service history.
              </div>
            </CardContent>
          )}
        </Card>

        {/* ── Section 4: Photo ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-purple-600" />
              Asset Photo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              {photoPreview && (
                <img
                  src={photoPreview}
                  alt="Asset"
                  className="h-24 w-32 object-cover rounded-lg border"
                />
              )}
              <div>
                <input
                  type="file"
                  accept="image/*"
                  id="photo-upload"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
                <label
                  htmlFor="photo-upload"
                  className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 border rounded-md text-sm hover:bg-gray-50"
                >
                  {photoPreview ? 'Change Photo' : 'Upload Photo'}
                </label>
                <p className="text-xs text-gray-500 mt-1">JPEG or PNG, max 5 MB</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Error summary ── */}
        {Object.keys(errors).length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              Please correct the highlighted errors before saving.
            </AlertDescription>
          </Alert>
        )}

        {/* ── Actions ── */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(isEditing ? `/assets/${id}` : '/assets')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            <Save className="h-4 w-4 mr-2" />
            {isPending ? 'Saving...' : isEditing ? 'Update Asset' : 'Register Asset'}
          </Button>
        </div>
      </form>

      {/* ── Create New Category Modal ── */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center">
                <Package className="w-6 h-6 text-blue-600 mr-3" />
                <h2 className="text-xl font-semibold text-gray-900">New Asset Category</h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowCategoryModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCategorySubmit} className="flex flex-col min-h-0 flex-1">
              <div className="overflow-y-auto flex-1 p-6 space-y-6">
                {/* Code & Name */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Code *</label>
                    <input
                      type="text"
                      value={categoryForm.code || ''}
                      onChange={e => handleCategoryFormChange('code', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        categoryErrors.code ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="e.g. VEH, EQUIP"
                    />
                    {categoryErrors.code && (
                      <p className="mt-1 text-sm text-red-600">{categoryErrors.code}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                    <input
                      type="text"
                      value={categoryForm.name || ''}
                      onChange={e => handleCategoryFormChange('name', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        categoryErrors.name ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="e.g. Vehicles & Fleet"
                    />
                    {categoryErrors.name && (
                      <p className="mt-1 text-sm text-red-600">{categoryErrors.name}</p>
                    )}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={categoryForm.description || ''}
                    onChange={e => handleCategoryFormChange('description', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Optional notes about this category…"
                    rows={3}
                  />
                </div>

                {/* Depreciation Method */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Depreciation Method *
                  </label>
                  <select
                    aria-label="Depreciation Method"
                    value={categoryForm.default_depreciation_method || 'straight_line'}
                    onChange={e =>
                      handleCategoryFormChange('default_depreciation_method', e.target.value)
                    }
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      categoryErrors.default_depreciation_method
                        ? 'border-red-500'
                        : 'border-gray-300'
                    }`}
                  >
                    {DEPRECIATION_METHODS.map(m => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  {categoryErrors.default_depreciation_method && (
                    <p className="mt-1 text-sm text-red-600">
                      {categoryErrors.default_depreciation_method}
                    </p>
                  )}
                </div>

                {/* Useful Life & Salvage % */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Useful Life (years) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={categoryForm.default_useful_life_years ?? 5}
                      onChange={e =>
                        handleCategoryFormChange(
                          'default_useful_life_years',
                          parseInt(e.target.value)
                        )
                      }
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        categoryErrors.default_useful_life_years
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder="e.g. 5"
                    />
                    {categoryErrors.default_useful_life_years && (
                      <p className="mt-1 text-sm text-red-600">
                        {categoryErrors.default_useful_life_years}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Salvage % *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      value={categoryForm.default_salvage_value_percentage ?? '10.00'}
                      onChange={e =>
                        handleCategoryFormChange('default_salvage_value_percentage', e.target.value)
                      }
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        categoryErrors.default_salvage_value_percentage
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder="10.00"
                    />
                    {categoryErrors.default_salvage_value_percentage && (
                      <p className="mt-1 text-sm text-red-600">
                        {categoryErrors.default_salvage_value_percentage}
                      </p>
                    )}
                  </div>
                </div>

                {/* GL Accounts */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-900">GL Account Mapping</h3>

                  <AccountPicker
                    label="Asset Account *"
                    hint="e.g. Fixed Assets / Property, Plant & Equipment"
                    value={categoryForm.asset_account}
                    onChange={id => handleCategoryFormChange('asset_account', id)}
                    accounts={allAccounts}
                    filterType="ASSET"
                    error={categoryErrors.asset_account}
                  />

                  <AccountPicker
                    label="Accumulated Depreciation Account *"
                    hint="Contra-asset account that accumulates depreciation charges"
                    value={categoryForm.accumulated_depreciation_account}
                    onChange={id =>
                      handleCategoryFormChange('accumulated_depreciation_account', id)
                    }
                    accounts={allAccounts}
                    filterType="ASSET"
                    error={categoryErrors.accumulated_depreciation_account}
                  />

                  <AccountPicker
                    label="Depreciation Expense Account *"
                    hint="P&L expense account charged each depreciation period"
                    value={categoryForm.depreciation_account}
                    onChange={id => handleCategoryFormChange('depreciation_account', id)}
                    accounts={allAccounts}
                    filterType="EXPENSE"
                    error={categoryErrors.depreciation_account}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 flex justify-end space-x-4 p-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createCategoryMutation.isPending}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {createCategoryMutation.isPending ? 'Creating…' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetFormPage;
