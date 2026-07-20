import { useQuery } from '@tanstack/react-query';
import { userManagementService } from '../services/userManagementService';

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
};

export const useUsers = () => {
  return useQuery({
    queryKey: userKeys.lists(),
    queryFn: () => userManagementService.getUsers(),
    staleTime: 60_000,
  });
};
