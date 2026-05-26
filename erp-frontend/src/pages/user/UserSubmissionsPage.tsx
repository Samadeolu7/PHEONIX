// ============================================
// File: src/pages/user/UserSubmissionsPage.tsx
// Simple wrapper for MySubmissions component
// ============================================

import React from 'react';
import MySubmissions from '../../components/user/MySubmissions';
import Layout from '../../components/layout/Layout';

const UserSubmissionsPage: React.FC = () => {
  return (
    <Layout>
      <MySubmissions />
    </Layout>
  );
};

export default UserSubmissionsPage;
