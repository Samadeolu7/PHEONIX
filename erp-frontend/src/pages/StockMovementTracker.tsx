import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Package, AlertTriangle, BarChart3, Filter } from 'lucide-react';
import { api } from '../services/api';

const StockMovementTracker = () => {
  const [movements, setMovements] = useState<any[]>([]);
  const [stockLevels, setStockLevels] = useState<any[]>([]);
  const [filterType, setFilterType] = useState('all');
  const [filterLocation, setFilterLocation] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load data from APIs
  useEffect(() => {
    loadMovements();
    loadStockLevels();
  }, [filterType, filterLocation, dateFrom, dateTo]);

  const loadMovements = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = {};
      if (filterType !== 'all') params.movement_type = filterType;
      if (filterLocation !== 'all') params.location = filterLocation;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const response = await api.get('/inventory/stock-movements/', params);
      if (response.success) {
        setMovements(response.data || response.results || []);
      }
    } catch (err) {
      console.error('Failed to load movements:', err);
      setError('Failed to load stock movements');
    } finally {
      setLoading(false);
    }
  };

  const loadStockLevels = async () => {
    try {
      const params: Record<string, any> = {};
      if (filterLocation !== 'all') params.location = filterLocation;

      const response = await api.get('/inventory/stock/', params);
      if (response.success) {
        setStockLevels(response.data || response.results || []);
      }
    } catch (err) {
      console.error('Failed to load stock levels:', err);
    }
  };

  const getMovementIcon = (type: string) => {
    const icons = {
      purchase: TrendingUp,
      sale: TrendingDown,
      transfer: Package,
      adjustment: AlertTriangle,
      return_in: TrendingUp,
      return_out: TrendingDown,
    };
    return icons[type] || Package;
  };

  const getMovementColor = (type: string) => {
    const colors = {
      purchase: '#10b981',
      sale: '#ef4444',
      transfer: '#3b82f6',
      adjustment: '#f59e0b',
      return_in: '#10b981',
      return_out: '#ef4444',
    };
    return colors[type] || '#6b7280';
  };

  const filteredMovements = movements.filter(movement => {
    if (filterType !== 'all' && movement.movement_type !== filterType) return false;
    if (filterLocation !== 'all') {
      const locationMatch =
        movement.from_location?.code === filterLocation ||
        movement.to_location?.code === filterLocation;
      if (!locationMatch) return false;
    }
    if (dateFrom && movement.date < dateFrom) return false;
    if (dateTo && movement.date > dateTo) return false;
    return true;
  });

  const totalInventoryValue = stockLevels.reduce((sum, stock) => sum + stock.total_value, 0);
  const itemsNeedingReorder = stockLevels.filter(s => s.needs_reorder).length;
  const totalQuantityOnHand = stockLevels.reduce((sum, stock) => sum + stock.quantity_on_hand, 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '24px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1
            style={{ margin: '0 0 8px 0', fontSize: '32px', fontWeight: 'bold', color: '#111827' }}
          >
            Inventory Tracking
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
            Monitor stock movements and inventory levels
          </p>
        </div>

        {/* Stats Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '20px',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start',
                marginBottom: '12px',
              }}
            >
              <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: 500 }}>Total Value</div>
              <BarChart3 size={20} style={{ color: '#3b82f6' }} />
            </div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#111827' }}>
              ₦{totalInventoryValue.toLocaleString()}
            </div>
            <div style={{ fontSize: '12px', color: '#10b981', marginTop: '4px' }}>
              Across all locations
            </div>
          </div>

          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start',
                marginBottom: '12px',
              }}
            >
              <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: 500 }}>
                Items on Hand
              </div>
              <Package size={20} style={{ color: '#10b981' }} />
            </div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#111827' }}>
              {totalQuantityOnHand}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              Units in stock
            </div>
          </div>

          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start',
                marginBottom: '12px',
              }}
            >
              <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: 500 }}>
                Needs Reorder
              </div>
              <AlertTriangle size={20} style={{ color: '#f59e0b' }} />
            </div>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 'bold',
                color: itemsNeedingReorder > 0 ? '#f59e0b' : '#10b981',
              }}
            >
              {itemsNeedingReorder}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              Items below reorder level
            </div>
          </div>

          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start',
                marginBottom: '12px',
              }}
            >
              <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: 500 }}>
                Movements Today
              </div>
              <TrendingUp size={20} style={{ color: '#8b5cf6' }} />
            </div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#111827' }}>
              {movements.length}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              Total transactions
            </div>
          </div>
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
              { id: 'movements', label: 'Stock Movements' },
              { id: 'levels', label: 'Current Levels' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  /* Tab switching logic */
                }}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '8px',
                  background: tab.id === 'movements' ? '#3b82f6' : 'transparent',
                  color: tab.id === 'movements' ? 'white' : '#6b7280',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Filter size={18} style={{ color: '#6b7280' }} />
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#374151' }}>
              Filters
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#6b7280',
                }}
              >
                Movement Type
              </label>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              >
                <option value="all">All Types</option>
                <option value="purchase">Purchase</option>
                <option value="sale">Sale</option>
                <option value="transfer">Transfer</option>
                <option value="adjustment">Adjustment</option>
                <option value="return_in">Return In</option>
                <option value="return_out">Return Out</option>
              </select>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#6b7280',
                }}
              >
                Location
              </label>
              <select
                value={filterLocation}
                onChange={e => setFilterLocation(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              >
                <option value="all">All Locations</option>
                <option value="WH-001">Main Warehouse</option>
                <option value="STR-001">School Store</option>
              </select>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#6b7280',
                }}
              >
                Date From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '2px solid #e5e7eb',
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
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#6b7280',
                }}
              >
                Date To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
            </div>
          </div>
        </div>

        {/* Stock Movements Table */}
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            overflow: 'hidden',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ padding: '20px', borderBottom: '2px solid #e5e7eb' }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Stock Movements</h3>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                    }}
                  >
                    Date
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                    }}
                  >
                    Type
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                    }}
                  >
                    Item
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                    }}
                  >
                    From
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                    }}
                  >
                    To
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'right',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                    }}
                  >
                    Quantity
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'right',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                    }}
                  >
                    Value
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                    }}
                  >
                    Reference
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.map(movement => {
                  const Icon = getMovementIcon(movement.movement_type);
                  const color = getMovementColor(movement.movement_type);

                  return (
                    <tr
                      key={movement.id}
                      style={{ borderBottom: '1px solid #e5e7eb', transition: 'background 0.2s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                    >
                      <td style={{ padding: '16px', fontSize: '14px', color: '#374151' }}>
                        {new Date(movement.date).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Icon size={16} style={{ color }} />
                          <span style={{ fontSize: '14px', fontWeight: 500, color }}>
                            {movement.movement_type.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div
                          style={{
                            fontWeight: 500,
                            fontSize: '14px',
                            color: '#111827',
                            marginBottom: '2px',
                          }}
                        >
                          {movement.item.name}
                        </div>
                        <div
                          style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}
                        >
                          {movement.item.sku}
                        </div>
                      </td>
                      <td style={{ padding: '16px', fontSize: '13px', color: '#6b7280' }}>
                        {movement.from_location?.code || '-'}
                      </td>
                      <td style={{ padding: '16px', fontSize: '13px', color: '#6b7280' }}>
                        {movement.to_location?.code || '-'}
                      </td>
                      <td
                        style={{
                          padding: '16px',
                          textAlign: 'right',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: '#111827',
                        }}
                      >
                        {movement.quantity > 0 ? '+' : ''}
                        {movement.quantity}
                      </td>
                      <td
                        style={{
                          padding: '16px',
                          textAlign: 'right',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: '#111827',
                        }}
                      >
                        ₦{movement.total_cost.toLocaleString()}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            background: '#f3f4f6',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            fontWeight: 500,
                          }}
                        >
                          {movement.reference}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Current Stock Levels */}
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ padding: '20px', borderBottom: '2px solid #e5e7eb' }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Current Stock Levels</h3>
          </div>

          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {stockLevels.map(stock => (
              <div
                key={stock.id}
                style={{
                  padding: '20px',
                  background: stock.needs_reorder ? '#fef3c7' : '#f9fafb',
                  borderRadius: '8px',
                  border: stock.needs_reorder ? '2px solid #f59e0b' : '2px solid #e5e7eb',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start',
                    marginBottom: '16px',
                  }}
                >
                  <div>
                    <h4
                      style={{
                        margin: '0 0 4px 0',
                        fontSize: '16px',
                        fontWeight: 600,
                        color: '#111827',
                      }}
                    >
                      {stock.item.name}
                    </h4>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '13px',
                        color: '#6b7280',
                        fontFamily: 'monospace',
                      }}
                    >
                      {stock.item.sku} • {stock.location.name}
                    </p>
                  </div>
                  {stock.needs_reorder && (
                    <span
                      style={{
                        padding: '6px 12px',
                        background: '#f59e0b',
                        color: 'white',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <AlertTriangle size={14} />
                      REORDER NOW
                    </span>
                  )}
                </div>

                <div
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#9ca3af',
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                      }}
                    >
                      On Hand
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827' }}>
                      {stock.quantity_on_hand}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#9ca3af',
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                      }}
                    >
                      Reserved
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#f59e0b' }}>
                      {stock.quantity_reserved}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#9ca3af',
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                      }}
                    >
                      Available
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#10b981' }}>
                      {stock.quantity_available}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#9ca3af',
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                      }}
                    >
                      Avg Cost
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#6b7280' }}>
                      ₦{stock.average_cost.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#9ca3af',
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                      }}
                    >
                      Total Value
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#3b82f6' }}>
                      ₦{stock.total_value.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ marginTop: '16px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '6px',
                    }}
                  >
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>Stock Level</span>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: stock.needs_reorder ? '#f59e0b' : '#10b981',
                      }}
                    >
                      {((stock.quantity_on_hand / stock.item.reorder_level) * 100).toFixed(0)}%
                    </span>
                  </div>
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
                        width: `${Math.min(100, (stock.quantity_on_hand / stock.item.reorder_level) * 100)}%`,
                        height: '100%',
                        background: stock.needs_reorder
                          ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                          : 'linear-gradient(90deg, #10b981, #059669)',
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockMovementTracker;
