"""
Split .graphify_uncached.txt into chunks and print chunk metadata.
"""
import json
from pathlib import Path

uncached_path = Path(r'C:\Users\rglei\OneDrive\Desktop\Sgcg\graphify-out\.graphify_uncached.txt')
out_dir = Path(r'C:\Users\rglei\OneDrive\Desktop\Sgcg\graphify-out\cache')
out_dir.mkdir(exist_ok=True)

files = [l.strip() for l in uncached_path.read_text().splitlines() if l.strip()]
print(f"Total files to process: {len(files)}")

CHUNK_SIZE = 20
chunks = [files[i:i+CHUNK_SIZE] for i in range(0, len(files), CHUNK_SIZE)]
print(f"Chunks: {len(chunks)} (size {CHUNK_SIZE})")

chunk_meta = []
for i, chunk in enumerate(chunks):
    chunk_path = out_dir / f"sem_chunk_{i+1:02d}.json"
    meta = {
        "chunk_num": i + 1,
        "total_chunks": len(chunks),
        "files": chunk,
        "chunk_path": str(chunk_path),
    }
    chunk_meta.append(meta)
    print(f"  Chunk {i+1}: {len(chunk)} files -> {chunk_path.name}")

with open(r'C:\Users\rglei\OneDrive\Desktop\Sgcg\graphify-out\.graphify_chunks.json', 'w') as f:
    json.dump(chunk_meta, f, indent=2)
print("Saved .graphify_chunks.json")
