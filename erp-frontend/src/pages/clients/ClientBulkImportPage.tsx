// src/pages/clients/ClientBulkImportPage.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Download, ArrowLeft, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { clientService } from '../../services/clientService';

const ClientBulkImportPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    created: number;
    updated: number;
    errors: string[];
  } | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await clientService.downloadImportTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'client_import_template.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err.message || 'Failed to download template');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const response = await clientService.bulkImport(selectedFile);
      setResult(response);
      if (response.errors.length === 0) {
        alert(`Successfully imported ${response.created + response.updated} clients!`);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to import clients');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={() => navigate('/clients')}
          style={{
            padding: '0.5rem',
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: '0.25rem' }}>
            Bulk Import Clients
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            Import multiple clients from a CSV file
          </p>
        </div>
      </div>

      {/* Instructions */}
      <div
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '0.5rem',
          padding: '1.5rem',
          marginBottom: '2rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'start', gap: '0.75rem' }}>
          <AlertCircle
            size={20}
            style={{ color: '#3b82f6', flexShrink: 0, marginTop: '0.125rem' }}
          />
          <div>
            <h3
              style={{
                fontSize: '1rem',
                fontWeight: 600,
                marginBottom: '0.5rem',
                color: '#1e40af',
              }}
            >
              Import Instructions
            </h3>
            <ul
              style={{
                fontSize: '0.875rem',
                color: '#1e40af',
                lineHeight: 1.6,
                paddingLeft: '1.25rem',
              }}
            >
              <li>Download the template CSV file below</li>
              <li>
                Fill in client information (required: first_name, last_name, phone_primary, gender)
              </li>
              <li>Save the file and upload it using the form below</li>
              <li>Existing clients (matched by client_id or phone) will be updated</li>
              <li>New clients will be created automatically</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Download Template */}
      <div
        style={{
          background: 'white',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          padding: '2rem',
          marginBottom: '2rem',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
          Step 1: Download Template
        </h2>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
          Download the CSV template with sample data to get started.
        </p>
        <button
          onClick={handleDownloadTemplate}
          style={{
            padding: '0.75rem 1.5rem',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontWeight: 500,
          }}
        >
          <Download size={18} />
          Download CSV Template
        </button>
      </div>

      {/* Upload File */}
      <div
        style={{
          background: 'white',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          padding: '2rem',
          marginBottom: '2rem',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
          Step 2: Upload Filled CSV
        </h2>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
          Select your filled CSV file and click upload to import clients.
        </p>

        <div
          style={{
            border: '2px dashed #d1d5db',
            borderRadius: '0.5rem',
            padding: '3rem',
            textAlign: 'center',
            marginBottom: '1.5rem',
            background: selectedFile ? '#f0fdf4' : '#f9fafb',
            borderColor: selectedFile ? '#10b981' : '#d1d5db',
          }}
        >
          <Upload
            size={48}
            style={{ margin: '0 auto 1rem', color: selectedFile ? '#10b981' : '#6b7280' }}
          />
          <input
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            style={{
              padding: '0.75rem 1.5rem',
              background: '#3b82f6',
              color: 'white',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontWeight: 500,
              display: 'inline-block',
            }}
          >
            Choose CSV File
          </label>
          {selectedFile && (
            <div
              style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#16a34a', fontWeight: 500 }}
            >
              Selected: {selectedFile.name}
            </div>
          )}
        </div>

        <button
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
          style={{
            padding: '0.75rem 1.5rem',
            background: selectedFile && !uploading ? '#3b82f6' : '#e5e7eb',
            color: selectedFile && !uploading ? 'white' : '#9ca3af',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: selectedFile && !uploading ? 'pointer' : 'not-allowed',
            fontWeight: 500,
            width: '100%',
          }}
        >
          {uploading ? 'Importing...' : 'Import Clients'}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div
          style={{
            background: 'white',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
            padding: '2rem',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>
            Import Results
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <div
              style={{
                padding: '1rem',
                background: '#f0fdf4',
                borderRadius: '0.5rem',
                border: '1px solid #bbf7d0',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <CheckCircle size={20} style={{ color: '#16a34a' }} />
                <span style={{ fontSize: '0.875rem', color: '#15803d', fontWeight: 500 }}>
                  Created
                </span>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#16a34a' }}>
                {result.created}
              </div>
            </div>

            <div
              style={{
                padding: '1rem',
                background: '#fef3c7',
                borderRadius: '0.5rem',
                border: '1px solid #fcd34d',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <CheckCircle size={20} style={{ color: '#f59e0b' }} />
                <span style={{ fontSize: '0.875rem', color: '#b45309', fontWeight: 500 }}>
                  Updated
                </span>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#f59e0b' }}>
                {result.updated}
              </div>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                }}
              >
                <XCircle size={20} style={{ color: '#dc2626' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#dc2626' }}>
                  Errors ({result.errors.length})
                </h3>
              </div>
              <div
                style={{
                  maxHeight: '300px',
                  overflowY: 'auto',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '0.375rem',
                  padding: '1rem',
                }}
              >
                {result.errors.map((error, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontSize: '0.875rem',
                      color: '#991b1b',
                      padding: '0.5rem 0',
                      borderBottom: idx < result.errors.length - 1 ? '1px solid #fecaca' : 'none',
                    }}
                  >
                    {error}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.errors.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <CheckCircle size={48} style={{ color: '#16a34a', margin: '0 auto 1rem' }} />
              <p
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  color: '#16a34a',
                  marginBottom: '0.5rem',
                }}
              >
                Import Successful!
              </p>
              <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                All clients were imported without errors.
              </p>
              <button
                onClick={() => navigate('/clients')}
                style={{
                  marginTop: '1.5rem',
                  padding: '0.75rem 1.5rem',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                View Clients
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientBulkImportPage;
