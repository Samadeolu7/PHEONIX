import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar } from 'lucide-react';

export default function ThriftMonthlyPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Activate Monthly Contribution</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure a monthly savings contribution schedule for a client.
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <Calendar className="w-12 h-12 text-blue-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">
            Monthly contribution schedules are managed on the{' '}
            <strong>Savings Account</strong> detail page. Open the client's savings
            account and use the <em>Contribution Schedule</em> tab to activate
            or modify their monthly plan.
          </p>
          <button
            onClick={() => navigate('/savings/accounts')}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Go to Savings Accounts
          </button>
        </div>
      </div>
    </div>
  );
}
