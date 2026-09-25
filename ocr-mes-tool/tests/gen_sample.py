# -*- coding: utf-8 -*-
"""生成测试用样例标签图 samples/sample_label.png(黑字白底,OCR 友好)。"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "samples" / "sample_label.png"
FONTS = [
    r"C:\Windows\Fonts\msyh.ttc",   # 微软雅黑
    r"C:\Windows\Fonts\simhei.ttf",  # 黑体
    r"C:\Windows\Fonts\simsun.ttc",  # 宋体
]

LINES = [
    "MES 生产标签",
    "工单号: WO-20260925-001",
    "序列号: SN0123456789AB",
    "物料编码: MTR-8891-02",
    "批号: LOT20260925",
    "生产日期: 2026-09-25",
    "工序: SMT",
]


def gen():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    font = None
    for path in FONTS:
        if Path(path).exists():
            font = ImageFont.truetype(path, 44)
            break
    if font is None:
        raise RuntimeError("未找到中文字体,请把系统字体路径加进 FONTS 列表")

    line_h = 70
    img = Image.new("RGB", (760, 80 + line_h * len(LINES)), "white")
    draw = ImageDraw.Draw(img)
    draw.rectangle([4, 4, img.width - 5, img.height - 5], outline="black", width=3)
    y = 40
    for text in LINES:
        draw.text((40, y), text, fill="black", font=font)
        y += line_h
    img.save(OUT)
    print("样例图已生成: %s" % OUT)
    return OUT


if __name__ == "__main__":
    gen()
