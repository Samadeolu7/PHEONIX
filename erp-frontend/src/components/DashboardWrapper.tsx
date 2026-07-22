import React from 'react';
import { useParams } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';
import { api } from '../api/api';
import { useQuery } from '@tanstack/react-query';

const defaultDashboard = {
  id: 'default',
  name: 'Default Dashboard',
  layout: [],
  widgets: [],
};

const DashboardWrapper: React.FC = () => {
  const { slug } = useParams();
  const resolvedSlug = slug || 'default';

  const { data: dashboard, isLoading, error } = useQuery({
    queryKey: ['dashboard', resolvedSlug],
    queryFn: async () => {
      const { data } = await api.get(`/dashboards/${resolvedSlug}`);
      return data;
    },
    placeholderData: defaultDashboard,
    retry: false,
  });

  if (isLoading) {
    return <div>Loading dashboard...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return <DashboardPage page={dashboard} />;
};

export { DashboardWrapper };
export default DashboardWrapper;
