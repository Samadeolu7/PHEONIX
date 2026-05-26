import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, TrendingUp, Shield, DollarSign, AlertCircle, Edit2 } from 'lucide-react';

interface Product {
  id: number;
  name: string;
  code: string;
  product_type: string;
  interest_rate?: number;
  minimum_balance?: number;
  daily_transaction_limit?: number;
  monthly_transaction_limit?: number;
  overdraft_limit?: number;
  description?: string;
}

interface ProductConfigWidgetProps {
  productType: 'SAVINGS' | 'LOAN' | 'EXPENSE';
  selectedProductId?: number;
  onProductSelect: (productId: number) => void;
  showDetails?: boolean;
  compact?: boolean;
}

/**
 * Reusable Product Configuration Widget
 * Displays product selection dropdown and shows product details/limits
 */
export const ProductConfigWidget: React.FC<ProductConfigWidgetProps> = ({
  productType,
  selectedProductId,
  onProductSelect,
  showDetails = true,
  compact = false,
}) => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts();
  }, [productType]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/products/?product_type=${productType}&is_active=true`);
      if (!response.ok) throw new Error('Failed to fetch products');
      const data = await response.json();
      setProducts(data.results || data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load products');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const selectedProduct = products.find(p => p.id === selectedProductId);

  const getProductTypeLabel = () => {
    switch (productType) {
      case 'SAVINGS':
        return 'Savings Product';
      case 'LOAN':
        return 'Loan Product';
      case 'EXPENSE':
        return 'Expense Product';
      default:
        return 'Product';
    }
  };

  const getProductTypeColor = () => {
    switch (productType) {
      case 'SAVINGS':
        return '#10b981';
      case 'LOAN':
        return '#f59e0b';
      case 'EXPENSE':
        return '#ef4444';
      default:
        return '#3b82f6';
    }
  };

  const color = getProductTypeColor();

  if (loading) {
    return (
      <div style={{ padding: compact ? '8px' : '12px', textAlign: 'center', color: '#6b7280' }}>
        Loading products...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: '12px',
          background: '#fee',
          border: '1px solid #fcc',
          borderRadius: '8px',
          color: '#c00',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '14px',
        }}
      >
        <AlertCircle size={16} />
        {error}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div
        style={{
          padding: '16px',
          background: '#f9fafb',
          border: '2px dashed #d1d5db',
          borderRadius: '8px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
          No active {productType.toLowerCase()} products available
        </div>
        <button
          type="button"
          onClick={() => navigate('/products')}
          style={{
            padding: '6px 12px',
            border: 'none',
            borderRadius: '6px',
            background: color,
            color: 'white',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          Create Product
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Product Selector */}
      <div style={{ marginBottom: showDetails && selectedProduct ? '16px' : 0 }}>
        <label
          style={{
            display: 'block',
            fontWeight: 600,
            marginBottom: '8px',
            color: '#374151',
            fontSize: compact ? '13px' : '14px',
          }}
        >
          {getProductTypeLabel()} *
        </label>
        <select
          value={selectedProductId || ''}
          onChange={e => onProductSelect(Number(e.target.value))}
          style={{
            width: '100%',
            padding: compact ? '8px 10px' : '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: compact ? '13px' : '14px',
            background: 'white',
          }}
        >
          <option value="">Select a {productType.toLowerCase()} product...</option>
          {products.map(product => (
            <option key={product.id} value={product.id}>
              {product.name} ({product.code})
              {product.interest_rate && ` - ${product.interest_rate}%`}
              {product.daily_transaction_limit &&
                ` - ₦${product.daily_transaction_limit.toLocaleString()}/day`}
            </option>
          ))}
        </select>

        <div
          style={{
            fontSize: compact ? '11px' : '12px',
            color: '#6b7280',
            marginTop: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Info size={12} />
          {productType === 'EXPENSE'
            ? 'Defines spending limits and approval requirements'
            : 'Defines interest rates, limits, and account features'}
        </div>
      </div>

      {/* Product Details Card */}
      {showDetails && selectedProduct && (
        <div
          style={{
            background: `${color}08`,
            border: `2px solid ${color}30`,
            borderRadius: '8px',
            padding: compact ? '12px' : '16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <div
              style={{
                fontWeight: 600,
                color: color,
                fontSize: compact ? '13px' : '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Shield size={16} />
              Product Configuration
            </div>
            <button
              type="button"
              onClick={() => window.open(`/products?edit=${selectedProduct.id}`, '_blank')}
              style={{
                padding: '4px 8px',
                border: `1px solid ${color}`,
                borderRadius: '4px',
                background: 'white',
                color: color,
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Edit product configuration"
            >
              <Edit2 size={12} />
              Edit
            </button>
          </div>

          {selectedProduct.description && (
            <div
              style={{
                fontSize: compact ? '12px' : '13px',
                color: '#6b7280',
                marginBottom: '12px',
                fontStyle: 'italic',
              }}
            >
              {selectedProduct.description}
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: compact ? '1fr' : 'auto 1fr',
              gap: compact ? '6px' : '8px 16px',
              fontSize: compact ? '12px' : '13px',
            }}
          >
            {/* Interest Rate */}
            {selectedProduct.interest_rate && (
              <>
                <div
                  style={{
                    color: '#6b7280',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <TrendingUp size={14} />
                  Interest Rate:
                </div>
                <div style={{ color: '#111827', fontWeight: 600 }}>
                  {selectedProduct.interest_rate}% per annum
                </div>
              </>
            )}

            {/* Minimum Balance */}
            {selectedProduct.minimum_balance && (
              <>
                <div
                  style={{
                    color: '#6b7280',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <DollarSign size={14} />
                  Min Balance:
                </div>
                <div style={{ color: '#111827', fontWeight: 600 }}>
                  ₦{selectedProduct.minimum_balance.toLocaleString()}
                </div>
              </>
            )}

            {/* Daily Limit */}
            {selectedProduct.daily_transaction_limit && (
              <>
                <div
                  style={{
                    color: '#6b7280',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Shield size={14} />
                  Daily Limit:
                </div>
                <div style={{ color: '#111827', fontWeight: 600 }}>
                  ₦{selectedProduct.daily_transaction_limit.toLocaleString()}
                </div>
              </>
            )}

            {/* Monthly Limit */}
            {selectedProduct.monthly_transaction_limit && (
              <>
                <div
                  style={{
                    color: '#6b7280',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Shield size={14} />
                  Monthly Limit:
                </div>
                <div style={{ color: '#111827', fontWeight: 600 }}>
                  ₦{selectedProduct.monthly_transaction_limit.toLocaleString()}
                </div>
              </>
            )}

            {/* Overdraft */}
            {selectedProduct.overdraft_limit && (
              <>
                <div style={{ color: '#6b7280', fontWeight: 500 }}>Overdraft Allowed:</div>
                <div style={{ color: '#111827', fontWeight: 600 }}>
                  ₦{selectedProduct.overdraft_limit.toLocaleString()}
                </div>
              </>
            )}
          </div>

          {/* Validation Warnings */}
          {(selectedProduct.daily_transaction_limit ||
            selectedProduct.monthly_transaction_limit) && (
            <div
              style={{
                marginTop: '12px',
                padding: '8px 10px',
                background: `${color}15`,
                borderRadius: '6px',
                fontSize: compact ? '11px' : '12px',
                color: color,
                display: 'flex',
                alignItems: 'start',
                gap: '6px',
              }}
            >
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>
                Transactions will be automatically validated against these limits. Violations will
                trigger <strong>validation error notifications</strong>.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductConfigWidget;
