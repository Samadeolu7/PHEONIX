import React, { useState, useEffect } from 'react';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Dialog, {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';

import { Button } from '@/components/ui/Button';

import Textarea from '@/components/ui/Textarea';

import { Input } from '@/components/ui/Input';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';

import { Alert, AlertDescription } from '@/components/ui/Alert';

import { Label } from '../ui/Label';
import { Loader2 } from 'lucide-react';
import { clientService, Client } from '../../services/clientService';
import { supplierService, Supplier } from '../../services/supplierService';

// ============================================================================
// VENDOR SELECT COMPONENT
// ============================================================================

interface VendorSelectProps {
  vendorType: 'client' | 'supplier';
  value: number;
  onChange: (vendorId: number) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
}

export const VendorSelect: React.FC<VendorSelectProps> = ({
  vendorType,
  value,
  onChange,
  label,
  required = false,
  disabled = false,
  error,
}) => {
  const [vendors, setVendors] = useState<Array<{ id: number; name: string; code: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadVendors();
  }, [vendorType]);

  const loadVendors = async () => {
    setLoading(true);
    try {
      if (vendorType === 'supplier') {
        const response = await supplierService.getAllSuppliers({ is_active: true });
        setVendors(
          (response || []).map((s: Supplier) => ({
            id: s.id,
            name: s.name,
            code: s.supplier_code,
          }))
        );
      } else {
        const response = await clientService.getClients({ status: 'active' });
        setVendors(
          (response.results || []).map((c: Client) => ({
            id: c.id,
            name: c.full_name,
            code: c.client_id,
          }))
        );
      }
    } catch (err) {
      console.error('Failed to load vendors:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredVendors = vendors.filter(
    v =>
      v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedVendor = vendors.find(v => v.id === value);

  return (
    <div className="space-y-2">
      {label && (
        <Label>
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
      )}

      {loading ? (
        <div className="flex items-center gap-2 p-3 border rounded-md">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading {vendorType}s...</span>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Search Input */}
          <Input
            type="text"
            placeholder={`Search ${vendorType}s...`}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            disabled={disabled}
          />

          {/* Select Dropdown */}
          <Select
            value={value?.toString() || ''}
            onValueChange={val => onChange(parseInt(val))}
            disabled={disabled}
          >
            <SelectTrigger className={error ? 'border-red-500' : ''}>
              <SelectValue>
                {selectedVendor
                  ? `${selectedVendor.name} (${selectedVendor.code})`
                  : `Select ${vendorType}...`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {filteredVendors.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground text-center">
                  No {vendorType}s found
                </div>
              ) : (
                filteredVendors.map(vendor => (
                  <SelectItem key={vendor.id} value={vendor.id.toString()}>
                    {vendor.name} ({vendor.code})
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default VendorSelect;
