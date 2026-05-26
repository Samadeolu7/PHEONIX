import React from 'react';
import { useForm } from 'react-hook-form';

// Simple test component to isolate React Hook Form issue
export const TestRHF: React.FC = () => {
  const { register, handleSubmit } = useForm();

  const onSubmit = (data: any) => {
    console.log(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('test')} placeholder="Test input" />
      <button type="submit">Submit</button>
    </form>
  );
};
