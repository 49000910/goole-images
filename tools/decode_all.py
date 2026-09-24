# 批量还原: 还原输出根目录下所有 image_pack_NNN
# 用法: python decode_all.py <packs根目录> <输出目录>
import os, sys, json

def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    out_root = sys.argv[2] if len(sys.argv) > 2 else "restored"

    index_path = os.path.join(root, "index.json")
    if os.path.exists(index_path):
        index = json.load(open(index_path))
        packs = [e["pack"] for e in index]
    else:
        packs = sorted(d for d in os.listdir(root) if d.startswith("image_pack_"))

    sys.path.insert(0, root)
    ok = fail = 0
    for pack in packs:
        pack_dir = os.path.join(root, pack)
        meta_path = os.path.join(pack_dir, "meta.json")
        if not os.path.exists(meta_path):
            print("skip %s (no meta.json)" % pack)
            fail += 1
            continue
        meta = json.load(open(meta_path))
        out_dir = os.path.join(out_root, pack)
        os.makedirs(out_dir, exist_ok=True)
        try:
            r = os.path.join(pack_dir, "decode.py")
            if os.path.exists(r):
                ns = {}
                exec(open(r).read(), ns)
                rc = ns["unpack"](pack_dir, out_dir)
            else:
                print("skip %s (no decode.py)" % pack)
                fail += 1
                continue
            if rc == 0:
                ok += 1
            else:
                fail += 1
        except Exception as e:
            print("FAIL %s: %s" % (pack, e))
            fail += 1
    print("all done: ok=%d fail=%d" % (ok, fail))
    return 0 if fail == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
