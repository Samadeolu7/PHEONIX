"""
Script to fix user.owner pattern across all apps.
User IS the owner, not a child attribute.
"""
import os
import re

def fix_user_owner_in_file(filepath):
    """Replace request.user.owner with request.user in a file"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        
        # Replace patterns
        content = content.replace('self.request.user.owner', 'self.request.user')
        content = content.replace('request.user.owner', 'request.user')
        
        if content != original_content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        return False
    except Exception as e:
        print(f"Error processing {filepath}: {e}")
        return False

def main():
    """Fix user.owner pattern in all Python files"""
    src_dir = os.path.dirname(os.path.abspath(__file__))
    
    files_to_fix = [
        'assets/views.py',
        'hr/views.py',
        'receivables/views.py',
        'transactions/views.py',
        'incomes/views.py',
    ]
    
    fixed_count = 0
    for file_path in files_to_fix:
        full_path = os.path.join(src_dir, file_path)
        if os.path.exists(full_path):
            if fix_user_owner_in_file(full_path):
                print(f"✅ Fixed: {file_path}")
                fixed_count += 1
            else:
                print(f"⏭️  No changes needed: {file_path}")
        else:
            print(f"❌ Not found: {file_path}")
    
    print(f"\n✅ Fixed {fixed_count} files")

if __name__ == '__main__':
    main()
