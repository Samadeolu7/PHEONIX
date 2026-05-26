"""
Dry-run generator: scan repo for simple Account get/get_or_create patterns
and generate suggestion snippets that call the centralized account creation
utility (`get_or_create_child_account` / `get_or_create_system_account`).

This script does NOT modify source files. It writes a patch-like report to
`ACCOUNT_REPLACEMENTS_DRY_RUN.md` in the workspace root.

Usage:
    python tools/generate_account_replacements.py

IMPORTANT: This script generates SUGGESTIONS only. All replacements must be
manually reviewed before applying to ensure:
1. The `owner`, `branch` variables are in scope
2. Account types and codes are correct
3. The context of the call is appropriate for the utility function
"""
import re
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'ACCOUNT_REPLACEMENTS_DRY_RUN.md'

# ONLY match get_or_create (not plain get, which are lookups)
ACCOUNT_GET_OR_CREATE_PATTERN = re.compile(
    r"Account\.objects\.get_or_create\s*\(",
    re.MULTILINE
)

# Patterns for extracting specific fields
CODE_LITERAL = re.compile(r"code\s*=\s*['\"]([0-9\-]+)['\"]")
NAME_IN_DEFAULTS = re.compile(r"['\"]name['\"]\s*:\s*['\"]([^'\"]+)['\"]")
NAME_AS_ARG = re.compile(r"name\s*=\s*['\"]([^'\"]+)['\"]")
TYPE_IN_DEFAULTS = re.compile(r"['\"]account_type['\"]\s*:\s*['\"]([^'\"]+)['\"]")
TYPE_AS_ARG = re.compile(r"account_type\s*=\s*['\"]([^'\"]+)['\"]")
LEVEL_IN_DEFAULTS = re.compile(r"['\"]account_level['\"]\s*:\s*['\"]([^'\"]+)['\"]")
LEVEL_AS_ARG = re.compile(r"account_level\s*=\s*['\"]([^'\"]+)['\"]")
DESC_IN_DEFAULTS = re.compile(r"['\"]description['\"]\s*:\s*['\"]([^'\"]*)['\"]")

# Valid code ranges per the Account model regex
VALID_PARENT_CODE_RANGE = range(100, 600)

matches = []
warnings = []

def extract_context_snippet(text, start, end, context_lines=3):
    """Extract surrounding lines for context."""
    lines = text[:end].split('\n')
    start_line = max(0, len(lines) - context_lines - 1)
    end_line = min(len(text.split('\n')), len(lines) + context_lines)
    return '\n'.join(text.split('\n')[start_line:end_line])

def validate_code(code):
    """Validate account code format and range."""
    issues = []
    
    if '-' in code:
        # Child account format: parent-suffix
        parts = code.split('-')
        if len(parts) != 2:
            issues.append(f"Invalid child code format: {code} (should be XXX-YYY)")
            return issues
        
        parent, suffix = parts
        try:
            parent_int = int(parent)
            if parent_int not in VALID_PARENT_CODE_RANGE:
                issues.append(f"Parent code {parent} out of valid range (100-599)")
        except ValueError:
            issues.append(f"Parent code {parent} is not numeric")
        
        try:
            suffix_int = int(suffix)
            if len(suffix) != 3:
                issues.append(f"Child suffix {suffix} should be 3 digits (e.g., 001)")
        except ValueError:
            issues.append(f"Child suffix {suffix} is not numeric")
    else:
        # Parent account
        try:
            code_int = int(code)
            if code_int not in VALID_PARENT_CODE_RANGE:
                issues.append(f"Parent code {code} out of valid range (100-599)")
            if len(code) != 3:
                issues.append(f"Parent code {code} should be 3 digits")
        except ValueError:
            issues.append(f"Parent code {code} is not numeric")
    
    return issues

print("Scanning codebase for Account.objects.get_or_create calls (not plain .get lookups)...")

