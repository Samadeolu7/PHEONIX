import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { ChevronUp, ChevronDown, Search, Filter } from 'lucide-react';

export default function ListPageRenderer({ config }) {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState(null);
  const [sortOrder, setSortOrder] = useState('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchFocus, setSearchFocus] = useState(false);
  const [filterHover, setFilterHover] = useState(false);

  useEffect(() => {
    fetchData();
  }, [config, sortBy, sortOrder]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Build endpoint from config
      const entityName = config.entity.toLowerCase();
      const endpoint = `/${entityName}s/`;

      // In production, build query params from config.filters
      const response = await api.get(endpoint);
      const payload = response.data || response;
      setData(payload.results || payload);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load data';
      setError(errorMsg);
      console.error('ListPageRenderer error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: any) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const handleRowClick = (row: any) => {
    if (config.actions?.rowClickUrl) {
      const url = config.actions.rowClickUrl.replace('{id}', row.id);
      navigate(url); // Use React Router for client-side navigation
    }
  };

  const formatValue = (value: any, type: any) => {
    if (value === null || value === undefined) return '-';

    switch (type) {
      case 'currency':
        return new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN',
        }).format(value);
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'number':
        return new Intl.NumberFormat('en-NG').format(value);
      default:
        return String(value);
    }
  };

  const filteredData = data.filter(row => {
    if (!searchTerm) return true;
    return config.columns.some(col =>
      String(row[col.field]).toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortBy) return 0;
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  if (loading) {
    return (
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '256px' }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            border: '2px solid #3b82f6',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        ></div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          padding: '16px',
        }}
      >
        <p style={{ color: '#991b1b', fontWeight: 500 }}>Error loading data</p>
        <p style={{ color: '#dc2626', fontSize: '14px', marginTop: '4px' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>{config.title}</h1>
          <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
            Showing {sortedData.length} {sortedData.length === 1 ? 'record' : 'records'}
          </p>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ position: 'relative' }}>
            <Search
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '16px',
                height: '16px',
                color: '#9ca3af',
              }}
            />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => setSearchFocus(false)}
              style={{
                paddingLeft: '40px',
                paddingRight: '16px',
                paddingTop: '8px',
                paddingBottom: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                outline: searchFocus ? '2px solid #3b82f6' : 'none',
              }}
            />
          </div>
          <button
            onMouseOver={() => setFilterHover(true)}
            onMouseOut={() => setFilterHover(false)}
            style={{
              padding: '8px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              backgroundColor: filterHover ? '#f9fafb' : 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
            }}
          >
            <Filter style={{ width: '16px', height: '16px' }} />
            <span>Filters</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ backgroundColor: '#f9fafb' }}>
              <tr>
                {config.columns.map((col: any) => (
                  <th
                    key={col.field}
                    onClick={() => col.sortable !== false && handleSort(col.field)}
                    onMouseOver={e =>
                      col.sortable !== false && (e.currentTarget.style.backgroundColor = '#f3f4f6')
                    }
                    onMouseOut={e =>
                      col.sortable !== false &&
                      (e.currentTarget.style.backgroundColor = 'transparent')
                    }
                    style={{
                      padding: '12px 24px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: col.sortable !== false ? 'pointer' : 'default',
                      width: col.width,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>{col.label}</span>
                      {sortBy === col.field &&
                        (sortOrder === 'asc' ? (
                          <ChevronUp style={{ width: '16px', height: '16px' }} />
                        ) : (
                          <ChevronDown style={{ width: '16px', height: '16px' }} />
                        ))}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={{ backgroundColor: 'white' }}>
              {sortedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={config.columns.length}
                    style={{
                      padding: '48px 24px',
                      textAlign: 'center',
                      color: '#6b7280',
                      borderTop: '1px solid #e5e7eb',
                    }}
                  >
                    No data found
                  </td>
                </tr>
              ) : (
                sortedData.map((row: any, index: number) => (
                  <tr
                    key={row.id || index}
                    onClick={() => handleRowClick(row)}
                    onMouseOver={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                    onMouseOut={e => (e.currentTarget.style.backgroundColor = 'white')}
                    style={{
                      cursor: config.actions?.rowClickUrl ? 'pointer' : 'default',
                      borderTop: '1px solid #e5e7eb',
                    }}
                  >
                    {config.columns.map((col: any) => (
                      <td
                        key={`${row.id}-${col.field}`}
                        style={{
                          padding: '16px 24px',
                          whiteSpace: 'nowrap',
                          fontSize: '14px',
                          color: '#111827',
                        }}
                      >
                        {col.field === 'status' ? (
                          <span
                            style={{
                              padding: '4px 8px',
                              display: 'inline-flex',
                              fontSize: '12px',
                              lineHeight: '1.25',
                              fontWeight: 600,
                              borderRadius: '9999px',
                              backgroundColor:
                                row[col.field] === 'Completed'
                                  ? '#d1fae5'
                                  : row[col.field] === 'Failed'
                                    ? '#fee2e2'
                                    : '#fef3c7',
                              color:
                                row[col.field] === 'Completed'
                                  ? '#065f46'
                                  : row[col.field] === 'Failed'
                                    ? '#991b1b'
                                    : '#92400e',
                            }}
                          >
                            {row[col.field]}
                          </span>
                        ) : (
                          formatValue(row[col.field], col.type)
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Example usage with config from backend:
/*
const config = {
  title: 'All Transactions',
  entity: 'Transaction',
  columns: [
    { field: 'id', label: 'ID', sortable: true },
    { field: 'date', label: 'Date', type: 'date' },
    { field: 'amount', label: 'Amount', type: 'currency' },
    { field: 'status', label: 'Status' },
  ],
  actions: {
    rowClickUrl: '/transactions/{id}'
  }
};
*/
