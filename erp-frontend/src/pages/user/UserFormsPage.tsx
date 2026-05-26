import React from 'react';
import FormList from '../../components/user/FormList';
import Layout from '../../components/layout/Layout'; // Your existing layout

const UserFormsPage: React.FC = () => {
  return (
    <Layout>
      <FormList />
    </Layout>
  );
};

export default UserFormsPage;
