// ============================================
// File: src/pages/user/UserFormViewPage.tsx
// Simple wrapper for FormView component
// ============================================

import React from 'react';
import FormView from '../../components/user/FormView';
import Layout from '../../components/layout/Layout';

const UserFormViewPage: React.FC = () => {
  return (
    <Layout>
      <FormView />
    </Layout>
  );
};

export default UserFormViewPage;
