import React, { useState, useEffect } from 'react';
import { ArrowLeft, Edit, Trash2, RefreshCw, ExternalLink } from 'lucide-react';
import { api } from '../../services/api';

// Field Group Component
function FieldGroup({ label, value, type = 'text', badge = null }: any) {
  const formatValue = () => {
    if (value === null || value === undefined) return '-';

    switch (type) {
      case 'currency':
        return typeof value === 'number'
          ? value.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })
          : value;

      case 'date':
        return new Date(value).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

      case 'datetime':
        return new Date(value).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

      case 'link':
        return (
          <a
            href={value.url || '#'}
            className="text-blue-600 hover:text-blue-700 flex items-center space-x-1"
            target={value.external ? '_blank' : undefined}
            rel={value.external ? 'noopener noreferrer' : undefined}
          >
            <span>{value.text || value}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        );

      case 'email':
        return (
          <a href={`mailto:${value}`} className="text-blue-600 hover:text-blue-700">
            {value}
          </a>
        );

      case 'phone':
        return (
          <a href={`tel:${value}`} className="text-blue-600 hover:text-blue-700">
            {value}
          </a>
        );

      default:
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
  };

  return (
    <div className="py-3">
      <dt className="text-sm font-medium text-gray-500 mb-1">{label}</dt>
      <dd className="text-base text-gray-900 flex items-center space-x-2">
        <span>{formatValue()}</span>
        {badge && (
          <span
            className={`px-2 py-1 rounded-full text-xs font-semibold ${
              badge.color === 'green'
                ? 'bg-green-100 text-green-800'
                : badge.color === 'yellow'
                  ? 'bg-yellow-100 text-yellow-800'
                  : badge.color === 'red'
                    ? 'bg-red-100 text-red-800'
                    : badge.color === 'blue'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-800'
            }`}
          >
            {badge.text}
          </span>
        )}
      </dd>
    </div>
  );
}

// Related Table Component
function RelatedTable({ title, data, columns }: any) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        <p className="text-sm text-gray-500 text-center py-8">No data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col: any) => (
                <th
                  key={col.field}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((row: any, index: number) => (
              <tr key={row.id || index} className="hover:bg-gray-50">
                {columns.map((col: any) => (
                  <td key={col.field} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {col.type === 'currency' && typeof row[col.field] === 'number'
                      ? row[col.field].toLocaleString('en-NG', {
                          style: 'currency',
                          currency: 'NGN',
                        })
                      : row[col.field]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Main DetailPageRenderer Component
export default function DetailPageRenderer({ config }: any) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (config?.endpoint) {
      fetchData();
    }
  }, [config?.endpoint]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get(config.endpoint);
      const payload = response.data || response;
      setData(payload.data || payload);
    } catch (err: any) {
      setError(err?.message || 'Failed to load data');
      console.error('DetailPageRenderer error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleEdit = () => {
    console.log('Edit clicked', data);
    // Implement edit logic here
  };

  const handleDelete = () => {
    console.log('Delete clicked', data);
    // Implement delete logic here
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading {config?.entity || 'details'}...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto mt-8 p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-900 mb-2">Error Loading Data</h2>
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto mt-8 p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <p className="text-yellow-800">No data found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Back Button */}
      {config?.showBackButton !== false && (
        <button
          onClick={() => window.history.back()}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
      )}

      {/* Header Card */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {config?.titleField
                ? (data as any)?.[config.titleField]
                : (data as any)?.name || (data as any)?.title || 'Detail View'}
            </h1>
            {config?.subtitleFields && (
              <div className="flex items-center space-x-3 text-sm text-gray-500">
                {config.subtitleFields.map((field: any, index: number) => (
                  <React.Fragment key={field}>
                    {index > 0 && <span>•</span>}
                    <span>{data[field]}</span>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            {config?.actions?.edit && (
              <button
                onClick={handleEdit}
                className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                title="Edit"
              >
                <Edit className="w-5 h-5" />
              </button>
            )}

            {config?.actions?.delete && (
              <button
                onClick={handleDelete}
                className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Field Groups */}
      {config?.fieldGroups &&
        config.fieldGroups.map((group: any, groupIndex: number) => (
          <div key={groupIndex} className="bg-white rounded-lg shadow p-6">
            {group.title && (
              <h2 className="text-xl font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-200">
                {group.title}
              </h2>
            )}

            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 divide-y divide-gray-200">
              {group.fields.map((field: any) => (
                <FieldGroup
                  key={field.field}
                  label={field.label}
                  value={data[field.field]}
                  type={field.type}
                  badge={
                    field.badge
                      ? {
                          text: data[field.badge.field],
                          color: field.badge.colorMap?.[data[field.badge.field]] || 'gray',
                        }
                      : null
                  }
                />
              ))}
            </dl>
          </div>
        ))}

      {/* Related Tables */}
      {config?.relatedTables &&
        config.relatedTables.map((table: any, tableIndex: number) => (
          <RelatedTable
            key={tableIndex}
            title={table.title}
            data={data[table.field]}
            columns={table.columns}
          />
        ))}
    </div>
  );
}
