import type { ReactNode } from 'react';
import { useApp } from '../../model';
import { useAdminSession, hasPermissions } from './useAdminSession';

export function PermissionGate({ required, fallback, children }: { required: string[]; fallback: ReactNode; children: ReactNode }) {
  const { role } = useApp();
  const session = useAdminSession(role);
  if (session.status !== 'ready' || !session.data || !hasPermissions(session.data.permission_codes, required)) return <>{fallback}</>;
  return <>{children}</>;
}
