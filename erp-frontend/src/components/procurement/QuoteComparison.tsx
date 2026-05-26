import React, { useState } from 'react';
import {
  CheckCircle,
  Eye,
  ShoppingCart,
  Clock,
  DollarSign,
  Truck,
  Calendar,
  User,
} from 'lucide-react';
import { QuoteComparisonResponse, Quote } from '../../types/quotes';
import { useSelectQuote } from '../../hooks/useProcurement';
import { useToast } from '../../hooks/useToast';

interface QuoteComparisonProps {
  quotes: QuoteComparisonResponse;
  requisitionId: number;
  onQuoteSelected?: (quote: Quote) => void;
  onConvertToPO?: (quote: Quote) => void;
}

const QuoteComparison: React.FC<QuoteComparisonProps> = ({
  quotes,
  requisitionId,
  onQuoteSelected,
  onConvertToPO,
}) => {
  const toast = useToast();
  const selectQuoteMutation = useSelectQuote();
  const [showQuoteModal, setShowQuoteModal] = useState<Quote | null>(null);

  const handleSelectQuote = async (quote: Quote) => {
    try {
      await selectQuoteMutation.mutateAsync({
        id: quote.id,
        data: { comments: `Selected quote from ${quote.supplier_name}` },
      });

      toast.success(`Quote from ${quote.supplier_name} selected successfully!`);
      onQuoteSelected?.(quote);
    } catch (error) {
      console.error('Failed to select quote:', error);
      toast.error('Failed to select quote. Please try again.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'received':
        return '#3b82f6';
      case 'selected':
        return '#10b981';
      case 'rejected':
        return '#ef4444';
      case 'expired':
        return '#6b7280';
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'received':
        return 'Received';
      case 'selected':
        return 'Selected';
      case 'rejected':
        return 'Rejected';
      case 'expired':
        return 'Expired';
      default:
        return status;
    }
  };

  // Extract quotes array from the response object
  const quotesArray = quotes?.quotes || [];

  if (!quotes || !quotesArray || quotesArray.length === 0) {
    return (
      <div
        style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '12px',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <Clock size={48} style={{ color: '#6b7280', margin: '0 auto 16px' }} />
        <h3 style={{ margin: '0 0 8px 0', color: '#1f2937' }}>No Quotes Available</h3>
        <p style={{ margin: 0, color: '#6b7280' }}>
          No suppliers have submitted quotes for this requisition yet.
        </p>
      </div>
    );
  }

  const selectedQuote = quotesArray.find((quote: Quote) => quote.status === 'selected');

  return (
    <div
      style={{
        background: 'white',
        border: '2px solid #e5e7eb',
        borderRadius: '12px',
        padding: '24px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>
          Supplier Quotes ({quotesArray.length})
        </h3>
        {selectedQuote && (
          <button
            onClick={() => onConvertToPO?.(selectedQuote)}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              background: '#8b5cf6',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <ShoppingCart size={16} />
            Convert to PO
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gap: '16px' }}>
        {quotesArray.map((quote: Quote) => {
          const isSelected = quote.status === 'selected';

          return (
            <div
              key={quote.id}
              style={{
                border: `2px solid ${isSelected ? '#10b981' : '#e5e7eb'}`,
                borderRadius: '8px',
                padding: '16px',
                background: isSelected ? '#f0fdf4' : 'white',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '12px',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '8px',
                    }}
                  >
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
                      {quote.supplier_name}
                    </h4>
                    <div
                      style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        background: `${getStatusColor(quote.status)}20`,
                        color: getStatusColor(quote.status),
                        fontSize: '12px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {isSelected && <CheckCircle size={12} />}
                      {getStatusLabel(quote.status)}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: '12px',
                      fontSize: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <DollarSign size={14} style={{ color: '#6b7280' }} />
                      <span style={{ color: '#6b7280' }}>Total:</span>
                      <span style={{ fontWeight: 600, color: '#1f2937' }}>
                        ₦{parseFloat(quote.total_amount).toLocaleString()}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={14} style={{ color: '#6b7280' }} />
                      <span style={{ color: '#6b7280' }}>Valid Until:</span>
                      <span style={{ color: '#1f2937' }}>
                        {new Date(quote.valid_until).toLocaleDateString()}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Truck size={14} style={{ color: '#6b7280' }} />
                      <span style={{ color: '#6b7280' }}>Delivery:</span>
                      <span style={{ color: '#1f2937' }}>
                        {quote.delivery_terms || 'Not specified'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <User size={14} style={{ color: '#6b7280' }} />
                      <span style={{ color: '#6b7280' }}>Payment:</span>
                      <span style={{ color: '#1f2937' }}>
                        {quote.payment_terms || 'Not specified'}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={() => setShowQuoteModal(quote)}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      background: 'white',
                      cursor: 'pointer',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#374151',
                    }}
                  >
                    <Eye size={12} />
                    View Details
                  </button>

                  {!isSelected && quote.status === 'received' && (
                    <button
                      onClick={() => handleSelectQuote(quote)}
                      disabled={selectQuoteMutation.isPending}
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: '6px',
                        background: selectQuoteMutation.isPending ? '#9ca3af' : '#10b981',
                        color: 'white',
                        cursor: selectQuoteMutation.isPending ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <CheckCircle size={12} />
                      Select Quote
                    </button>
                  )}
                </div>
              </div>

              {/* Quote Items Summary */}
              <div
                style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}
              >
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                  Items ({quote.items.length})
                </div>
                <div style={{ display: 'grid', gap: '4px' }}>
                  {quote.items.slice(0, 3).map((item, itemIndex) => (
                    <div
                      key={itemIndex}
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}
                    >
                      <span style={{ color: '#374151' }}>{item.description}</span>
                      <span style={{ color: '#6b7280' }}>
                        {item.quantity} × ₦{parseFloat(item.unit_price).toLocaleString()} = ₦
                        {parseFloat(item.total_price).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {quote.items.length > 3 && (
                    <div style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>
                      +{quote.items.length - 3} more items...
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quote Detail Modal */}
      {showQuoteModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div
              style={{
                padding: '24px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                Quote Details - {showQuoteModal.supplier_name}
              </h3>
              <button
                onClick={() => setShowQuoteModal(null)}
                style={{
                  padding: '8px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  fontSize: '18px',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              {/* Quote Summary */}
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>
                  Quote Summary
                </h4>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                    fontSize: '14px',
                  }}
                >
                  <div>
                    <span style={{ color: '#6b7280' }}>Quote Number:</span>
                    <div style={{ fontWeight: 600 }}>{showQuoteModal.quote_number}</div>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280' }}>Quote Date:</span>
                    <div>{new Date(showQuoteModal.quote_date).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280' }}>Valid Until:</span>
                    <div>{new Date(showQuoteModal.valid_until).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280' }}>Status:</span>
                    <div
                      style={{
                        color: getStatusColor(showQuoteModal.status),
                        fontWeight: 600,
                      }}
                    >
                      {getStatusLabel(showQuoteModal.status)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Quote Items */}
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>Items</h4>
                <div
                  style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr',
                      gap: '12px',
                      padding: '12px',
                      background: '#f9fafb',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#374151',
                    }}
                  >
                    <div>Description</div>
                    <div>Quantity</div>
                    <div>Unit Price</div>
                    <div>Total</div>
                  </div>
                  {showQuoteModal.items.map((item, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 1fr 1fr',
                        gap: '12px',
                        padding: '12px',
                        borderTop: '1px solid #e5e7eb',
                        fontSize: '14px',
                      }}
                    >
                      <div style={{ color: '#1f2937' }}>{item.description}</div>
                      <div style={{ color: '#6b7280' }}>{item.quantity}</div>
                      <div style={{ color: '#6b7280' }}>
                        ₦{parseFloat(item.unit_price).toLocaleString()}
                      </div>
                      <div style={{ color: '#1f2937', fontWeight: 600 }}>
                        ₦{parseFloat(item.total_price).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quote Totals */}
              <div
                style={{
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '16px',
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}
                >
                  <span style={{ color: '#6b7280' }}>Subtotal:</span>
                  <span>₦{parseFloat(showQuoteModal.subtotal).toLocaleString()}</span>
                </div>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}
                >
                  <span style={{ color: '#6b7280' }}>Tax:</span>
                  <span>₦{parseFloat(showQuoteModal.tax_amount).toLocaleString()}</span>
                </div>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}
                >
                  <span style={{ color: '#6b7280' }}>Shipping:</span>
                  <span>₦{parseFloat(showQuoteModal.shipping_cost).toLocaleString()}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingTop: '12px',
                    borderTop: '2px solid #e5e7eb',
                    fontSize: '18px',
                    fontWeight: 700,
                  }}
                >
                  <span>Total:</span>
                  <span>₦{parseFloat(showQuoteModal.total_amount).toLocaleString()}</span>
                </div>
              </div>

              {showQuoteModal.notes && (
                <div style={{ marginTop: '16px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600 }}>Notes</h4>
                  <div
                    style={{
                      padding: '12px',
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '14px',
                      color: '#374151',
                    }}
                  >
                    {showQuoteModal.notes}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuoteComparison;
