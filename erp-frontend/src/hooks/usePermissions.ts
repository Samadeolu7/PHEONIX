// src/hooks/usePermissions.ts
import { useCallback, useState, useEffect } from 'react';
import { permissionService, EffectivePermission, PageAction, PagePermission } from '@/services/permissionService';

export const usePermission = () => {
  const [permissions, setPermissions] = useState<string[]>(permissionService.getPermissions());
  const [scope, setScope] = useState<string>(permissionService.getScope());
  const [isElevated, setIsElevated] = useState<boolean>(permissionService.isElevated());
  const [pageMatrixVersion, setPageMatrixVersion] = useState<number>(0);

  useEffect(() => {
    const refresh = () => {
      setPermissions(permissionService.getPermissions());
      setScope(permissionService.getScope());
      setIsElevated(permissionService.isElevated());
      setPageMatrixVersion(v => v + 1);
    };

    const handleStorage = (e: StorageEvent) => {
      if (['userPermissions', 'userScope', 'hasElevatedOverride', 'pageMatrix'].includes(e.key ?? '')) {
        refresh();
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('permissions:updated', refresh);
    window.addEventListener('permissions:cleared', refresh);

    refresh();

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('permissions:updated', refresh);
      window.removeEventListener('permissions:cleared', refresh);
    };
  }, []);

  const hasPermission = useCallback(
    (permissionCode: string): boolean => permissionService.hasPermission(permissionCode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permissions]
  );

  const hasAnyPermission = useCallback(
    (permissionCodes: string[]): boolean =>
      permissionCodes.some(code => permissionService.hasPermission(code)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permissions]
  );

  const hasAllPermissions = useCallback(
    (permissionCodes: string[]): boolean =>
      permissionCodes.every(code => permissionService.hasPermission(code)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permissions]
  );

  const getScope = useCallback(() => permissionService.getScope(), [scope]);

  const hasGlobalScope = useCallback(() => permissionService.hasGlobalScope(), [scope]);

  const getApprovalLimit = useCallback(
    () => permissionService.getApprovalLimit(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permissions]
  );

  const canApproveAmount = useCallback(
    (amount: number) => permissionService.canApproveAmount(amount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permissions]
  );

  const getElevatedFields = useCallback(
    () => permissionService.getElevatedFields(),
    [isElevated]
  );

  const getEffectivePermissions = useCallback(
    (): EffectivePermission | null => permissionService.getEffectivePermissions(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permissions]
  );

  const hasPageAccess = useCallback(
    (module: string, page: string, action: PageAction = 'view'): boolean =>
      permissionService.hasPageAccess(module, page, action),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageMatrixVersion]
  );

  const resolvePageAccess = useCallback(
    (module: string, page: string, action: PageAction = 'view'): 'allow' | 'deny' | 'unknown' =>
      permissionService.resolvePageAccess(module, page, action),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageMatrixVersion]
  );

  const getPagePermissions = useCallback(
    (): Record<string, PagePermission> => permissionService.getPagePermissions(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageMatrixVersion]
  );

  const hasAnyPageAccessInModule = useCallback(
    (module: string): boolean => permissionService.hasAnyPageAccessInModule(module),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageMatrixVersion]
  );

  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    // Scope
    scope,
    getScope,
    hasGlobalScope,
    // Approval limits
    getApprovalLimit,
    canApproveAmount,
    // Elevation
    isElevated,
    getElevatedFields,
    getEffectivePermissions,
    // Page-level (module:page) matrix
    hasPageAccess,
    resolvePageAccess,
    getPagePermissions,
    hasAnyPageAccessInModule,
  };
};

