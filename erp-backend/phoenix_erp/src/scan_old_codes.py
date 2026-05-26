import os, re
patterns = [
    (r"parent_code='[1-5]\d{2}'", 'old parent_code 3-digit'),
    (r"code='[1-5]\d{2}'", 'old code 3-digit'),
    (r"'[1-5]\d{2}-\d{3}'", 'old dash-notation'),
]
skip_dirs = {'migrations', 'tests', '__pycache__', '.git', 'old_erp'}
for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in skip_dirs]
    for fname in files:
        if not fname.endswith('.py'): continue
        path = os.path.join(root, fname)
        try:
            text = open(path, encoding='utf-8').read()
        except: continue
        for pat, label in patterns:
            for m in re.finditer(pat, text):
                lineno = text[:m.start()].count('\n') + 1
                print(f'{path}:{lineno}: [{label}] {m.group()}')
