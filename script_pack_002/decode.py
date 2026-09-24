import os, sys, base64, zlib, json, hashlib

KEY = 123

def xor(data, key=KEY):
    return bytes([b ^ key for b in data])

def unpack(folder, out_dir="."):
    meta = json.load(open(os.path.join(folder, "meta.json")))

    b64 = ""
    total = len(meta["chunks"])
    for i, c in enumerate(meta["chunks"]):
        p = os.path.join(folder, c)
        try:
            with open(p) as f:
                b64 += f.read()
        except Exception as e:
            print("ERROR reading %s: %s" % (p, e))
            return 1
        if (i + 1) % 20 == 0 or i + 1 == total:
            print("\rchunk %d/%d" % (i + 1, total), end="", flush=True)
    print()

    try:
        data = base64.b64decode(b64)
        data = xor(data)
        raw = zlib.decompress(data)
    except Exception as e:
        print("DECODE ERROR: %s" % e)
        return 1

    sha = hashlib.sha256(raw).hexdigest()
    if "sha256" in meta and sha != meta["sha256"]:
        print("SHA256 MISMATCH!")
        return 1

    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, meta["name"])
    with open(out, "wb") as f:
        f.write(raw)
    print("restore done: %s (%d bytes, magic=%s)" % (out, len(raw), raw[:3].hex()))
    return 0

if __name__ == "__main__":
    folder = sys.argv[1] if len(sys.argv) > 1 else "image_pack_001"
    out_dir = sys.argv[2] if len(sys.argv) > 2 else "."
    sys.exit(unpack(folder, out_dir))
