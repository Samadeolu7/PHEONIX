"""
Comprehensive API tests for automations app.
Tests form submissions, workflow templates, and workflow execution.
"""
from decimal import Decimal
from datetime import date
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from automations.models import (
    FormSchema, FormSubmission, 
    WorkflowTemplate, WorkflowRun, StepExecution
)
from branches.models import Branch
from users.models import Tenant

User = get_user_model()


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class FormSchemaAPITest(TestCase):
    """Test FormSchema API endpoints."""
    
    def setUp(self):
        """Set up test data and API client."""
        self.client = APIClient()
        
        # Create tenant
        self.tenant = Tenant.objects.create(
            name='Test Organization',
            slug='testorg'
        )
        
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MB01'
        )
        
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            tenant=self.tenant,
            branch=self.branch
        )
        
        self.client.force_authenticate(user=self.user)
    
    def test_create_form_schema(self):
        """Test creating a form schema via API."""
        data = {
            'name': 'Loan Application Form',
            'description': 'Form for applying for loans',
            'schema': {
                'fields': [
                    {
                        'id': 'amount',
                        'label': 'Loan Amount',
                        'type': 'money',
                        'validation': {'required': True}
                    },
                    {
                        'id': 'purpose',
                        'label': 'Loan Purpose',
                        'type': 'text',
                        'validation': {'required': True}
                    }
                ]
            },
            'trigger_event_name': 'loan.application.submitted'
        }
        
        response = self.client.post('/api/automations/forms/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(FormSchema.objects.count(), 1)
        
        form = FormSchema.objects.first()
        self.assertEqual(form.name, 'Loan Application Form')
        self.assertEqual(form.owner, self.user)
        self.assertTrue(form.is_active)
    
    def test_list_form_schemas(self):
        """Test listing form schemas via API."""
        # Create test forms
        for i in range(3):
            FormSchema.objects.create(
                name=f'Test Form {i+1}',
                schema={'fields': []},
                owner=self.user,
                branch=self.branch
            )
        
        response = self.client.get('/api/automations/forms/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 3)
    
    def test_form_schema_requires_authentication(self):
        """Test that creating form schema requires authentication."""
        self.client.force_authenticate(user=None)
        
        data = {
            'name': 'Test Form',
            'schema': {'fields': []}
        }
        
        response = self.client.post('/api/automations/forms/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_retrieve_form_schema(self):
        """Test retrieving a single form schema."""
        form = FormSchema.objects.create(
            name='Test Form',
            schema={'fields': []},
            owner=self.user,
            branch=self.branch
        )
        
        response = self.client.get(f'/api/automations/forms/{form.id}/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Test Form')
    
    def test_update_form_schema(self):
        """Test updating a form schema."""
        form = FormSchema.objects.create(
            name='Test Form',
            schema={'fields': []},
            owner=self.user,
            branch=self.branch
        )
        
        data = {
            'name': 'Updated Form Name',
            'is_active': False
        }
        
        response = self.client.patch(f'/api/automations/forms/{form.id}/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        form.refresh_from_db()
        self.assertEqual(form.name, 'Updated Form Name')
        self.assertFalse(form.is_active)
    
    def test_delete_form_schema(self):
        """Test soft-deleting a form schema."""
        form = FormSchema.objects.create(
            name='Test Form',
            schema={'fields': []},
            owner=self.user,
            branch=self.branch
        )
        
        response = self.client.delete(f'/api/automations/forms/{form.id}/')
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        form = FormSchema.all_objects.for_owner(self.user).get(id=form.id)
        self.assertTrue(form.is_deleted)


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class FormSubmissionAPITest(TestCase):
    """Test FormSubmission API endpoints."""
    
    def setUp(self):
        """Set up test data and API client."""
        self.client = APIClient()
        
        # Create tenant
        self.tenant = Tenant.objects.create(
            name='Test Organization',
            slug='testorg'
        )
        
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MB01'
        )
        
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            tenant=self.tenant,
            branch=self.branch
        )
        
        self.form_schema = FormSchema.objects.create(
            name='Test Form',
            schema={
                'fields': [
                    {
                        'id': 'name',
                        'label': 'Name',
                        'type': 'text',
                        'validation': {'required': True}
                    },
                    {
                        'id': 'amount',
                        'label': 'Amount',
                        'type': 'money',
                        'validation': {'required': True}
                    }
                ]
            },
            owner=self.user,
            branch=self.branch
        )
        
        self.client.force_authenticate(user=self.user)
    
    def test_create_form_submission(self):
        """Test creating a form submission via API."""
        data = {
            'form_schema': self.form_schema.id,
            'data': {
                'name': 'John Doe',
                'amount': '5000.00'
            }
        }
        
        response = self.client.post('/api/automations/form-submissions/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(FormSubmission.objects.count(), 1)
        
        submission = FormSubmission.objects.first()
        self.assertEqual(submission.data['name'], 'John Doe')
        self.assertEqual(submission.status, 'submitted')
        self.assertTrue(submission.submission_reference.startswith('SUB-'))
    
    def test_list_form_submissions(self):
        """Test listing form submissions."""
        # Create test submissions
        for i in range(3):
            FormSubmission.objects.create(
                form_schema=self.form_schema,
                data={'name': f'User {i+1}', 'amount': '1000'},
                owner=self.user,
                branch=self.branch
            )
        
        response = self.client.get('/api/automations/form-submissions/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 3)
    
    def test_filter_submissions_by_status(self):
        """Test filtering submissions by status."""
        # Create submissions with different statuses
        FormSubmission.objects.create(
            form_schema=self.form_schema,
            data={'name': 'User 1'},
            status='submitted',
            owner=self.user,
            branch=self.branch
        )
        
        submission2 = FormSubmission.objects.create(
            form_schema=self.form_schema,
            data={'name': 'User 2'},
            owner=self.user,
            branch=self.branch
        )
        submission2.status = 'completed'
        submission2.save()
        
        response = self.client.get('/api/automations/form-submissions/?status=completed')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should have at least 1 completed submission
        self.assertGreaterEqual(len(response.data['results']), 1)


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class WorkflowTemplateAPITest(TestCase):
    """Test WorkflowTemplate API endpoints."""
    
    def setUp(self):
        """Set up test data and API client."""
        self.client = APIClient()
        
        # Create tenant
        self.tenant = Tenant.objects.create(
            name='Test Organization',
            slug='testorg'
        )
        
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MB01'
        )
        
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            tenant=self.tenant,
            branch=self.branch
        )
        
        self.client.force_authenticate(user=self.user)
    
    def test_create_workflow_template(self):
        """Test creating a workflow template via API."""
        data = {
            'name': 'Loan Approval Workflow',
            'description': 'Workflow for approving loan applications',
            'trigger_type': 'event',
            'trigger_config': {
                'event_name': 'loan.application.submitted'
            },
            'workflow_definition': {
                'steps': [
                    {
                        'id': 'step1',
                        'type': 'approval',
                        'config': {'approver_role': 'manager'}
                    },
                    {
                        'id': 'step2',
                        'type': 'notification',
                        'config': {'message': 'Loan approved'}
                    }
                ]
            }
        }
        
        response = self.client.post('/api/automations/workflows/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(WorkflowTemplate.objects.count(), 1)
        
        workflow = WorkflowTemplate.objects.first()
        self.assertEqual(workflow.name, 'Loan Approval Workflow')
        self.assertEqual(workflow.trigger_type, 'event')
        self.assertTrue(workflow.is_active)
    
    def test_list_workflow_templates(self):
        """Test listing workflow templates."""
        for i in range(3):
            WorkflowTemplate.objects.create(
                name=f'Workflow {i+1}',
                trigger_type='manual',
                workflow_definition={'steps': []},
                owner=self.user,
                branch=self.branch
            )
        
        response = self.client.get('/api/automations/workflows/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 3)
    
    def test_filter_workflows_by_trigger_type(self):
        """Test filtering workflows by trigger type."""
        WorkflowTemplate.objects.create(
            name='Manual Workflow',
            trigger_type='manual',
            workflow_definition={'steps': []},
            owner=self.user,
            branch=self.branch
        )
        
        WorkflowTemplate.objects.create(
            name='Event Workflow',
            trigger_type='event',
            workflow_definition={'steps': []},
            owner=self.user,
            branch=self.branch
        )
        
        response = self.client.get('/api/automations/workflows/?trigger_type=manual')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should have at least 1 manual workflow
        self.assertGreaterEqual(len(response.data['results']), 1)
    
    def test_update_workflow_template(self):
        """Test updating a workflow template."""
        workflow = WorkflowTemplate.objects.create(
            name='Test Workflow',
            trigger_type='manual',
            workflow_definition={'steps': []},
            owner=self.user,
            branch=self.branch
        )
        
        data = {
            'name': 'Updated Workflow',
            'is_active': False
        }
        
        response = self.client.patch(f'/api/automations/workflows/{workflow.id}/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        workflow.refresh_from_db()
        self.assertEqual(workflow.name, 'Updated Workflow')
        self.assertFalse(workflow.is_active)
