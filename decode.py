# 外网端运行: 从 GitHub 仓库还原图片
# 用法: python decode.py 输出目录
import sys, os, json, base64, zlib, hashlib, urllib.request

REPO = "49000910/goole-images"
BASE = "pkg"
# 仓库是公开的, 不需要 token
API = "https://api.github.com/repos/%s/contents/%s" % (REPO, BASE)

def get(path):
    r = urllib.request.Request(API + "/" + path)
    r.add_header("Accept", "application/vnd.github.v3+json")
    with urllib.request.urlopen(r, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))

def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(outdir, exist_ok=True)

    meta = get("meta.json")
    m = json.loads(base64.b64decode(meta["content"]).decode("utf-8"))
    print("file=%s size=%d sha256=%s..." % (m["sourceFile"], m["srcSize"], m["sha256"][:16]))

    key = bytes.fromhex(m["key"])
    total = len(m["parts"])
    buf = bytearray()
    for i, name in enumerate(m["parts"]):
        try:
            d = get(name)
            chunk = base64.b64decode(d["content"])
            buf.extend(chunk)
            print("\rpart %d/%d" % (i + 1, total), end="", flush=True)
        except Exception as e:
            print("\nERROR at %s: %s" % (name, e))
            return 1
    print()

    xored = bytes(buf)
    comp = bytes(b ^ key[j % len(key)] for j, b in enumerate(xored))
    data = zlib.decompress(comp)

    sha = hashlib.sha256(data).hexdigest()
    if sha != m["sha256"]:
        print("SHA256 MISMATCH! got %s" % sha[:16])
        return 1
    if data[:3].hex() != m["magic"]:
        print("MAGIC MISMATCH!")
        return 1

    out = os.path.join(outdir, m["sourceFile"])
    open(out, "wb").write(data)
    print("OK -> %s (%d bytes) magic=%s" % (out, len(data), data[:3].hex()))
    return 0

if __name__ == "__main__":
    sys.exit(main())