for path in ROOT.rglob('*.py'):
    # Skip virtualenvs, site-packages, migrations, and the utility file itself
    path_str = str(path).lower()
    if any(skip in path_str for skip in ['venv', 'site-packages', 'migrations', '__pycache__', 'account_creation.py']):
        continue
    
    try:
        text = path.read_text(encoding='utf-8', errors='ignore')
    except Exception as e:
        warnings.append(f"Could not read {path}: {e}")
        continue
    
    for m in ACCOUNT_GET_OR_CREATE_PATTERN.finditer(text):
        start_pos = m.start()
        line_no = text.count('\n', 0, start_pos) + 1
        
        # Extract a reasonable chunk after the match (500 chars) to find parameters
        chunk = text[start_pos:start_pos + 500]
        
        # Try to find the matching closing paren (simple heuristic)
        paren_count = 0
        end_pos = start_pos
        for i, char in enumerate(text[start_pos:start_pos + 1000]):
            if char == '(':
                paren_count += 1
            elif char == ')':
                paren_count -= 1
                if paren_count == 0:
                    end_pos = start_pos + i + 1
                    break
        
        if end_pos == start_pos:
            # Couldn't find matching paren - skip
            warnings.append(f"{path.relative_to(ROOT)}:{line_no} - Could not parse complete call")
            continue
        
        full_call = text[start_pos:end_pos]
        
        # Extract fields
        code_m = CODE_LITERAL.search(full_call)
        name_m = NAME_IN_DEFAULTS.search(full_call) or NAME_AS_ARG.search(full_call)
        type_m = TYPE_IN_DEFAULTS.search(full_call) or TYPE_AS_ARG.search(full_call)
        level_m = LEVEL_IN_DEFAULTS.search(full_call) or LEVEL_AS_ARG.search(full_call)
        desc_m = DESC_IN_DEFAULTS.search(full_call)
        
        code = code_m.group(1) if code_m else None
        name = name_m.group(1) if name_m else None
        account_type = type_m.group(1) if type_m else None
        account_level = level_m.group(1) if level_m else None
        description = desc_m.group(1) if desc_m else None
        
        # Validate code if present
        code_issues = []
        if code:
            code_issues = validate_code(code)
        
        context = extract_context_snippet(text, start_pos, end_pos)
        
        matches.append({
            'file': str(path.relative_to(ROOT)),
            'line': line_no,
            'call': full_call[:200] + ('...' if len(full_call) > 200 else ''),
            'context': context,
            'code': code,
            'name': name,
            'account_type': account_type,
            'account_level': account_level,
            'description': description,
            'code_issues': code_issues,
        })

print(f"Found {len(matches)} potential Account.objects calls")
print(f"Writing report to {OUT}...")

