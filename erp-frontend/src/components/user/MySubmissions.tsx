import React, { useState, useEffect } from 'react';
import { FileText, CheckCircle, Clock, XCircle } from 'lucide-react';
import { FormSubmission } from '../../types/automation.types';
import { automationService } from '../../services/automationService';

const MySubmissions: React.FC = () => {
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubmissions();
  }, []);

  const loadSubmissions = async () => {
    try {
      const data = await automationService.getMySubmissions();
      setSubmissions(data);
    } catch (error: unknown) {
      console.error('Failed to load submissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle style={{ width: '1.25rem', height: '1.25rem', color: '#059669' }} />;
      case 'processing':
        return <Clock style={{ width: '1.25rem', height: '1.25rem', color: '#ca8a04' }} />;
      case 'failed':
        return <XCircle style={{ width: '1.25rem', height: '1.25rem', color: '#dc2626' }} />;
      default:
        return <Clock style={{ width: '1.25rem', height: '1.25rem', color: '#4b5563' }} />;
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'completed':
        return { background: '#d1fae5', color: '#065f46' };
      case 'processing':
        return { background: '#fef3c7', color: '#92400e' };
      case 'failed':
        return { background: '#fee2e2', color: '#991b1b' };
      default:
        return { background: '#f3f4f6', color: '#1f2937' };
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '3rem 0' }}>Loading submissions...</div>;
  }

  return (
    <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '1.5rem' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
        My Submissions
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {submissions.map(submission => (
          <div
            key={submission.id}
            style={{
              background: 'white',
              borderRadius: '0.5rem',
              border: '1px solid #e5e7eb',
              padding: '1.5rem',
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    marginBottom: '0.5rem',
                  }}
                >
                  <h3 style={{ fontWeight: 600, color: '#111827', margin: 0 }}>
                    {submission.form_schema.name}
                  </h3>
                  <span
                    style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      ...getStatusStyle(submission.status),
                    }}
                  >
                    {submission.status}
                  </span>
                </div>
                <p style={{ fontSize: '0.875rem', color: '#4b5563', margin: '0.25rem 0' }}>
                  Reference:{' '}
                  <span style={{ fontFamily: 'monospace', color: '#2563eb' }}>
                    {submission.submission_reference}
                  </span>
                </p>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Submitted: {new Date(submission.submitted_at).toLocaleString()}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {getStatusIcon(submission.status)}
              </div>
            </div>
          </div>
        ))}

        {submissions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: '#6b7280' }}>
            <FileText
              style={{ width: '3rem', height: '3rem', margin: '0 auto 0.75rem', color: '#d1d5db' }}
            />
            <p>No submissions yet. Fill out a form to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MySubmissions;
