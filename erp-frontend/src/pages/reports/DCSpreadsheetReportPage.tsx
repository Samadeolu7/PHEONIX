import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet } from 'lucide-react';

export default function DCSpreadsheetReportPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Daily Contribution Spreadsheet</h1>
          <p className="text-sm text-gray-500 mt-1">Monthly grid view of all daily contribution payments.</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <FileSpreadsheet className="w-12 h-12 text-blue-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">
            Use the <strong>Thrift Spreadsheet</strong> page to view the monthly grid
            of daily contributions with tick marks for each paid day.
          </p>
          <button
            onClick={() => navigate('/savings/thrift/spreadsheet')}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Open Thrift Spreadsheet
          </button>
        </div>
      </div>
    </div>
  );
}
