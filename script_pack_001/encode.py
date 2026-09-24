import os, sys, base64, zlib, json, hashlib

KEY = 123
DEFAULT_CHUNK = 8192

def xor(data, key=KEY):
    return bytes([b ^ key for b in data])

def pack_image(img_path, out_dir, chunk_size=DEFAULT_CHUNK):
    os.makedirs(out_dir, exist_ok=True)
    chunk_dir = os.path.join(out_dir, "chunks")
    os.makedirs(chunk_dir, exist_ok=True)

    raw = open(img_path, "rb").read()
    compressed = zlib.compress(raw)
    obf = xor(compressed)
    b64 = base64.b64encode(obf).decode()

    chunks = []
    for i in range(0, len(b64), chunk_size):
        part = b64[i:i + chunk_size]
        name = "part_%04d.bin" % (i // chunk_size)
        with open(os.path.join(chunk_dir, name), "w") as f:
            f.write(part)
        chunks.append("chunks/" + name)

    meta = {
        "name": os.path.basename(img_path),
        "chunk_size": chunk_size,
        "method": {
            "compress": "zlib",
            "encode": "base64",
            "obfuscation": "xor_123",
        },
        "chunks": chunks,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "srcSize": len(raw),
    }
    with open(os.path.join(out_dir, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print("pack done: %s -> %d bytes, %d chunks x %d" % (os.path.basename(img_path), len(raw), len(chunks), chunk_size))

if __name__ == "__main__":
    img = sys.argv[1]
    out = sys.argv[2]
    cs = int(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_CHUNK
    pack_image(img, out, cs)