# Write comprehensive report
with OUT.open('w', encoding='utf-8') as f:
    f.write('# Account Replacement Dry-Run Report\n\n')
    f.write('⚠️ **IMPORTANT**: This file contains SUGGESTIONS only. ')
    f.write('Each replacement must be manually reviewed and tested.\n\n')
    f.write('## Summary\n\n')
    f.write(f'- Total Account.objects calls found: {len(matches)}\n')
    f.write(f'- Warnings/issues: {len(warnings)}\n\n')
    
    if warnings:
        f.write('## Warnings\n\n')
        for w in warnings:
            f.write(f'- {w}\n')
        f.write('\n')
    
    f.write('## Key Considerations\n\n')
    f.write('1. **Tenant Parameter**: The utility derives `tenant` from `owner.tenant`. ')
    f.write('Ensure your `owner` object has a `tenant` attribute.\n')
    f.write('2. **Variable Scope**: Suggestions assume `owner`, `branch` are in scope. ')
    f.write('Verify this before applying.\n')
    f.write('3. **Account Level**: Parent accounts should use `get_or_create_system_account()`. ')
    f.write('Child accounts should use `get_or_create_child_account()`.\n')
    f.write('4. **Code Validation**: All codes must be in range 100-599 for parents, ')
    f.write('and XXX-YYY format for children.\n\n')
    
    f.write('---\n\n')
    f.write('## Detailed Findings\n\n')
    
    for idx, m in enumerate(matches, 1):
        f.write(f'### Match {idx}\n\n')
        f.write(f"**File**: `{m['file']}`  \n")
        f.write(f"**Line**: {m['line']}  \n\n")
        
        f.write('**Original Call**:\n```python\n')
        f.write(m['call'])
        f.write('\n```\n\n')
        
        f.write('**Context**:\n```python\n')
        f.write(m['context'])
        f.write('\n```\n\n')
        
        f.write('**Extracted Parameters**:\n')
        f.write(f"- Code: `{m['code'] or 'NOT FOUND'}`\n")
        f.write(f"- Name: `{m['name'] or 'NOT FOUND'}`\n")
        f.write(f"- Account Type: `{m['account_type'] or 'NOT FOUND'}`\n")
        f.write(f"- Account Level: `{m['account_level'] or 'NOT FOUND'}`\n")
        f.write(f"- Description: `{m['description'] or 'NOT FOUND'}`\n\n")
        
        # Validation warnings
        if m['code_issues']:
            f.write('⚠️ **VALIDATION WARNINGS**:\n')
            for issue in m['code_issues']:
                f.write(f'- {issue}\n')
            f.write('\n')
        
        # Generate suggestions
        code = m['code']
        name = m['name'] or '<NAME_REQUIRED>'
        acc_type = m['account_type'] or '<TYPE_REQUIRED>'
        description = m['description'] or ''
        
        f.write('**Suggested Replacement**:\n\n')
        
        if not code:
            f.write('❌ **Cannot generate suggestion**: Code is not a literal value. ')
            f.write('Manual review required.\n\n')
        elif m['code_issues']:
            f.write('❌ **Cannot generate suggestion**: Code validation failed. ')
            f.write('Fix validation issues first.\n\n')
        elif '-' in code:
            # Child account
            parent, suffix = code.split('-', 1)
            f.write('```python\n')
            f.write('from accounts.utils.account_creation import get_or_create_child_account\n\n')
            f.write('# Replace with:\n')
            f.write(f"account = get_or_create_child_account(\n")
            f.write(f"    parent_code='{parent}',\n")
            f.write(f"    child_suffix='{suffix}',\n")
            f.write(f"    name='{name}',\n")
            f.write(f"    account_type='{acc_type}',\n")
            f.write(f"    owner=owner,  # ⚠️ Verify this variable exists in scope\n")
            f.write(f"    branch=branch,  # ⚠️ Verify this variable exists in scope\n")
            if description:
                f.write(f"    description='{description}',\n")
            f.write(f"    parent_name='<PARENT_NAME>'  # ⚠️ Provide meaningful parent name\n")
            f.write(')\n')
            f.write('```\n\n')
            f.write('**Notes**:\n')
            f.write('- `tenant` is automatically derived from `owner.tenant`\n')
            f.write('- Update `<PARENT_NAME>` with a meaningful description\n')
            f.write('- Verify `owner` and `branch` variables are in scope\n\n')
        else:
            # Parent account
            f.write('```python\n')
            f.write('from accounts.utils.account_creation import get_or_create_system_account\n\n')
            f.write('# Replace with:\n')
            f.write(f"account = get_or_create_system_account(\n")
            f.write(f"    code='{code}',\n")
            f.write(f"    name='{name}',\n")
            f.write(f"    account_type='{acc_type}',\n")
            f.write(f"    owner=owner,  # ⚠️ Verify this variable exists in scope\n")
            f.write(f"    branch=branch,  # ⚠️ Verify this variable exists in scope\n")
            f.write(f"    account_level='PARENT'\n")
            f.write(')\n')
            f.write('```\n\n')
            f.write('**Notes**:\n')
            f.write('- `tenant` is automatically derived from `owner.tenant`\n')
            f.write('- Verify `owner` and `branch` variables are in scope\n')
            f.write('- Parent accounts typically have `allow_manual_entries=False` ')
            f.write('(enforced by child account requirement)\n\n')
        
        f.write('---\n\n')
    
    f.write('## Next Steps\n\n')
    f.write('1. **Review each suggestion** in the context of its file\n')
    f.write('2. **Verify variable scope** - ensure `owner`, `branch` exist\n')
    f.write('3. **Test changes** in a development environment\n')
    f.write('4. **Update imports** at the top of modified files\n')
    f.write('5. **Run tests** after each batch of changes\n\n')
    f.write('## End of Report\n')

print(f"✅ Report written to {OUT}")
print(f"   Total matches: {len(matches)}")
print(f"   Warnings: {len(warnings)}")
print("\n⚠️  REMEMBER: These are SUGGESTIONS only. Manual review is required!")