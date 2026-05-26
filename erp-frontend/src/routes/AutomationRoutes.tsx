import { Routes, Route, Navigate } from 'react-router-dom';

// Import pages
import { AutomationDashboard } from '../pages/AutomationDashboard';
import { AutomationDetail } from '../pages/AutomationDetail';
import { FormSchemaList } from '../pages/FormSchemaList';
import { FormSchemaDetail } from '../pages/FormSchemaDetail';
import { BusinessFunctionList } from '../pages/BusinessFunctionList';
import { BusinessFunctionDetail } from '../pages/BusinessFunctionDetail';
import { RunList } from '../pages/RunList';
import { RunDetail } from '../pages/RunDetail';

export const AutomationRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<AutomationDashboard />} />
      <Route path="/templates" element={<AutomationDashboard />} />
      <Route path="/templates/:id" element={<AutomationDetail />} />
      <Route path="/forms" element={<FormSchemaList />} />
      <Route path="/forms/:id" element={<FormSchemaDetail />} />
      <Route path="/functions" element={<BusinessFunctionList />} />
      <Route path="/functions/:id" element={<BusinessFunctionDetail />} />
      <Route path="/runs" element={<RunList />} />
      <Route path="/runs/:id" element={<RunDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
