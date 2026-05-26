// FinancialReportsDemo Component
// Demo component to test the Profit & Loss page functionality

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import ProfitLossPage from '../../pages/financialReports/ProfitLossPage';

const FinancialReportsDemo: React.FC = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 5 * 60 * 1000,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-100">
          <div className="container mx-auto py-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Financial Reports Demo</h1>
              <p className="text-gray-600">
                Testing the Profit & Loss Statement page implementation
              </p>
            </div>

            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <ProfitLossPage />
            </div>
          </div>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default FinancialReportsDemo;
