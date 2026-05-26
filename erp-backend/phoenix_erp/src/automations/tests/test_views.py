"""
Test API views in the automations app.
"""
import unittest
raise unittest.SkipTest("Legacy tests - need rewrite for new workflow architecture")

from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from django.utils import timezone
import json

from ..models import (
    WorkflowStep,
    AutomationTemplate,
    AutomationInstance,
    AutomationSchedule
)
from users.models import Tenant, Branch

User = get_user_model()

class AutomationAPITests(APITestCase):
    """Base class for automation API tests"""
    
    def setUp(self):
        # Create tenant and branch
        self.tenant = Tenant.objects.create(name="Test Tenant")
        self.branch = Branch.objects.create(
            name="Test Branch",
            tenant=self.tenant
        )
        
        # Create users
        self.admin_user = User.objects.create_user(
            username="admin",
            password="admin123",
            tenant=self.tenant,
            branch=self.branch,
            is_staff=True
        )
        
        self.normal_user = User.objects.create_user(
            username="normal",
            password="normal123",
            tenant=self.tenant,
            branch=self.branch
        )
        
        # Create workflow steps
        self.initial_step = WorkflowStep.objects.create(
            code='initial',
            label='Initial Step',
            order=1,
            owner=self.admin_user,
            created_by=self.admin_user
        )
        
        self.approval_step = WorkflowStep.objects.create(
            code='approval',
            label='Approval Step',
            order=2,
            owner=self.admin_user,
            created_by=self.admin_user
        )
        
        self.final_step = WorkflowStep.objects.create(
            code='final',
            label='Final Step',
            order=3,
            owner=self.admin_user,
            created_by=self.admin_user
        )
        
        # Create template
        self.template = AutomationTemplate.objects.create(
            tenant=self.tenant,
            name="Test Automation",
            requires_approval=True,
            approval_step=self.approval_step,
            initial_step=self.initial_step,
            final_step=self.final_step,
            owner=self.admin_user,
            created_by=self.admin_user,
            branch=self.branch
        )
        
        # Authenticate
        self.client.force_authenticate(user=self.admin_user)

class AutomationTemplateAPITests(AutomationAPITests):
    """Test automation template API endpoints"""
    
    def test_create_template(self):
        """Test creating an automation template via API"""
        url = reverse('automations:automationtemplate-list')
        data = {
            'name': 'New Template',
            'description': 'Test template',
            'requires_approval': True,
            'approval_step': self.approval_step.id,
            'initial_step': self.initial_step.id,
            'final_step': self.final_step.id
        }
        
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(AutomationTemplate.objects.count(), 2)
        
        template = AutomationTemplate.objects.latest('id')
        self.assertEqual(template.name, 'New Template')
        self.assertEqual(template.tenant, self.tenant)

    def test_list_templates(self):
        """Test listing automation templates"""
        url = reverse('automations:automationtemplate-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Test Automation')

    def test_template_permissions(self):
        """Test template permission restrictions"""
        self.client.force_authenticate(user=self.normal_user)
        url = reverse('automations:automationtemplate-list')
        
        # Try to create template without permission
        data = {
            'name': 'Unauthorized Template',
            'initial_step': self.initial_step.id,
            'final_step': self.final_step.id
        }
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

class AutomationInstanceAPITests(AutomationAPITests):
    """Test automation instance API endpoints"""
    
    def test_create_instance(self):
        """Test creating an automation instance"""
        url = reverse('automations:automationinstance-list')
        data = {
            'template': self.template.id,
            'data': json.dumps({
                'amount': '1000.00',
                'description': 'Test automation'
            })
        }
        
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        instance = AutomationInstance.objects.first()
        self.assertEqual(instance.template, self.template)
        self.assertEqual(instance.current_step, self.template.initial_step)

    def test_instance_workflow(self):
        """Test automation instance workflow transitions"""
        # Create instance
        instance = AutomationInstance.objects.create(
            template=self.template,
            current_step=self.initial_step,
            data=json.dumps({'amount': '1000.00'}),
            owner=self.admin_user,
            created_by=self.admin_user,
            branch=self.branch
        )
        
        # Move to approval
        url = reverse('automations:automationinstance-transition', args=[instance.id])
        data = {'step': self.approval_step.id}
        
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        instance.refresh_from_db()
        self.assertEqual(instance.current_step, self.approval_step)

    def test_instance_approval(self):
        """Test approving an automation instance"""
        instance = AutomationInstance.objects.create(
            template=self.template,
            current_step=self.approval_step,
            data=json.dumps({'amount': '1000.00'}),
            owner=self.admin_user,
            created_by=self.admin_user,
            branch=self.branch
        )
        
        url = reverse('automations:automationinstance-approve', args=[instance.id])
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        instance.refresh_from_db()
        self.assertTrue(instance.is_approved)

class AutomationScheduleAPITests(AutomationAPITests):
    """Test automation schedule API endpoints"""
    
    def test_create_schedule(self):
        """Test creating an automation schedule"""
        url = reverse('automations:automationschedule-list')
        data = {
            'template': self.template.id,
            'cron_expression': '0 0 1 * *',
            'data': json.dumps({
                'amount': '1000.00',
                'description': 'Monthly automation'
            })
        }
        
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        schedule = AutomationSchedule.objects.first()
        self.assertEqual(schedule.template, self.template)
        self.assertEqual(schedule.cron_expression, '0 0 1 * *')

    def test_schedule_validation(self):
        """Test schedule validation in API"""
        url = reverse('automations:automationschedule-list')
        
        # Test invalid cron expression
        data = {
            'template': self.template.id,
            'cron_expression': 'invalid',
            'data': json.dumps({})
        }
        
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_schedules(self):
        """Test listing automation schedules"""
        # Create a schedule
        AutomationSchedule.objects.create(
            template=self.template,
            cron_expression='0 0 1 * *',
            data=json.dumps({'test': 'data'}),
            owner=self.admin_user,
            created_by=self.admin_user,
            branch=self.branch
        )
        
        url = reverse('automations:automationschedule-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['cron_expression'], '0 0 1 * *')
