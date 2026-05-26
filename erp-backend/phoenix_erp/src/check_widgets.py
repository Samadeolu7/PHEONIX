#!/usr/bin/env python
"""Check Widget Layout Structure"""
import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from dashboards.models import Widget

# Check dashboard widgets (not navigation/sidebar)
dashboard_widgets = Widget.objects.filter(
    widget_type__in=['kpi', 'line_chart', 'bar_chart', 'table', 'pie_chart']
)

print(f"Dashboard widgets (KPI/Charts/Tables): {dashboard_widgets.count()}")
print()

valid = 0
invalid = []

for widget in dashboard_widgets:
    has_config = bool(widget.config)
    has_layout = 'layout' in widget.config if has_config else False
    
    if has_config and has_layout:
        valid += 1
    else:
        invalid.append(f"{widget.title} ({widget.widget_type})")

print(f"✓ Widgets with proper layout: {valid}/{dashboard_widgets.count()}")

if invalid:
    print(f"\n✗ Widgets missing layout ({len(invalid)}):")
    for w in invalid[:5]:
        print(f"  - {w}")
else:
    print("\n✓✓✓ All dashboard widgets have proper layout structure!")

# Show sample
print("\nSample widget config:")
sample = dashboard_widgets.first()
if sample and sample.config:
    print(json.dumps(sample.config, indent=2))
