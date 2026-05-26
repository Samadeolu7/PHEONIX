# pages/tests/test_page_report_form_integration.py
"""
Test that pages module correctly guides frontend to reports and forms
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from pages.models import Module, ModulePage
from reports.models import ReportTemplate, ReportCategory
from automations.models import FormSchema
from branches.models import Branch, Tenant

User = get_user_model()


class PageReportFormIntegrationTest(TestCase):
    """Test that page configurations correctly lead to reports and forms"""
    
    def setUp(self):
        """Set up test data"""
        # Create tenant, branch, and user
        self.tenant = Tenant.objects.create(
            name='Test School',
            subdomain='test-school'
        )
        
        self.branch = Branch.objects.create(
            tenant=self.tenant,
            name='Main Branch',
            code='main'
        )
        
        self.user = User.objects.create_user(
            email='test@school.com',
            password='testpass123',
            tenant=self.tenant,
            branch=self.branch,
            role='admin'
        )
        
        # Create module
        self.module = Module.objects.create(
            code='test_module',
            name='Test Module',
            icon='test',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create report
        self.category = ReportCategory.objects.create(
            code='test',
            name='Test Category',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.report = ReportTemplate.objects.create(
            code='test_report_001',
            name='Test Report',
            category=self.category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            report_config={
                'data_sources': [{'type': 'model', 'model': 'Transaction'}],
                'columns': [{'field': 'amount', 'label': 'Amount'}]
            }
        )
        
        # Create form schema
        self.form_schema = FormSchema.objects.create(
            name='Test Form',
            description='Test form description',
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            schema={
                'fields': [
                    {
                        'name': 'amount',
                        'type': 'number',
                        'label': 'Amount',
                        'required': True
                    }
                ]
            }
        )
        
        # Create report page
        self.report_page = ModulePage.objects.create(
            module=self.module,
            code='test_report_page',
            title='Test Report Page',
            page_type='report',
            page_config={
                'report_id': self.report.id,
                'report_code': self.report.code,
                'default_parameters': {
                    'start_date': 'current_month_start',
                    'end_date': 'today'
                },
                'show_export': True,
                'show_refresh': True
            },
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create form page
        self.form_page = ModulePage.objects.create(
            module=self.module,
            code='test_form_page',
            title='Test Form Page',
            page_type='form',
            page_config={
                'form_schema_id': self.form_schema.id,
                'submitEndpoint': '/api/form-submissions/',
                'successUrl': '/test/success'
            },
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
    
    def test_get_report_page_config(self):
        """Test getting report page configuration"""
        response = self.client.get(
            f'/api/module-pages/by-path/?path={self.report_page.url_path}'
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()['data']
        
        # Verify page type
        self.assertEqual(data['page_type'], 'report')
        
        # Verify page config has required fields
        config = data['page_config']
        self.assertIn('report_id', config)
        self.assertIn('report_code', config)
        self.assertIn('default_parameters', config)
        self.assertEqual(config['report_id'], self.report.id)
        self.assertEqual(config['report_code'], self.report.code)
    
    def test_get_report_by_id_from_page_config(self):
        """Test that report_id from page_config can fetch the report"""
        # Get page config
        page_response = self.client.get(
            f'/api/module-pages/by-path/?path={self.report_page.url_path}'
        )
        report_id = page_response.json()['data']['page_config']['report_id']
        
        # Fetch report using the ID
        report_response = self.client.get(
            f'/api/reports/templates/{report_id}/'
        )
        
        self.assertEqual(report_response.status_code, 200)
        report_data = report_response.json()
        self.assertEqual(report_data['id'], self.report.id)
        self.assertEqual(report_data['code'], self.report.code)
    
    def test_get_report_by_code_from_page_config(self):
        """Test that report_code from page_config can fetch the report"""
        # Get page config
        page_response = self.client.get(
            f'/api/module-pages/by-path/?path={self.report_page.url_path}'
        )
        report_code = page_response.json()['data']['page_config']['report_code']
        
        # Fetch report using the code
        report_response = self.client.get(
            f'/api/reports/templates/by-code/{report_code}/'
        )
        
        self.assertEqual(report_response.status_code, 200)
        report_data = report_response.json()['data']
        self.assertEqual(report_data['code'], self.report.code)
        self.assertEqual(report_data['id'], self.report.id)
    
    def test_execute_report_from_page_config(self):
        """Test executing report using config from page"""
        # Get page config
        page_response = self.client.get(
            f'/api/module-pages/by-path/?path={self.report_page.url_path}'
        )
        config = page_response.json()['data']['page_config']
        
        # Execute report using run endpoint
        report_response = self.client.get(
            f'/api/reports/templates/{config["report_id"]}/run/',
            {'start_date': '2025-01-01', 'end_date': '2025-12-28'}
        )
        
        self.assertEqual(report_response.status_code, 200)
        result = report_response.json()
        self.assertTrue(result['success'])
        self.assertIn('data', result)
        self.assertIn('metadata', result)
    
    def test_get_form_page_config(self):
        """Test getting form page configuration"""
        response = self.client.get(
            f'/api/module-pages/by-path/?path={self.form_page.url_path}'
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()['data']
        
        # Verify page type
        self.assertEqual(data['page_type'], 'form')
        
        # Verify page config has required fields
        config = data['page_config']
        self.assertIn('form_schema_id', config)
        self.assertIn('submitEndpoint', config)
        self.assertEqual(config['form_schema_id'], self.form_schema.id)
        self.assertEqual(config['submitEndpoint'], '/api/form-submissions/')
    
    def test_get_form_schema_from_page_config(self):
        """Test that form_schema_id from page_config can fetch the form"""
        # Get page config
        page_response = self.client.get(
            f'/api/module-pages/by-path/?path={self.form_page.url_path}'
        )
        form_schema_id = page_response.json()['data']['page_config']['form_schema_id']
        
        # Fetch form schema using the ID
        form_response = self.client.get(
            f'/api/forms/{form_schema_id}/'
        )
        
        self.assertEqual(form_response.status_code, 200)
        form_data = form_response.json()
        self.assertEqual(form_data['id'], self.form_schema.id)
    
    def test_submit_form_using_page_config(self):
        """Test submitting form using endpoint from page config"""
        # Get page config
        page_response = self.client.get(
            f'/api/module-pages/by-path/?path={self.form_page.url_path}'
        )
        config = page_response.json()['data']['page_config']
        
        # Submit form using the endpoint
        submit_response = self.client.post(
            config['submitEndpoint'],
            {
                'form_schema_id': config['form_schema_id'],
                'data': {
                    'amount': 5000
                }
            },
            format='json'
        )
        
        self.assertEqual(submit_response.status_code, 201)
        submission_data = submit_response.json()
        self.assertEqual(submission_data['form_schema'], self.form_schema.id)
    
    def test_navigation_includes_all_pages(self):
        """Test that navigation endpoint includes all pages with correct configs"""
        response = self.client.get('/api/modules/navigation/')
        
        self.assertEqual(response.status_code, 200)
        modules = response.json()['data']
        
        # Find our test module
        test_module = next(
            (m for m in modules if m['code'] == 'test_module'),
            None
        )
        
        self.assertIsNotNone(test_module)
        self.assertEqual(len(test_module['pages']), 2)
        
        # Verify pages are present
        page_codes = [p['code'] for p in test_module['pages']]
        self.assertIn('test_report_page', page_codes)
        self.assertIn('test_form_page', page_codes)
    
    def test_invalid_report_config_validation(self):
        """Test that pages with invalid report config are caught"""
        # Try to create page without report_id or report_code
        with self.assertRaises(Exception):  # Should raise ValidationError
            ModulePage.objects.create(
                module=self.module,
                code='invalid_report',
                title='Invalid Report',
                page_type='report',
                page_config={
                    # Missing both report_id and report_code
                    'default_parameters': {}
                },
                owner=self.user,
                branch=self.branch,
                created_by=self.user
            )
    
    def test_invalid_form_config_validation(self):
        """Test that pages with invalid form config are caught"""
        # Try to create page without form_schema_id
        with self.assertRaises(Exception):  # Should raise ValidationError
            ModulePage.objects.create(
                module=self.module,
                code='invalid_form',
                title='Invalid Form',
                page_type='form',
                page_config={
                    # Missing form_schema_id
                    'submitEndpoint': '/api/form-submissions/'
                },
                owner=self.user,
                branch=self.branch,
                created_by=self.user
            )
