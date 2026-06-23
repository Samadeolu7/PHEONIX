import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PiggyBank } from 'lucide-react';

export default function ThriftSetupPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Create Daily Contribution Account</h1>
          <p className="text-sm text-gray-500 mt-1">
            Set up a new Thrift / Daily Contribution savings account for a client.
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <PiggyBank className="w-12 h-12 text-blue-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">
            Daily Contribution accounts are created through the standard{' '}
            <strong>New Savings Account</strong> form — simply select a product
            with <em>Daily Contribution</em> enabled.
          </p>
          <button
            onClick={() => navigate('/savings/accounts/create')}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Open New Savings Account Form
          </button>
        </div>
      </div>
    </div>
  );
}
