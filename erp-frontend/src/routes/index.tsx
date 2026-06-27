import { createBrowserRouter } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';
import AccountDetailPage from '../pages/AccountsListPage';
import DynamicModulePage from '../pages/DynamicModulePage';
import WorkflowStatusPage from '../pages/WorkflowStatusPage';
import AppLayout from '../components/layout/AppLayout';
import { ThreadInboxPage } from '../components/threads/ThreadInboxPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        path: '/',
        element: <DashboardPage />,
      },

      // Discussions inbox
      {
        path: '/threads',
        element: <ThreadInboxPage />,
      },

      // Workflow status page
      {
        path: '/workflows/:workflowId',
        element: <WorkflowStatusPage />,
      },

      // Account detail page
      {
        path: '/accounts/:accountId',
        element: <AccountDetailPage />,
      },

      // Dynamic module pages (uses renderers)
      {
        path: '/:moduleCode/:pageCode',
        element: <DynamicModulePage />,
      },

      // Add other routes...
    ],
  },
]);
