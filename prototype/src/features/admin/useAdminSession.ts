import { useCallback } from 'react';
import type { Role } from '../../model';
import { useAppServices } from '../AppServicesContext';
import { useRemoteState } from '../useRemoteState';

export const useAdminSession = (role: Role) => {
  const { adminApi } = useAppServices();
  const load = useCallback(() => adminApi.getMe(), [adminApi, role]);
  return useRemoteState(load);
};

export const hasPermissions = (available: string[], required: string[]) => required.every(code => available.includes(code));
