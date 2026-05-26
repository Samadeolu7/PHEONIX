import { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Package, AlertTriangle, Printer, TrendingUp } from 'lucide-react';

const AllocationRedemptionManager = () => {
  const [activeTab, setActiveTab] = useState<string>('redemption');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedAllocation, setSelectedAllocation] = useState<any>(null);
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [meterReading, setMeterReading] = useState<string>('');
  const [_recentRedemptions, setRecentRedemptions] = useState<any[]>([]);
  const [_loading, setLoading] = useState<boolean>(false);
  const [_processing, setProcessing] = useState<boolean>(false);
  const [_error, setError] = useState<any>(null);

  // Fetch recent redemptions on mount
  useEffect(() => {
    fetchRecentRedemptions();
  }, []);

  const fetchRecentRedemptions = async () => {
    try {
      const response = await axios.get('/api/inventory/redemptions/recent/?limit=10');
      if (response.data.success) {
        setRecentRedemptions(response.data.data);
      }
    } catch (err: unknown) {
      console.error('Failed to load recent redemptions:', err);
    }
  };

  const handleSearchAllocation = async (query: any) => {
    setSearchQuery(query);
    setError(null);

    if (query.length < 3) {
      setSelectedAllocation(null);
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get(
        `/api/inventory/allocations/search/?query=${encodeURIComponent(query)}`
      );

      if (response.data.success && response.data.data.length > 0) {
        const allocation = response.data.data[0];

        // Fetch full allocation details with items
        const detailResponse = await axios.get(`/api/inventory/allocations/${allocation.id}/`);
        const itemsResponse = await axios.get(`/api/inventory/allocations/${allocation.id}/items/`);

        if (detailResponse.data && itemsResponse.data.success) {
          setSelectedAllocation({
            ...detailResponse.data,
            items: itemsResponse.data.data.map((item: any) => ({
              id: item.id,
              name: item.item_name,
              sku: item.item_sku,
              allocated_quantity: item.allocated_quantity,
              redeemed_quantity: item.redeemed_quantity,
              remaining: item.remaining_quantity,
              unit_price: item.unit_price,
              is_one_time: item.is_one_time_only,
              taken: item.remaining_quantity === 0,
            })),
          });
          setCartItems([]);
          setMeterReading('');
        }
      } else {
        setError('No allocation found');
        setSelectedAllocation(null);
      }
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.response?.data?.message || 'Failed to search allocation');
      setSelectedAllocation(null);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (item: any) => {
    if (item.remaining > 0) {
      const existing = cartItems.find((ci: any) => ci.id === item.id);
      if (existing) {
        setCartItems(
          cartItems.map((ci: any) =>
            ci.id === item.id ? { ...ci, quantity: Math.min(ci.quantity + 1, item.remaining) } : ci
          )
        );
      } else {
        setCartItems([...cartItems, { ...item, quantity: 1 }]);
      }
    }
  };

  const removeFromCart = (itemId: any) => {
    setCartItems(cartItems.filter((ci: any) => ci.id !== itemId));
  };

  const updateCartQuantity = (itemId: any, quantity: any) => {
    const item = selectedAllocation?.items.find((i: any) => i.id === itemId);
    if (item && quantity <= item.remaining) {
      setCartItems(
        cartItems.map(ci => (ci.id === itemId ? { ...ci, quantity: Math.max(1, quantity) } : ci))
      );
    }
  };

  const processRedemption = async () => {
    if (!selectedAllocation || cartItems.length === 0) {
      alert('Please add items to cart before processing');
      return;
    }

    // Check if meter reading is required
    if (selectedAllocation.requires_meter_reading && !meterReading) {
      alert('Meter reading is required for this allocation');
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      // Prepare redemption data
      const redemptionData = {
        allocation_id: selectedAllocation.id,
        items: cartItems.map(item => ({
          allocation_item_id: item.id,
          quantity: item.quantity,
        })),
        payment_method: 'allocation',
        notes: '',
      };

      // Add meter reading if provided
      if (meterReading) {
        redemptionData.meter_reading = parseFloat(meterReading);
      }

      // Process redemption
      const response = await axios.post('/api/inventory/redemptions/redeem/', redemptionData);

      if (response.data.success) {
        // Check for warnings (anomalies)
        if (response.data.warning) {
          const requiresApproval = response.data.requires_approval;
          alert(
            `⚠️ ${response.data.warning}\n\n${requiresApproval ? 'Requires manager approval.' : 'Redemption processed with warning.'}`
          );
        } else {
          alert('✅ Redemption processed successfully!\n\nReceipt has been generated.');
        }

        // Print receipt (optional)
        if (window.confirm('Would you like to print the receipt?')) {
          printReceipt(response.data.data);
        }

        // Reset form
        setCartItems([]);
        setSelectedAllocation(null);
        setSearchQuery('');
        setMeterReading('');

        // Refresh recent redemptions
        fetchRecentRedemptions();
      }
    } catch (err: any) {
      console.error('Redemption error:', err);
      const errorMessage = err?.response?.data?.message || 'Failed to process redemption';
      setError(errorMessage);
      alert(`❌ Error: ${errorMessage}`);
    } finally {
      setProcessing(false);
    }
  };

  const printReceipt = (redemption: any) => {
    const printWindow = window.open('', '_blank');
    const receiptHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Redemption Receipt - ${redemption.redemption_number}</title>
        <style>
          body { font-family: monospace; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; }
          .details { margin: 20px 0; }
          .items { margin: 20px 0; }
          .items table { width: 100%; border-collapse: collapse; }
          .items th, .items td { border: 1px solid #000; padding: 8px; text-align: left; }
          .total { font-weight: bold; font-size: 18px; text-align: right; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>REDEMPTION RECEIPT</h2>
          <p>${redemption.redemption_number}</p>
        </div>
        <div class="details">
          <p><strong>Date:</strong> ${new Date(redemption.redemption_date).toLocaleDateString()}</p>
          <p><strong>Client:</strong> ${redemption.client_name}</p>
          <p><strong>Allocation:</strong> ${redemption.allocation_number}</p>
        </div>
        <div class="items">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${redemption.items
                .map(
                  (item: any) => `
                <tr>
                  <td>${item.item_name}</td>
                  <td>${item.quantity_redeemed}</td>
                  <td>₦${parseFloat(item.unit_price).toFixed(2)}</td>
                  <td>₦${parseFloat(item.total_amount).toFixed(2)}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
        <div class="total">
          <p>TOTAL: ₦${parseFloat(redemption.total_amount).toFixed(2)}</p>
        </div>
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() { window.close(); };
          };
        </script>
      </body>
      </html>
    `;
    if (printWindow !== null) {
      (printWindow as any).document.write(receiptHTML);
      (printWindow as any).document.close();
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '24px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1
            style={{ margin: '0 0 8px 0', fontSize: '32px', fontWeight: 'bold', color: '#111827' }}
          >
            Allocation & Redemption Manager
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
            Process client allocations and fuel vouchers with automated tracking
          </p>
        </div>

        {/* Tabs */}
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '8px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { id: 'redemption', label: 'Process Redemption', icon: Package },
              { id: 'tracking', label: 'Usage Tracking', icon: TrendingUp },
              { id: 'anomalies', label: 'Anomalies', icon: AlertTriangle },
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    flex: 1,
                    padding: '12px 24px',
                    border: 'none',
                    borderRadius: '8px',
                    background: activeTab === tab.id ? '#3b82f6' : 'transparent',
                    color: activeTab === tab.id ? 'white' : '#6b7280',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                  }}
                >
                  <Icon size={18} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        {activeTab === 'redemption' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '24px' }}>
            {/* Left Panel - Search & Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Search */}
              <div
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '24px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              >
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Search Allocation
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
                    onChange={e => handleSearchAllocation(e.target.value)}
                    placeholder="Invoice number, client ID, or name..."
                    style={{
                      width: '100%',
                      padding: '12px 12px 12px 44px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '16px',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={e => (e.target.style.borderColor = '#3b82f6')}
                    onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                  />
                </div>

                {searchQuery && !selectedAllocation && (
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '12px',
                      background: '#fef3c7',
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: '#92400e',
                    }}
                  >
                    <AlertTriangle size={16} style={{ display: 'inline', marginRight: '8px' }} />
                    No allocation found. Try invoice number or client ID.
                  </div>
                )}
              </div>

              {/* Allocation Details */}
              {selectedAllocation && (
                <>
                  <div
                    style={{
                      background: 'white',
                      borderRadius: '12px',
                      padding: '24px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'start',
                        marginBottom: '20px',
                      }}
                    >
                      <div>
                        <h3
                          style={{
                            margin: '0 0 4px 0',
                            fontSize: '20px',
                            fontWeight: 'bold',
                            color: '#111827',
                          }}
                        >
                          {selectedAllocation.client_name}
                        </h3>
                        <p style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: '14px' }}>
                          {selectedAllocation.allocation_number}
                        </p>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 12px',
                            background: '#dbeafe',
                            color: '#1e40af',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 600,
                          }}
                        >
                          {selectedAllocation.type}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                          Remaining Balance
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
                          ₦{selectedAllocation.remaining_amount.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          of ₦{selectedAllocation.allocated_amount.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div
                      style={{
                        width: '100%',
                        height: '8px',
                        background: '#e5e7eb',
                        borderRadius: '4px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${(selectedAllocation.remaining_amount / selectedAllocation.allocated_amount) * 100}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #10b981, #059669)',
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                  </div>

                  {/* Meter Reading for Fuel */}
                  {selectedAllocation.type === 'Fuel' && (
                    <div
                      style={{
                        background: 'white',
                        borderRadius: '12px',
                        padding: '24px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      }}
                    >
                      <label
                        style={{
                          display: 'block',
                          marginBottom: '8px',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: '#374151',
                        }}
                      >
                        Current Odometer Reading <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="number"
                        value={meterReading}
                        onChange={e => setMeterReading(e.target.value)}
                        placeholder="Enter current mileage..."
                        style={{
                          width: '100%',
                          padding: '12px',
                          border: '2px solid #e5e7eb',
                          borderRadius: '8px',
                          fontSize: '16px',
                        }}
                      />
                      <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
                        Last reading: {selectedAllocation.last_meter_reading?.toLocaleString()} km
                        {meterReading && (
                          <span style={{ marginLeft: '16px', fontWeight: 600, color: '#3b82f6' }}>
                            Distance:{' '}
                            {(
                              parseFloat(meterReading) - selectedAllocation.last_meter_reading
                            ).toLocaleString()}{' '}
                            km
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Available Items */}
                  {selectedAllocation.items && (
                    <div
                      style={{
                        background: 'white',
                        borderRadius: '12px',
                        padding: '24px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      }}
                    >
                      <h4
                        style={{
                          margin: '0 0 16px 0',
                          fontSize: '16px',
                          fontWeight: 600,
                          color: '#111827',
                        }}
                      >
                        Available Items
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {selectedAllocation.items.map((item: any) => (
                          <div
                            key={item.id}
                            style={{
                              padding: '16px',
                              border: '2px solid #e5e7eb',
                              borderRadius: '8px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              opacity: item.remaining === 0 ? 0.5 : 1,
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div
                                style={{ fontWeight: 600, color: '#111827', marginBottom: '4px' }}
                              >
                                {item.name}
                                {item.is_one_time && (
                                  <span
                                    style={{
                                      marginLeft: '8px',
                                      padding: '2px 8px',
                                      background: '#fef3c7',
                                      color: '#92400e',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                    }}
                                  >
                                    ONE TIME
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '13px', color: '#6b7280' }}>
                                {item.taken ? (
                                  <span style={{ color: '#ef4444', fontWeight: 600 }}>
                                    ✓ Already taken
                                  </span>
                                ) : (
                                  <>
                                    Remaining: {item.remaining} of {item.quantity}
                                  </>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => addToCart(item)}
                              disabled={item.remaining === 0 || item.taken}
                              style={{
                                padding: '8px 16px',
                                border: 'none',
                                borderRadius: '6px',
                                background:
                                  item.remaining === 0 || item.taken ? '#e5e7eb' : '#3b82f6',
                                color: 'white',
                                cursor:
                                  item.remaining === 0 || item.taken ? 'not-allowed' : 'pointer',
                                fontSize: '14px',
                                fontWeight: 500,
                              }}
                            >
                              Add to Cart
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Right Panel - Cart */}
            <div style={{ position: 'sticky', top: '24px', height: 'fit-content' }}>
              <div
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '24px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              >
                <h4
                  style={{
                    margin: '0 0 20px 0',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    color: '#111827',
                  }}
                >
                  Redemption Cart
                </h4>

                {cartItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 24px', color: '#9ca3af' }}>
                    <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: '14px' }}>No items in cart</p>
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        marginBottom: '24px',
                      }}
                    >
                      {cartItems.map(item => (
                        <div
                          key={item.id}
                          style={{
                            padding: '12px',
                            background: '#f9fafb',
                            borderRadius: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: '14px',
                                color: '#111827',
                                marginBottom: '4px',
                              }}
                            >
                              {item.name}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <button
                                onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                                style={{
                                  width: '24px',
                                  height: '24px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '4px',
                                  background: 'white',
                                  cursor: 'pointer',
                                  fontSize: '14px',
                                }}
                              >
                                -
                              </button>
                              <span
                                style={{
                                  fontSize: '14px',
                                  fontWeight: 600,
                                  color: '#3b82f6',
                                  minWidth: '24px',
                                  textAlign: 'center',
                                }}
                              >
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                                disabled={item.quantity >= item.remaining}
                                style={{
                                  width: '24px',
                                  height: '24px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '4px',
                                  background: item.quantity >= item.remaining ? '#e5e7eb' : 'white',
                                  cursor:
                                    item.quantity >= item.remaining ? 'not-allowed' : 'pointer',
                                  fontSize: '14px',
                                }}
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            style={{
                              padding: '4px 8px',
                              border: 'none',
                              background: 'transparent',
                              color: '#ef4444',
                              cursor: 'pointer',
                              fontSize: '20px',
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>

                    <div
                      style={{
                        padding: '16px',
                        background: '#f0f9ff',
                        borderRadius: '8px',
                        marginBottom: '16px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: '8px',
                        }}
                      >
                        <span style={{ fontSize: '14px', color: '#6b7280' }}>Total Items:</span>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                          {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '14px', color: '#6b7280' }}>Estimated Value:</span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: '#3b82f6' }}>
                          ₦
                          {cartItems
                            .reduce((sum, item) => sum + item.quantity * 500, 0)
                            .toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={processRedemption}
                      disabled={selectedAllocation?.type === 'Fuel' && !meterReading}
                      style={{
                        width: '100%',
                        padding: '14px',
                        border: 'none',
                        borderRadius: '8px',
                        background:
                          !meterReading && selectedAllocation?.type === 'Fuel'
                            ? '#9ca3af'
                            : 'linear-gradient(135deg, #10b981, #059669)',
                        color: 'white',
                        fontSize: '16px',
                        fontWeight: 600,
                        cursor:
                          !meterReading && selectedAllocation?.type === 'Fuel'
                            ? 'not-allowed'
                            : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        transition: 'transform 0.2s',
                      }}
                      onMouseEnter={e => {
                        if (meterReading || selectedAllocation?.type !== 'Fuel') {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }
                      }}
                      onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                    >
                      <Printer size={20} />
                      Process & Print Receipt
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Usage Tracking Tab */}
        {activeTab === 'tracking' && (
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <h3
              style={{
                margin: '0 0 24px 0',
                fontSize: '20px',
                fontWeight: 'bold',
                color: '#111827',
              }}
            >
              Asset Usage Tracking
            </h3>
            <div style={{ textAlign: 'center', padding: '48px', color: '#9ca3af' }}>
              <TrendingUp size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <p style={{ margin: 0, fontSize: '16px' }}>
                Usage analytics and efficiency reports coming soon...
              </p>
            </div>
          </div>
        )}

        {/* Anomalies Tab */}
        {activeTab === 'anomalies' && (
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <h3
              style={{
                margin: '0 0 24px 0',
                fontSize: '20px',
                fontWeight: 'bold',
                color: '#111827',
              }}
            >
              Consumption Anomalies
            </h3>
            <div style={{ textAlign: 'center', padding: '48px', color: '#9ca3af' }}>
              <AlertTriangle size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <p style={{ margin: 0, fontSize: '16px' }}>No anomalies detected</p>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default AllocationRedemptionManager;
