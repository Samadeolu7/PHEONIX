import React from 'react';
import { useParams } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';
import { api } from '../api/api';

const defaultDashboard = {
  id: 'default',
  name: 'Default Dashboard',
  layout: [],
  widgets: [],
};

const DashboardWrapper: React.FC = () => {
  const { slug } = useParams();
  const [dashboard, setDashboard] = React.useState(defaultDashboard);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loadDashboard = async () => {
      try {
        setIsLoading(true);
        const { data } = await api.get(`/dashboards/${slug || 'default'}`);
        setDashboard(data);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMsg);
        // Fallback to default dashboard on error
        setDashboard(defaultDashboard);
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboard();
  }, [slug]);

  if (isLoading) {
    return <div>Loading dashboard...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return <DashboardPage page={dashboard} />;
};

export { DashboardWrapper };
export default DashboardWrapper;
