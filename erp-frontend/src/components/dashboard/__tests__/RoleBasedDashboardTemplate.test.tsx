// Test for role-based dashboard template system
import { describe, it, expect } from 'vitest';
import {
  dashboardTemplateEngine,
  moduleVisibilityService,
} from '../../../services/dashboardTemplateEngine';
import { dashboardTemplates, rolePermissionMappings } from '../../../data/dashboardTemplates';
import { UserRole } from '../../../types/roles';

describe('Role-Based Dashboard Template System', () => {
  describe('Dashboard Templates', () => {
    it('should have templates for all user roles', () => {
      const roles: UserRole[] = ['Director', 'Principal', 'Administrator', 'Registrar', 'Officer'];

      roles.forEach(role => {
        expect(dashboardTemplates[role]).toBeDefined();
        expect(dashboardTemplates[role].role).toBe(role);
        expect(dashboardTemplates[role].name).toContain(role);
      });
    });

    it('should have role permission mappings for all roles', () => {
      const roles: UserRole[] = ['Director', 'Principal', 'Administrator', 'Registrar', 'Officer'];

      roles.forEach(role => {
        expect(rolePermissionMappings[role]).toBeDefined();
        expect(rolePermissionMappings[role].role).toBe(role);
        expect(Array.isArray(rolePermissionMappings[role].permissions)).toBe(true);
        expect(Array.isArray(rolePermissionMappings[role].modules)).toBe(true);
      });
    });

    it('should have different module access for different roles', () => {
      const directorModules = rolePermissionMappings['Director'].modules;
      const officerModules = rolePermissionMappings['Officer'].modules;
      const registrarModules = rolePermissionMappings['Registrar'].modules;

      // Director should have access to all modules
      expect(directorModules).toContain('financial');
      expect(directorModules).toContain('client-services');
      expect(directorModules).toContain('operations');
      expect(directorModules).toContain('administration');

      // Officer should not have administration access
      expect(officerModules).toContain('financial');
      expect(officerModules).toContain('client-services');
      expect(officerModules).not.toContain('administration');

      // Registrar should focus on Client Services
      expect(registrarModules).toContain('client-services');
      expect(registrarModules).toContain('financial');
      expect(registrarModules).not.toContain('operations');
      expect(registrarModules).not.toContain('administration');
    });
  });

  describe('Dashboard Template Engine', () => {
    it('should generate template for Director role', () => {
      const template = dashboardTemplateEngine.generateTemplateForRole('Director');

      expect(template).toBeDefined();
      expect(template.role).toBe('Director');
      expect(template.name).toBe('Director Dashboard');
      expect(template.primaryModules).toContain('financial');
      expect(template.primaryModules).toContain('administration');
      expect(Array.isArray(template.statsCards)).toBe(true);
      expect(Array.isArray(template.quickActions)).toBe(true);
    });

    it('should generate template for Officer role', () => {
      const template = dashboardTemplateEngine.generateTemplateForRole('Officer');

      expect(template).toBeDefined();
      expect(template.role).toBe('Officer');
      expect(template.name).toBe('Officer Dashboard');
      expect(template.primaryModules).toContain('financial');
      expect(template.primaryModules).toContain('client-services');
      expect(template.primaryModules).not.toContain('administration');
      expect(template.showModuleStats).toBe(false); // Officers have simplified view
    });

    it('should generate template for Registrar role', () => {
      const template = dashboardTemplateEngine.generateTemplateForRole('Registrar');

      expect(template).toBeDefined();
      expect(template.role).toBe('Registrar');
      expect(template.name).toBe('Registrar Dashboard');
      expect(template.primaryModules).toContain('client-services');
      expect(template.secondaryModules).toContain('financial');
      expect(template.showAlerts).toBe(false); // Registrars have fewer alerts
    });

    it('should filter content by permissions', () => {
      const mockContent = [
        { id: 'item1', permissions: ['financial.invoice_generation'] },
        { id: 'item2', permissions: ['admin.system_settings'] },
        { id: 'item3' }, // No permissions required
      ];

      const officerPermissions = rolePermissionMappings['Officer'].permissions;
      const filtered = dashboardTemplateEngine.filterContentByPermissions(
        mockContent,
        officerPermissions
      );

      // Officer should have access to financial operations but not admin
      expect(filtered.some(item => item.id === 'item1')).toBe(true);
      expect(filtered.some(item => item.id === 'item3')).toBe(true);
      expect(filtered.some(item => item.id === 'item2')).toBe(false);
    });
  });

  describe('Module Visibility Service', () => {
    it('should return correct visible modules for Director', () => {
      const visibleModules = moduleVisibilityService.getVisibleModules('Director');

      expect(visibleModules).toContain('financial');
      expect(visibleModules).toContain('client-services');
      expect(visibleModules).toContain('operations');
      expect(visibleModules).toContain('administration');
    });

    it('should return correct visible modules for Officer', () => {
      const visibleModules = moduleVisibilityService.getVisibleModules('Officer');

      expect(visibleModules).toContain('financial');
      expect(visibleModules).toContain('client-services');
      expect(visibleModules).toContain('operations');
      expect(visibleModules).not.toContain('administration');
    });

    it('should return correct primary modules for each role', () => {
      const directorPrimary = moduleVisibilityService.getPrimaryModules('Director');
      const registrarPrimary = moduleVisibilityService.getPrimaryModules('Registrar');
      const adminPrimary = moduleVisibilityService.getPrimaryModules('Administrator');

      expect(directorPrimary).toEqual([
        'financial',
        'client-services',
        'operations',
        'administration',
      ]);
      expect(registrarPrimary).toEqual(['client-services']);
      expect(adminPrimary).toEqual(['administration', 'financial']);
    });

    it('should check module visibility correctly', () => {
      expect(moduleVisibilityService.isModuleVisible('Director', 'administration')).toBe(true);
      expect(moduleVisibilityService.isModuleVisible('Officer', 'administration')).toBe(false);
      expect(moduleVisibilityService.isModuleVisible('Registrar', 'client-services')).toBe(true);
      expect(moduleVisibilityService.isModuleVisible('Registrar', 'operations')).toBe(false);
    });
  });

  describe('Template Inheritance', () => {
    it('should have inheritance relationships', () => {
      const roles: UserRole[] = ['Director', 'Principal', 'Administrator', 'Registrar', 'Officer'];

      roles.forEach(role => {
        const template = dashboardTemplates[role];
        expect(template.inheritsFrom).toBe('base-template');
      });
    });

    it('should have role-specific themes', () => {
      const directorTemplate = dashboardTemplates['Director'];
      const registrarTemplate = dashboardTemplates['Registrar'];
      const adminTemplate = dashboardTemplates['Administrator'];

      expect(directorTemplate.theme.primaryColor).toBe('#6366f1');
      expect(registrarTemplate.theme.primaryColor).toBe('#059669');
      expect(adminTemplate.theme.primaryColor).toBe('#6b7280');
    });

    it('should have role-specific stats cards', () => {
      const directorTemplate = dashboardTemplates['Director'];
      const officerTemplate = dashboardTemplates['Officer'];

      // Director should have system health stats
      expect(directorTemplate.statsCards.some(card => card.id === 'system-health')).toBe(true);

      // Officer should have daily transaction stats
      expect(officerTemplate.statsCards.some(card => card.id === 'daily-transactions')).toBe(true);
    });

    it('should have role-specific quick actions', () => {
      const directorTemplate = dashboardTemplates['Director'];
      const registrarTemplate = dashboardTemplates['Registrar'];

      // Director should have user management actions
      expect(directorTemplate.quickActions.some(action => action.id === 'user-management')).toBe(
        true
      );

      // Registrar should have student entitlement actions
      expect(
        registrarTemplate.quickActions.some(action => action.id === 'student-entitlements')
      ).toBe(true);
    });
  });

  describe('Stats Card System', () => {
    it('should scale stats based on module permissions', () => {
      const directorTemplate = dashboardTemplateEngine.generateTemplateForRole('Director');
      const officerTemplate = dashboardTemplateEngine.generateTemplateForRole('Officer');

      // Director should have more stats cards due to broader permissions
      expect(directorTemplate.statsCards.length).toBeGreaterThan(officerTemplate.statsCards.length);
    });

    it('should prioritize stats cards correctly', () => {
      const template = dashboardTemplateEngine.generateTemplateForRole('Director');

      // Stats should be sorted by priority (higher priority first)
      for (let i = 0; i < template.statsCards.length - 1; i++) {
        expect(template.statsCards[i].priority).toBeGreaterThanOrEqual(
          template.statsCards[i + 1].priority
        );
      }
    });

    it('should have appropriate stats for each role', () => {
      const registrarTemplate = dashboardTemplateEngine.generateTemplateForRole('Registrar');
      const adminTemplate = dashboardTemplateEngine.generateTemplateForRole('Administrator');

      // Registrar should have student-focused stats
      expect(
        registrarTemplate.statsCards.some(card => card.category === 'Student Management')
      ).toBe(true);

      // Administrator should have system-focused stats
      expect(adminTemplate.statsCards.some(card => card.category === 'System Administration')).toBe(
        true
      );
    });
  });
});
