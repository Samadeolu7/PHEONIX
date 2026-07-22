import { FormSubmission } from '@/types/automation.types';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { automationService } from '../../services/automationService';
import { CheckCircle, Clock, XCircle } from 'lucide-react';

const SubmissionManagement: React.FC = () => {
  const { data: submissions = [], isLoading } = useQuery<FormSubmission[]>({
    queryKey: ['automation-submissions'],
    queryFn: () => automationService.getSubmissions(),
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'processing':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Form Submissions</h2>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : (
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Reference
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Form
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Submitted
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {submissions.map(submission => (
              <tr key={submission.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-mono text-blue-600">
                  {submission.submission_reference}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">{submission.form_schema.name}</td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {new Date(submission.submitted_at).toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(submission.status)}
                    <span className="text-sm capitalize">{submission.status}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                    View Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
};

export default SubmissionManagement;
