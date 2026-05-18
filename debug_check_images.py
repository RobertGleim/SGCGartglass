import urllib.request, json

for pid in [25, 26, 24, 14, 122]:
    r = urllib.request.urlopen("http://localhost:5000/api/manual-products/" + str(pid))
    data = json.loads(r.read())
    imgs = data.get("images", [])
    name = data.get("name", "?")
    print("Product", pid, name, ":", len(imgs), "images")
    for img in imgs:
        url = img.get("image_url", "")
        prefix = url[:80] if url else "(empty)"
        print("  image_url[:80] =", repr(prefix), " has_data =", bool(img.get("image_data")))
