import json
from pathlib import Path
from graphify.detect import detect

root = Path(r'C:\Users\rglei\.claude')
result = detect(root)

with open(r'C:\Users\rglei\OneDrive\Desktop\Sgcg\graphify-out\.graphify_detect.json', 'w') as f:
    json.dump(result, f, default=str)

files = result.get('files', [])
by_type = {}
for f in files:
    ft = f.get('file_type', 'unknown')
    by_type[ft] = by_type.get(ft, 0) + 1

print(f"Total files: {len(files)}")
for ft, count in sorted(by_type.items(), key=lambda x: -x[1]):
    print(f"  {ft}: {count}")

# estimate tokens
total_tokens = sum(f.get('tokens', 0) for f in files)
total_words = sum(f.get('words', 0) for f in files)
print(f"Total tokens (est): {total_tokens:,}")
print(f"Total words: {total_words:,}")
