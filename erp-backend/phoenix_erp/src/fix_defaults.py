import re

with open('inventory/test_approval_workflows.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the botched replacement - restore \\1 to actual field names
replacements = {
    "defaults={'\\1': {": "defaults={",
    "defaults={'\\1': True": "defaults={'require_writeoff_approval': True",
    "defaults={'\\1': False": "defaults={'require_adjustment_approval': False",  
}

for old, new in replacements.items():
    content = content.replace(old, new)
    
# Fix response assignment
content = content.replace("response ':", "response =")

# Fix remaining sales order cases
content = re.sub(r"defaults=\{'\\1':\s*True,\s*'sales_order_approval_threshold':", 
                  r"defaults={'require_sales_order_approval': True, 'sales_order_approval_threshold':",
                  content)
content = re.sub(r"defaults=\{'\\1':\s*True,\s*'adjustment_approval_threshold':", 
                  r"defaults={'require_adjustment_approval': True, 'adjustment_approval_threshold':",
                  content)

with open('inventory/test_approval_workflows.py', 'w', encoding='utf-8') as f:
    f.write(content)
    
print("Fixed properly")
