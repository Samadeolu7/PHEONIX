# notifications/api/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    NotificationViewSet, NotificationTemplateViewSet,
    NotificationPreferenceViewSet
)

router = DefaultRouter()
router.register('notifications', NotificationViewSet, basename='notification')
router.register('templates', NotificationTemplateViewSet, basename='notification-template')
router.register('preferences', NotificationPreferenceViewSet, basename='notification-preference')

urlpatterns = [
    path('', include(router.urls)),
]

# Approval notification template example
# notifications/templates/approval_request.html

"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #3b82f6; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9fafb; }
        .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background: #10b981; 
            color: white; 
            text-decoration: none; 
            border-radius: 6px;
            margin: 10px 5px;
        }
        .reject-button { background: #ef4444; }
        .details { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
        .label { font-weight: bold; color: #6b7280; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Approval Required</h1>
        </div>
        
        <div class="content">
            <p>You have a pending approval request:</p>
            
            <div class="details">
                <p><span class="label">Workflow:</span> {{ workflow_name }}</p>
                <p><span class="label">Reference:</span> {{ run_reference }}</p>
                <p><span class="label">Message:</span> {{ approval_message }}</p>
                <p><span class="label">Submitted by:</span> {{ submitted_by }}</p>
                <p><span class="label">Timeout:</span> {{ timeout_at }}</p>
            </div>
            
            <div class="details">
                <h3>Transaction Details</h3>
                {% for key, value in form_data.items %}
                    <p><span class="label">{{ key }}:</span> {{ value }}</p>
                {% endfor %}
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="{{ approval_url }}" class="button">
                    Approve Request
                </a>
                <a href="{{ approval_url }}" class="button reject-button">
                    Reject Request
                </a>
            </div>
            
            <p style="font-size: 12px; color: #6b7280; text-align: center;">
                Or view in your dashboard: <a href="{{ dashboard_url }}">{{ dashboard_url }}</a>
            </p>
        </div>
    </div>
</body>
</html>
"""
    