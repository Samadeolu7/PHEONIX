import React from 'react';
import Layout from '../../components/layout/Layout';
// Import the FormManagement component from the complete frontend artifact
// You can extract it from the artifact or I can create a separate file
import FormManagement from '../../components/admin/FormManagement';

const AdminFormsPage: React.FC = () => {
  return (
    <Layout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Form Management</h1>
        <FormManagement></FormManagement>
        <p>Use the FormManagement component from the complete frontend system artifact</p>
      </div>
    </Layout>
  );
};

export default AdminFormsPage;
