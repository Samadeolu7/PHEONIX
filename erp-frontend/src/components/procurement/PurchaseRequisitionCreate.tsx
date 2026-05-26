/**
 * Purchase Requisition Creation Form with Workflow Trigger
 *
 * Form to create a new PR and automatically trigger the approval workflow.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { Button } from '@/components/ui';
import { Input } from '@/components/ui';
import { Label } from '@/components/ui';
import { Textarea } from '@/components/ui';
import { Plus, Trash2, Send, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

interface PRItem {
  item_description: string;
  quantity: number;
  unit_price: string;
  specifications: string;
}

interface PRFormData {
  department: string;
  purpose: string;
  required_by_date: string;
  items: PRItem[];
}

export const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;

const PurchaseRequisitionCreate: React.FC = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prNumber, setPrNumber] = useState<string>('');

  const [formData, setFormData] = useState<PRFormData>({
    department: '',
    purpose: '',
    required_by_date: format(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'), // 2 weeks from now
    items: [{ item_description: '', quantity: 1, unit_price: '', specifications: '' }],
  });

  const calculateTotal = (): number => {
    return formData.items.reduce((total, item) => {
      return total + item.quantity * (parseFloat(item.unit_price) || 0);
    }, 0);
  };

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        { item_description: '', quantity: 1, unit_price: '', specifications: '' },
      ],
    });
  };

  const handleRemoveItem = (index: number) => {
    if (formData.items.length > 1) {
      const updated = formData.items.filter((_, i) => i !== index);
      setFormData({ ...formData, items: updated });
    }
  };

  const handleItemChange = (index: number, field: keyof PRItem, value: any) => {
    const updated = [...formData.items];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, items: updated });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      // Validate
      if (!formData.department.trim()) {
        throw new Error('Department is required');
      }
      if (!formData.purpose.trim()) {
        throw new Error('Purpose is required');
      }
      if (formData.items.length === 0) {
        throw new Error('At least one item is required');
      }
      if (formData.items.some(item => !item.item_description.trim())) {
        throw new Error('All items must have a description');
      }
      if (formData.items.some(item => item.quantity <= 0 || isNaN(parseFloat(item.unit_price)) || parseFloat(item.unit_price) <= 0)) {
        throw new Error('All items must have valid quantity and price');
      }

      // Call API
      const response = await fetch('/api/procurement/requisitions/create_with_workflow/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create PR');
      }

      const data = await response.json();

      if (data.success) {
        setPrNumber(data.pr_number);
        setSuccess(true);

        // Redirect to PR details after 3 seconds
        setTimeout(() => {
          navigate(`/procurement/requisitions/${data.pr_id}`);
        }, 3000);
      } else {
        throw new Error(data.message || 'Unknown error occurred');
      }
    } catch (err: any) {
      console.error('Error creating PR:', err);
      setError(err.message || 'Failed to create purchase requisition');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Alert className="border-green-500 bg-green-50">
          <CheckCircle2 className="w-6 h-6 text-green-600" />
          <div className="ml-3">
            <h3 className="text-lg font-semibold text-green-900">
              Purchase Requisition Created Successfully!
            </h3>
            <AlertDescription className="text-green-800 mt-2">
              <div className="space-y-2">
                <p>
                  PR Number: <strong className="text-xl">{prNumber}</strong>
                </p>
                <p>
                  Your purchase requisition has been submitted and the approval workflow has
                  started. The appropriate approver will be notified based on the estimated total.
                </p>
                <p className="text-sm">Redirecting to PR details in 3 seconds...</p>
              </div>
            </AlertDescription>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Create Purchase Requisition</h1>
        <p className="text-muted-foreground mt-2">
          Submit a new PR and automatically trigger the approval workflow.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>General details about the purchase requisition</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="department">Department *</Label>
                <Input
                  id="department"
                  value={formData.department}
                  onChange={e => setFormData({ ...formData, department: e.target.value })}
                  placeholder="IT, Finance, Operations, etc."
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="required_by_date">Required By Date *</Label>
                <Input
                  id="required_by_date"
                  type="date"
                  value={formData.required_by_date}
                  onChange={e => setFormData({ ...formData, required_by_date: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="purpose">Purpose / Justification *</Label>
              <Textarea
                id="purpose"
                value={formData.purpose}
                onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                placeholder="Describe why this purchase is needed and how it will be used..."
                rows={3}
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
            <CardDescription>List of items or services to be purchased</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {formData.items.map((item, index) => (
              <Card key={index} className="border-l-4 border-l-blue-500">
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start mb-4">
                    <h4 className="font-semibold">Item {index + 1}</h4>
                    {formData.items.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="md:col-span-2 space-y-2">
                        <Label htmlFor={`item-desc-${index}`}>Item Description *</Label>
                        <Input
                          id={`item-desc-${index}`}
                          value={item.item_description}
                          onChange={e =>
                            handleItemChange(index, 'item_description', e.target.value)
                          }
                          placeholder="Dell Laptop XPS 15, Office Chairs, etc."
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`item-qty-${index}`}>Quantity *</Label>
                        <Input
                          id={`item-qty-${index}`}
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e =>
                            handleItemChange(index, 'quantity', parseInt(e.target.value) || 1)
                          }
                          required
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`item-price-${index}`}>Unit Price ($) *</Label>
                        <Input
                          id={`item-price-${index}`}
                          type="text"
                          inputMode="decimal"
                          value={item.unit_price}
                          onChange={e => {
                            if (DECIMAL_INPUT_REGEX.test(e.target.value) || e.target.value === '') {
                              handleItemChange(index, 'unit_price', e.target.value);
                            }
                          }}
                          required
                        />
                      </div>

                      <div className="md:col-span-2 space-y-2">
                        <Label htmlFor={`item-specs-${index}`}>Specifications</Label>
                        <Input
                          id={`item-specs-${index}`}
                          value={item.specifications}
                          onChange={e => handleItemChange(index, 'specifications', e.target.value)}
                          placeholder="i7 processor, 16GB RAM, 512GB SSD..."
                        />
                      </div>
                    </div>

                    {/* Item Subtotal */}
                    <div className="text-right text-sm font-medium">
                      Subtotal: ${(item.quantity * (parseFloat(item.unit_price) || 0)).toFixed(2)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={handleAddItem}
              className="w-full gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Another Item
            </Button>
          </CardContent>
        </Card>

        {/* Total Summary */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center text-lg font-semibold">
              <span>Estimated Total:</span>
              <span className="text-2xl text-blue-600">${calculateTotal().toFixed(2)}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Based on current approval rules, this PR will be routed to:
              {calculateTotal() < 1000
                ? ' Department Manager'
                : calculateTotal() < 10000
                  ? ' Finance Manager'
                  : ' CFO'}
            </p>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="gap-2 min-w-40">
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit for Approval
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default PurchaseRequisitionCreate;
