import os, sys, base64, zlib, json, hashlib

CHUNK_SIZE = 4096
KEY = 123

def xor(data, key=KEY):
    return bytes([b ^ key for b in data])

def pack_image(img_path, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    chunk_dir = os.path.join(out_dir, "chunks")
    os.makedirs(chunk_dir, exist_ok=True)

    raw = open(img_path, "rb").read()
    compressed = zlib.compress(raw)
    obf = xor(compressed)
    b64 = base64.b64encode(obf).decode()

    chunks = []
    for i in range(0, len(b64), CHUNK_SIZE):
        part = b64[i:i + CHUNK_SIZE]
        name = "part_%04d.bin" % (i // CHUNK_SIZE)
        with open(os.path.join(chunk_dir, name), "w") as f:
            f.write(part)
        chunks.append("chunks/" + name)

    meta = {
        "name": os.path.basename(img_path),
        "chunk_size": CHUNK_SIZE,
        "method": {
            "compress": "zlib",
            "encode": "base64",
            "obfuscation": "xor_123",
        },
        "chunks": chunks,
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
    with open(os.path.join(out_dir, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print("pack done: %d bytes raw, %d chunks x %d" % (len(raw), len(chunks), CHUNK_SIZE))

if __name__ == "__main__":
    pack_image(sys.argv[1], sys.argv[2])
