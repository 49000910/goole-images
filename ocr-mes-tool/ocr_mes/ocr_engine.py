# -*- coding: utf-8 -*-
"""OCR 引擎封装:基于 RapidOCR 3.x + onnxruntime(离线可用,模型随包内置)。

对外只暴露 OcrEngine.recognize(image_path) -> list[OcrLine]
OcrLine: text(识别文本), score(置信度 0~1), box(四点坐标)
"""
import logging
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger(__name__)


@dataclass
class OcrLine:
    text: str
    score: float
    box: list = field(default_factory=list)


class OcrEngine:
    """RapidOCR 封装。模型随 wheel 内置,首次运行不需要联网。"""

    def __init__(self, min_score=0.5):
        self.min_score = min_score
        from rapidocr import RapidOCR
        self._engine = RapidOCR()
        log.info("RapidOCR 初始化完成 (min_score=%s)", min_score)

    def recognize(self, image_path):
        """识别一张图片,返回过滤低置信度后的文本行列表。"""
        image_path = str(image_path)
        if not Path(image_path).exists():
            raise FileNotFoundError("图片不存在: %s" % image_path)
        out = self._engine(image_path)
        lines = []
        txts = getattr(out, "txts", None)
        scores = getattr(out, "scores", None)
        boxes = getattr(out, "boxes", None)
        txts = txts if txts is not None else ()
        for i, text in enumerate(txts):
            score = float(scores[i]) if scores is not None and i < len(scores) else 0.0
            box = boxes[i] if boxes is not None and i < len(boxes) else []
            if score < self.min_score:
                log.debug("丢弃低置信度文本: %r score=%.2f", text, score)
                continue
            lines.append(OcrLine(text=str(text), score=score,
                                 box=[[float(x), float(y)] for x, y in box]))
        log.info("OCR 完成 %s: 得到 %d 行文本", image_path, len(lines))
        return lines

    @staticmethod
    def join_text(lines, sep="\n"):
        """把所有行拼成整段文本,供跨行规则使用。"""
        return sep.join(l.text for l in lines)
