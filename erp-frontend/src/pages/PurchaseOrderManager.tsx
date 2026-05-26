import { useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Trash2,
  Eye,
  Send,
  AlertCircle,
} from 'lucide-react';

import { useAllSuppliers } from '../hooks/useSuppliers';
import {
  usePurchaseOrders,
  useCreatePurchaseOrder,
  useApprovePurchaseOrder,
  useSendPurchaseOrder,
  useCancelPurchaseOrder,
  useCreateGRN,
  useAllInventoryItems,
  useAllInventoryLocations,
} from '../hooks/useProcurement';
import { useToast } from '../hooks/useToast';
import { useApprovalGuard } from '../hooks/useApprovalGuard';

const PurchaseOrderManager = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedPO, setSelectedPO] = useState(null);
  const [showNewPOModal, setShowNewPOModal] = useState(false);
  const [showGRNModal, setShowGRNModal] = useState(false);
  const toast = useToast();
  const { canUserApprove } = useApprovalGuard();

  // React Query hooks
  const {
    data: purchaseOrdersData,
    isLoading: poLoading,
    error: poError,
  } = usePurchaseOrders({
    search: searchQuery || undefined,
    status: filterStatus === 'all' ? undefined : filterStatus,
  });

  const { data: suppliersData = [], isLoading: suppliersLoading } = useAllSuppliers({
    is_active: true,
  });

  const { data: inventoryItemsData = [], isLoading: itemsLoading } = useAllInventoryItems({
    is_active: true,
    limit: 1000,
  });

  const { data: locationsData = [], isLoading: locationsLoading } = useAllInventoryLocations({
    is_active: true,
  });

  // Mutations
  const createPOMutation = useCreatePurchaseOrder();
  const approvePOMutation = useApprovePurchaseOrder();
  const sendPOMutation = useSendPurchaseOrder();
  const cancelPOMutation = useCancelPurchaseOrder();
  const createGRNMutation = useCreateGRN();

  // Extract data from React Query responses
  const purchaseOrders = purchaseOrdersData?.results || [];
  const suppliers = suppliersData || [];
  const inventoryItems = inventoryItemsData || [];
  const locations = locationsData || [];

  const loading = poLoading || suppliersLoading || itemsLoading || locationsLoading;
  const processing =
    createPOMutation.isPending ||
    approvePOMutation.isPending ||
    sendPOMutation.isPending ||
    cancelPOMutation.isPending ||
    createGRNMutation.isPending;

  const handleCreatePO = async poData => {
    try {
      await createPOMutation.mutateAsync(poData);
      toast.success('Purchase Order created successfully!');
      setShowNewPOModal(false);
    } catch (err: unknown) {
      console.error('Failed to create PO:', err);
      toast.error('Failed to create purchase order');
    }
  };

  const handleApprovePO = async poId => {
    if (!confirm('Approve this purchase order?')) return;

    try {
      await approvePOMutation.mutateAsync(poId);
      toast.success('Purchase Order approved successfully!');
    } catch (err: unknown) {
      console.error('Failed to approve PO:', err);
      toast.error('Failed to approve purchase order');
    }
  };

  const handleSendPO = async poId => {
    if (!confirm('Send this purchase order to supplier?')) return;

    try {
      await sendPOMutation.mutateAsync(poId);
      toast.success('Purchase Order sent to supplier!');
    } catch (err: unknown) {
      console.error('Failed to send PO:', err);
      toast.error('Failed to send purchase order');
    }
  };

  const handleCancelPO = async poId => {
    const reason = prompt('Enter cancellation reason:');
    if (!reason) return;

    try {
      await cancelPOMutation.mutateAsync({ id: poId, reason });
      toast.success('Purchase Order cancelled');
    } catch (err: unknown) {
      console.error('Failed to cancel PO:', err);
      toast.error('Failed to cancel purchase order');
    }
  };

  const handleCreateGRN = async grnData => {
    try {
      await createGRNMutation.mutateAsync(grnData);
      toast.success('Goods Received Note created successfully!');
      setShowGRNModal(false);
      setSelectedPO(null);
    } catch (err: unknown) {
      console.error('Failed to create GRN:', err);
      toast.error('Failed to create GRN');
    }
  };

  const getStatusColor = status => {
    const colors = {
      draft: '#6b7280',
      submitted: '#3b82f6',
      approved: '#10b981',
      sent: '#8b5cf6',
      partially_received: '#f59e0b',
      received: '#059669',
      cancelled: '#ef4444',
    };
    return colors[status] || '#6b7280';
  };

  const getStatusIcon = status => {
    const icons = {
      approved: CheckCircle,
      partially_received: Package,
      received: CheckCircle,
      cancelled: XCircle,
    };
    const Icon = icons[status] || AlertCircle;
    return <Icon size={16} />;
  };

  const filteredPOs = purchaseOrders.filter(po => {
    const matchesSearch =
      po.po_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      po.supplier.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' || po.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const NewPOForm = () => {
    const [formData, setFormData] = useState({
      supplier_id: '',
      delivery_location_id: '',
      expected_delivery_date: '',
      payment_terms: 'net_30',
      items: [],
    });

    const addItem = () => {
      setFormData({
        ...formData,
        items: [...formData.items, { item_id: '', quantity: 1, unit_price: 0 }],
      });
    };

    const updateItem = (index, field, value) => {
      const newItems = [...formData.items];
      newItems[index][field] = value;
      setFormData({ ...formData, items: newItems });
    };

    const removeItem = index => {
      setFormData({
        ...formData,
        items: formData.items.filter((_, i) => i !== index),
      });
    };

    const calculateTotal = () => {
      return formData.items.reduce(
        (sum, item) => sum + parseFloat(item.quantity) * parseFloat(item.unit_price || 0),
        0
      );
    };

    return (
      <div style={{ padding: '24px' }}>
        <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 'bold' }}>
          Create Purchase Order
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '20px',
            marginBottom: '24px',
          }}
        >
          <div>
            <label
              style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}
            >
              Supplier *
            </label>
            <select
              value={formData.supplier_id}
              onChange={e => setFormData({ ...formData, supplier_id: e.target.value })}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            >
              <option value="">Select supplier...</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}
            >
              Delivery Location *
            </label>
            <select
              value={formData.delivery_location_id}
              onChange={e => setFormData({ ...formData, delivery_location_id: e.target.value })}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            >
              <option value="">Select location...</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}
            >
              Expected Delivery Date
            </label>
            <input
              type="date"
              value={formData.expected_delivery_date}
              onChange={e => setFormData({ ...formData, expected_delivery_date: e.target.value })}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            />
          </div>

          <div>
            <label
              style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}
            >
              Payment Terms
            </label>
            <select
              value={formData.payment_terms}
              onChange={e => setFormData({ ...formData, payment_terms: e.target.value })}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            >
              <option value="cash">Cash on Delivery</option>
              <option value="net_15">Net 15 Days</option>
              <option value="net_30">Net 30 Days</option>
              <option value="net_60">Net 60 Days</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Items</h3>
            <button
              onClick={addItem}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                background: '#3b82f6',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Plus size={16} />
              Add Item
            </button>
          </div>

          {formData.items.length === 0 ? (
            <div
              style={{
                padding: '48px',
                background: '#f9fafb',
                borderRadius: '8px',
                textAlign: 'center',
                color: '#6b7280',
              }}
            >
              <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <p style={{ margin: 0 }}>No items added yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {formData.items.map((item, index) => (
                <div
                  key={index}
                  style={{
                    padding: '16px',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1fr auto',
                    gap: '12px',
                    alignItems: 'end',
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      Item
                    </label>
                    <select
                      value={item.item_id}
                      onChange={e => {
                        const selectedItem = inventoryItems.find(
                          i => i.id === parseInt(e.target.value)
                        );
                        updateItem(index, 'item_id', e.target.value);
                        if (selectedItem) {
                          updateItem(index, 'unit_price', selectedItem.cost_price);
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    >
                      <option value="">Select item...</option>
                      {inventoryItems.map(i => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      Quantity
                    </label>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={e => updateItem(index, 'quantity', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      Unit Price
                    </label>
                    <input
                      type="number"
                      value={item.unit_price}
                      onChange={e => updateItem(index, 'unit_price', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      Total
                    </label>
                    <div
                      style={{
                        padding: '10px',
                        background: 'white',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#3b82f6',
                      }}
                    >
                      ₦
                      {(
                        parseFloat(item.quantity) * parseFloat(item.unit_price || 0)
                      ).toLocaleString()}
                    </div>
                  </div>

                  <button
                    onClick={() => removeItem(index)}
                    style={{
                      padding: '10px',
                      border: 'none',
                      background: '#fef2f2',
                      color: '#ef4444',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            padding: '20px',
            background: '#f0f9ff',
            borderRadius: '8px',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '18px', fontWeight: 600, color: '#1e40af' }}>
              Total Amount:
            </span>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e40af' }}>
              ₦{calculateTotal().toLocaleString()}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setShowNewPOModal(false)}
            style={{
              padding: '12px 24px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              background: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              // Validation
              if (!formData.supplier_id || !formData.delivery_location_id) {
                alert('Please select supplier and delivery location');
                return;
              }
              if (formData.items.length === 0) {
                alert('Please add at least one item');
                return;
              }

              // Validate items
              for (let item of formData.items) {
                if (!item.item_id || !item.quantity || !item.unit_price) {
                  alert('Please fill all item details');
                  return;
                }
              }

              await handleCreatePO(formData);
            }}
            disabled={!formData.supplier_id || formData.items.length === 0 || processing}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderRadius: '8px',
              background:
                !formData.supplier_id || formData.items.length === 0 || processing
                  ? '#9ca3af'
                  : '#3b82f6',
              color: 'white',
              cursor:
                !formData.supplier_id || formData.items.length === 0 || processing
                  ? 'not-allowed'
                  : 'pointer',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            {processing ? 'Creating...' : 'Create Purchase Order'}
          </button>
        </div>
      </div>
    );
  };

  const GRNForm = ({ po }) => {
    const [grnData, setGrnData] = useState({
      received_date: new Date().toISOString().split('T')[0],
      delivery_note_number: '',
      vehicle_number: '',
      driver_name: '',
      items: po.items.map(item => ({
        ...item,
        quantity_to_receive: item.quantity - item.quantity_received,
        quantity_accepted: item.quantity - item.quantity_received,
        quantity_rejected: 0,
        batch_number: '',
        condition_notes: '',
      })),
    });

    return (
      <div style={{ padding: '24px' }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 'bold' }}>
          Goods Received Note
        </h2>
        <p style={{ margin: '0 0 24px 0', color: '#6b7280', fontSize: '14px' }}>
          PO: {po.po_number} | Supplier: {po.supplier.name}
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '20px',
            marginBottom: '24px',
          }}
        >
          <div>
            <label
              style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}
            >
              Received Date *
            </label>
            <input
              type="date"
              value={grnData.received_date}
              onChange={e => setGrnData({ ...grnData, received_date: e.target.value })}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            />
          </div>

          <div>
            <label
              style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}
            >
              Delivery Note Number
            </label>
            <input
              type="text"
              value={grnData.delivery_note_number}
              onChange={e => setGrnData({ ...grnData, delivery_note_number: e.target.value })}
              placeholder="Supplier's delivery note..."
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            />
          </div>

          <div>
            <label
              style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}
            >
              Vehicle Number
            </label>
            <input
              type="text"
              value={grnData.vehicle_number}
              onChange={e => setGrnData({ ...grnData, vehicle_number: e.target.value })}
              placeholder="e.g., ABC-123-XY"
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            />
          </div>

          <div>
            <label
              style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}
            >
              Driver Name
            </label>
            <input
              type="text"
              value={grnData.driver_name}
              onChange={e => setGrnData({ ...grnData, driver_name: e.target.value })}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600 }}>
            Items Received
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {grnData.items.map((item, index) => (
              <div
                key={index}
                style={{
                  padding: '20px',
                  background: '#f9fafb',
                  borderRadius: '8px',
                  border: '2px solid #e5e7eb',
                }}
              >
                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600 }}>
                    {item.item.name}
                  </h4>
                  <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
                    SKU: {item.item.sku} | Ordered: {item.quantity} | Pending:{' '}
                    {item.quantity - item.quantity_received}
                  </p>
                </div>

                <div
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      Qty Received
                    </label>
                    <input
                      type="number"
                      value={item.quantity_to_receive}
                      onChange={e => {
                        const newItems = [...grnData.items];
                        newItems[index].quantity_to_receive = parseFloat(e.target.value);
                        newItems[index].quantity_accepted = parseFloat(e.target.value);
                        setGrnData({ ...grnData, items: newItems });
                      }}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      Accepted
                    </label>
                    <input
                      type="number"
                      value={item.quantity_accepted}
                      onChange={e => {
                        const newItems = [...grnData.items];
                        newItems[index].quantity_accepted = parseFloat(e.target.value);
                        newItems[index].quantity_rejected =
                          item.quantity_to_receive - parseFloat(e.target.value);
                        setGrnData({ ...grnData, items: newItems });
                      }}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      Rejected
                    </label>
                    <div
                      style={{
                        padding: '10px',
                        background: item.quantity_rejected > 0 ? '#fef2f2' : 'white',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: item.quantity_rejected > 0 ? '#ef4444' : '#6b7280',
                      }}
                    >
                      {item.quantity_rejected}
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      Batch Number
                    </label>
                    <input
                      type="text"
                      value={item.batch_number}
                      onChange={e => {
                        const newItems = [...grnData.items];
                        newItems[index].batch_number = e.target.value;
                        setGrnData({ ...grnData, items: newItems });
                      }}
                      placeholder="Optional"
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                </div>

                {item.quantity_rejected > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      Rejection Reason
                    </label>
                    <textarea
                      value={item.condition_notes}
                      onChange={e => {
                        const newItems = [...grnData.items];
                        newItems[index].condition_notes = e.target.value;
                        setGrnData({ ...grnData, items: newItems });
                      }}
                      placeholder="Why were items rejected?"
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                        minHeight: '60px',
                        resize: 'vertical',
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setShowGRNModal(false)}
            style={{
              padding: '12px 24px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              background: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              // Validation
              if (!grnData.received_date) {
                alert('Please select received date');
                return;
              }

              // Check if at least one item has quantity
              const hasItems = grnData.items.some(item => item.quantity_to_receive > 0);
              if (!hasItems) {
                alert('Please receive at least one item');
                return;
              }

              // Prepare GRN data
              const submitData = {
                purchase_order_id: po.id,
                received_date: grnData.received_date,
                delivery_note_number: grnData.delivery_note_number,
                vehicle_number: grnData.vehicle_number,
                driver_name: grnData.driver_name,
                items: grnData.items
                  .filter(item => item.quantity_to_receive > 0)
                  .map(item => ({
                    po_item_id: item.id,
                    quantity_received: item.quantity_to_receive,
                    quantity_accepted: item.quantity_accepted,
                    quantity_rejected: item.quantity_rejected,
                    batch_number: item.batch_number,
                    condition_notes: item.condition_notes,
                  })),
              };

              await handleCreateGRN(submitData);
            }}
            disabled={processing}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderRadius: '8px',
              background: processing ? '#9ca3af' : '#10b981',
              color: 'white',
              cursor: processing ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            {processing ? 'Creating GRN...' : 'Post GRN'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '24px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '32px',
          }}
        >
          <div>
            <h1
              style={{
                margin: '0 0 8px 0',
                fontSize: '32px',
                fontWeight: 'bold',
                color: '#111827',
              }}
            >
              Purchase Orders
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
              Manage purchase orders and goods receipts
            </p>
          </div>
          <button
            onClick={() => setShowNewPOModal(true)}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 6px rgba(59, 130, 246, 0.3)',
            }}
          >
            <Plus size={20} />
            New Purchase Order
          </button>
        </div>

        {/* Filters */}
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr auto',
              gap: '16px',
              alignItems: 'end',
            }}
          >
            <div>
              <label
                style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}
              >
                Search
              </label>
              <div style={{ position: 'relative' }}>
                <Search
                  size={20}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#9ca3af',
                  }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="PO number, supplier..."
                  style={{
                    width: '100%',
                    padding: '10px 10px 10px 44px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>
            </div>

            <div>
              <label
                style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}
              >
                Status Filter
              </label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="approved">Approved</option>
                <option value="partially_received">Partially Received</option>
                <option value="received">Fully Received</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <button
              style={{
                padding: '10px 20px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                background: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Filter size={18} />
              More Filters
            </button>
          </div>
        </div>

        {/* PO List */}
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          {filteredPOs.length === 0 ? (
            <div style={{ padding: '64px', textAlign: 'center', color: '#9ca3af' }}>
              <Package size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <p style={{ margin: 0, fontSize: '16px' }}>No purchase orders found</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  <th
                    style={{
                      padding: '16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                    }}
                  >
                    PO Number
                  </th>
                  <th
                    style={{
                      padding: '16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                    }}
                  >
                    Supplier
                  </th>
                  <th
                    style={{
                      padding: '16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                    }}
                  >
                    Order Date
                  </th>
                  <th
                    style={{
                      padding: '16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                    }}
                  >
                    Expected Delivery
                  </th>
                  <th
                    style={{
                      padding: '16px',
                      textAlign: 'right',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                    }}
                  >
                    Amount
                  </th>
                  <th
                    style={{
                      padding: '16px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      padding: '16px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPOs.map(po => (
                  <tr
                    key={po.id}
                    style={{
                      borderBottom: '1px solid #e5e7eb',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                  >
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontWeight: 600, color: '#111827', marginBottom: '2px' }}>
                        {po.po_number}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        {po.items.length} item(s)
                      </div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontWeight: 500, color: '#111827' }}>{po.supplier.name}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{po.supplier.code}</div>
                    </td>
                    <td style={{ padding: '16px', color: '#374151' }}>
                      {new Date(po.order_date).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '16px', color: '#374151' }}>
                      {new Date(po.expected_delivery_date).toLocaleDateString()}
                    </td>
                    <td
                      style={{
                        padding: '16px',
                        textAlign: 'right',
                        fontWeight: 600,
                        color: '#111827',
                      }}
                    >
                      ₦{po.total_amount.toLocaleString()}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: `${getStatusColor(po.status)}15`,
                          color: getStatusColor(po.status),
                        }}
                      >
                        {getStatusIcon(po.status)}
                        {po.status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button
                          onClick={() => setSelectedPO(po)}
                          style={{
                            padding: '6px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            background: 'white',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '13px',
                          }}
                          title="View Details"
                        >
                          <Eye size={14} />
                        </button>
                        {canUserApprove && po.status === 'submitted' && (
                          <>
                            <button
                              onClick={() => handleApprovePO(po.id)}
                              style={{
                                padding: '6px 12px',
                                border: 'none',
                                borderRadius: '6px',
                                background: '#10b981',
                                color: 'white',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '13px',
                                fontWeight: 500,
                              }}
                              title="Approve PO"
                              disabled={processing}
                            >
                              <CheckCircle size={14} />
                              Approve
                            </button>
                            <button
                              onClick={() => handleCancelPO(po.id)}
                              style={{
                                padding: '6px 12px',
                                border: 'none',
                                borderRadius: '6px',
                                background: '#ef4444',
                                color: 'white',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '13px',
                                fontWeight: 500,
                              }}
                              title="Cancel PO"
                              disabled={processing}
                            >
                              <XCircle size={14} />
                            </button>
                          </>
                        )}
                        {po.status === 'approved' && (
                          <button
                            onClick={() => handleSendPO(po.id)}
                            style={{
                              padding: '6px 12px',
                              border: 'none',
                              borderRadius: '6px',
                              background: '#8b5cf6',
                              color: 'white',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '13px',
                              fontWeight: 500,
                            }}
                            title="Send to Supplier"
                            disabled={processing}
                          >
                            <Send size={14} />
                            Send
                          </button>
                        )}
                        {(po.status === 'approved' ||
                          po.status === 'sent' ||
                          po.status === 'partially_received') && (
                          <button
                            onClick={() => {
                              setSelectedPO(po);
                              setShowGRNModal(true);
                            }}
                            style={{
                              padding: '6px 12px',
                              border: 'none',
                              borderRadius: '6px',
                              background: '#10b981',
                              color: 'white',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '13px',
                              fontWeight: 500,
                            }}
                            title="Receive Goods"
                          >
                            <Truck size={14} />
                            GRN
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* New PO Modal */}
      {showNewPOModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '24px',
          }}
          onClick={() => setShowNewPOModal(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              maxWidth: '900px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <NewPOForm />
          </div>
        </div>
      )}

      {/* GRN Modal */}
      {showGRNModal && selectedPO && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '24px',
          }}
          onClick={() => setShowGRNModal(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              maxWidth: '900px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <GRNForm po={selectedPO} />
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrderManager;
