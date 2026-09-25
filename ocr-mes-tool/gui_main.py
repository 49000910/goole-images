# -*- coding: utf-8 -*-
"""GUI 主程序入口:python gui_main.py

分页工作台:
  拍照采集   相机预览 / 拍照 / 文件导入(相机参数、采集历史为可折叠面板)
  识别与MES查询   OCR -> 规则校验 -> MES+ 查询
  规则维护   查看/启停/测试规则(复杂编辑用 rule_manager.py)
  设置       MES+ 接口与 OCR 参数(config.yaml,保留注释)
"""
import logging
import sys
from pathlib import Path

# 保证从任意工作目录启动都能找到 ocr_mes 包与规则文件
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ocr_mes.gui.app import App  # noqa: E402


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    App().run()


if __name__ == "__main__":
    main()
