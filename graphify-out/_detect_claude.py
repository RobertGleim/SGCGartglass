import json
from pathlib import Path
from graphify.detect import detect
import inspect

root = Path(r'C:\Users\rglei\.claude')

# First: no excludes, just check total
result_all = detect(root)
print("=== No excludes ===")
files_all = result_all.get('files', {})
print(f"files type: {type(files_all).__name__}, count: {len(files_all)}")
print(f"total_files: {result_all.get('total_files')}")
print(f"total_words: {result_all.get('total_words')}")

# Peek at a few file entries
if isinstance(files_all, dict):
    for k, v in list(files_all.items())[:3]:
        print(f"  key={repr(k)[:80]} val_type={type(v).__name__} val={repr(v)[:80]}")
elif isinstance(files_all, list):
    for v in files_all[:3]:
        print(f"  {repr(v)[:100]}")
