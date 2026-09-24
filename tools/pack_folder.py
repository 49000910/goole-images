# 批量打包: 扫描目录下所有图片, 每图生成一个 image_pack_NNN
# 用法: python pack_folder.py <图片目录> <输出根目录> [chunk_size]
import os, sys, glob

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from encode import pack_image, DEFAULT_CHUNK

EXTS = (".jpg", ".jpeg", ".png", ".bmp", ".webp")
SKIP_DIRS = (".venv", "node_modules", "__pycache__", ".git", "_离线依赖")

def find_images(root):
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in sorted(filenames):
            if fn.lower().endswith(EXTS):
                out.append(os.path.join(dirpath, fn))
    return out

def main():
    src_dir = sys.argv[1]
    out_root = sys.argv[2]
    cs = int(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_CHUNK

    images = find_images(src_dir)
    if not images:
        print("no images found in", src_dir)
        return 1
    print("found %d images" % len(images))

    index = []
    for i, img in enumerate(images, 1):
        pack_name = "image_pack_%03d" % i
        out_dir = os.path.join(out_root, pack_name)
        pack_image(img, out_dir, cs)
        meta = {"pack": pack_name, "source": os.path.relpath(img, src_dir)}
        index.append(meta)
        # 把 encode/decode 复制进每个 pack (自包含)
        here = os.path.dirname(os.path.abspath(__file__))
        for tool in ("encode.py", "decode.py"):
            p = os.path.join(here, tool)
            if os.path.exists(p):
                open(os.path.join(out_dir, tool), "w").write(open(p).read())

    import json
    with open(os.path.join(out_root, "index.json"), "w") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
    print("batch done: %d packs + index.json in %s" % (len(images), out_root))
    return 0

if __name__ == "__main__":
    sys.exit(main())
