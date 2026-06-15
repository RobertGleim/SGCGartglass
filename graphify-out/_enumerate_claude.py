"""
Enumerate meaningful .claude config files: agents, commands, skills, CLAUDE.md.
Writes the file list to .graphify_uncached.txt for the extraction stage.
"""
from pathlib import Path

root = Path(r'C:\Users\rglei\.claude')
out_path = Path(r'C:\Users\rglei\OneDrive\Desktop\Sgcg\graphify-out\.graphify_uncached.txt')

# Dirs to include (skip security=runtime state, memory=empty, helpers=minor)
include_dirs = ['agents', 'commands', 'skills']
doc_extensions = {'.md', '.yaml', '.yml'}

files = []

# Root-level markdown only
for f in root.iterdir():
    if f.is_file() and f.suffix == '.md':
        files.append(f)

# Included subdirs - markdown and yaml only
for d_name in include_dirs:
    d = root / d_name
    if not d.exists():
        continue
    for f in d.rglob('*'):
        if f.is_file() and f.suffix in doc_extensions:
            files.append(f)

files.sort()

with open(out_path, 'w') as fh:
    for f in files:
        fh.write(str(f) + '\n')

print(f"Total: {len(files)} files")
by_dir = {}
for f in files:
    rel = f.relative_to(root)
    top = rel.parts[0] if len(rel.parts) > 1 else '(root)'
    by_dir[top] = by_dir.get(top, 0) + 1
for d, c in sorted(by_dir.items()):
    print(f"  {d}: {c}")
