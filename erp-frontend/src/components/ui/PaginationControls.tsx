import React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
  showInfo?: boolean;
  maxVisiblePages?: number;
}

const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  loading = false,
  showInfo = true,
  maxVisiblePages = 7,
}) => {
  if (totalPages <= 1) return null;

  const getVisiblePages = () => {
    const pages: (number | string)[] = [];

    if (totalPages <= maxVisiblePages) {
      // Show all pages if total is less than max
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      const startPage = Math.max(2, currentPage - Math.floor(maxVisiblePages / 2));
      const endPage = Math.min(totalPages - 1, startPage + maxVisiblePages - 3);

      // Add ellipsis after first page if needed
      if (startPage > 2) {
        pages.push('...');
      }

      // Add middle pages
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }

      // Add ellipsis before last page if needed
      if (endPage < totalPages - 1) {
        pages.push('...');
      }

      // Always show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const visiblePages = getVisiblePages();
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const buttonStyle = {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    background: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'all 0.2s ease',
    minWidth: '40px',
    justifyContent: 'center',
  };

  const activeButtonStyle = {
    ...buttonStyle,
    background: '#3b82f6',
    color: 'white',
    borderColor: '#3b82f6',
  };

  const disabledButtonStyle = {
    ...buttonStyle,
    opacity: 0.5,
    cursor: 'not-allowed',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        alignItems: 'center',
        marginTop: '24px',
      }}
    >
      {showInfo && (
        <div
          style={{
            fontSize: '14px',
            color: '#6b7280',
            textAlign: 'center',
          }}
        >
          Showing {startItem.toLocaleString()} to {endItem.toLocaleString()} of{' '}
          {totalItems.toLocaleString()} results
        </div>
      )}

      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Previous Button */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || loading}
          style={currentPage === 1 || loading ? disabledButtonStyle : buttonStyle}
          onMouseEnter={e => {
            if (currentPage !== 1 && !loading) {
              e.currentTarget.style.background = '#f3f4f6';
            }
          }}
          onMouseLeave={e => {
            if (currentPage !== 1 && !loading) {
              e.currentTarget.style.background = 'white';
            }
          }}
        >
          <ChevronLeft size={16} />
          Previous
        </button>

        {/* Page Numbers */}
        {visiblePages.map((page, index) => (
          <React.Fragment key={index}>
            {page === '...' ? (
              <div
                style={{
                  padding: '8px 4px',
                  color: '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <MoreHorizontal size={16} />
              </div>
            ) : (
              <button
                onClick={() => onPageChange(page as number)}
                disabled={loading}
                style={
                  page === currentPage
                    ? activeButtonStyle
                    : loading
                      ? disabledButtonStyle
                      : buttonStyle
                }
                onMouseEnter={e => {
                  if (page !== currentPage && !loading) {
                    e.currentTarget.style.background = '#f3f4f6';
                  }
                }}
                onMouseLeave={e => {
                  if (page !== currentPage && !loading) {
                    e.currentTarget.style.background = 'white';
                  }
                }}
              >
                {page}
              </button>
            )}
          </React.Fragment>
        ))}

        {/* Next Button */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || loading}
          style={currentPage === totalPages || loading ? disabledButtonStyle : buttonStyle}
          onMouseEnter={e => {
            if (currentPage !== totalPages && !loading) {
              e.currentTarget.style.background = '#f3f4f6';
            }
          }}
          onMouseLeave={e => {
            if (currentPage !== totalPages && !loading) {
              e.currentTarget.style.background = 'white';
            }
          }}
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default PaginationControls;
