#!/usr/bin/env bash
# 离线安装依赖(Linux 产线机):使用仓库内 wheels/,不需要联网
set -e
cd "$(dirname "$0")/.."
python3 -m pip install --no-index --find-links wheels -r requirements.txt
echo "[成功] 依赖安装完成。验证: python3 main.py samples/sample_label.png"
