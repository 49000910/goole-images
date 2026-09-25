# -*- coding: utf-8 -*-
"""依赖打包/下载脚本(在联网机器上执行,生成 wheels/ 离线包)。

用法:
    python scripts/download_deps.py                  # 为当前解释器打包(如 cp314)
    python scripts/download_deps.py --python-version 311   # 为目标机 3.11 打包

为什么分两步:omegaconf>=2.1 固定依赖 antlr4-python3-runtime==4.9.*,
而该包只有 sdist 没有 wheel,--only-binary 模式解析不到。
所以先在联网机器把它构建成 wheel 放进 wheels/,再通过 --find-links
让主下载解析到它。wheels/ 里已有该 wheel 时会跳过。
"""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REQ = ROOT / "requirements.txt"
WHEELS = ROOT / "wheels"


def local_wheels(pattern):
    return sorted(WHEELS.glob(pattern))


def main():
    ap = argparse.ArgumentParser(description="下载依赖 wheel 到 wheels/ 目录(供离线安装)")
    ap.add_argument("--python-version", default="%d%d" % sys.version_info[:2],
                    help="目标 Python 版本标签,如 311、312、314(默认当前解释器)")
    ap.add_argument("--platform", default="win_amd64", help="目标平台(默认 win_amd64)")
    args = ap.parse_args()

    WHEELS.mkdir(exist_ok=True)

    # 第 1 步:构建只有 sdist 的 antlr4(omegaconf>=2.1 的固定依赖)
    if not local_wheels("antlr4_python3_runtime-4.9*"):
        print("构建 antlr4-python3-runtime==4.9.3 wheel(sdist -> wheel)...")
        subprocess.check_call([
            sys.executable, "-m", "pip", "wheel",
            "antlr4-python3-runtime==4.9.3",
            "-w", str(WHEELS),
        ])

    # 第 2 步:主下载。--find-links 让上一步构建的 antlr4 wheel 参与解析。
    cmd = [
        sys.executable, "-m", "pip", "download",
        "-r", str(REQ),
        "-d", str(WHEELS),
        "--only-binary=:all:",
        "--find-links", str(WHEELS),
        "--python-version", args.python_version,
        "--platform", args.platform,
        "--implementation", "cp",
        "--abi", "cp" + args.python_version,
    ]
    print("执行:", " ".join(cmd))
    subprocess.check_call(cmd)

    print("\n完成,共 %d 个 wheel。离线安装命令(目标机):" % len(local_wheels("*.whl")))
    print("  python -m pip install --no-index --find-links %s -r requirements.txt" % WHEELS)


if __name__ == "__main__":
    main()
