# -*- coding: utf-8 -*-
"""主流程:图片 -> OCR -> 规则提取 -> MES+ 查询 -> 汇总输出。"""
import json
import logging
from datetime import datetime
from pathlib import Path

from .config import load_config, load_rules
from .mes_client import MesPlusClient, MesPlusError
from .ocr_engine import OcrEngine
from .rule_engine import RuleEngine

log = logging.getLogger(__name__)


class Pipeline:
    def __init__(self, config_path=None, rules_path=None, mock_mes=None):
        self.cfg = load_config(config_path)
        self.rules = load_rules(self.cfg["rules_file"] if rules_path is None else rules_path)
        if mock_mes is not None:  # 命令行 --real 覆盖
            self.cfg.setdefault("mes_plus", {})["mock"] = not mock_mes
        self.ocr = OcrEngine(min_score=float(self.cfg.get("ocr", {}).get("text_score", 0.5)))
        self.rule_engine = RuleEngine(self.rules)
        self.mes = MesPlusClient(self.cfg.get("mes_plus"))
        self.out_dir = Path(self.cfg.get("output", {}).get("dir") or "out")
        self.save_json = bool(self.cfg.get("output", {}).get("save_json", True))

    def run_image(self, image_path):
        """处理单张图片,返回汇总 dict。"""
        lines = self.ocr.recognize(image_path)
        results = self.rule_engine.apply(lines)

        mes_results = {}
        for r in results:
            mq = r.mes_query or {}
            field = mq.get("field")
            if not field:
                continue
            # 只查「已提取到值」的字段;required 字段提取失败也要报出来
            if r.value:
                try:
                    mes_results[field] = {
                        "query_value": r.value,
                        "response": self.mes.query(field, r.value),
                    }
                except MesPlusError as e:
                    mes_results[field] = {"query_value": r.value, "error": str(e)}
            elif r.errors:
                mes_results[field] = {"error": "; ".join(r.errors)}

        summary = {
            "image": str(image_path),
            "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "ocr_lines": [{"text": l.text, "score": round(l.score, 3)} for l in lines],
            "fields": [r.to_dict() for r in results],
            "mes_plus": mes_results,
            # 整体通过 = 命中的字段都校验通过 + 必填字段都命中 + MES+ 查询无失败
            "ok": (all(r.valid for r in results if r.matched)
                   and all(r.matched for r in results if r.required)
                   and all(not v.get("error") for v in mes_results.values())),
        }
        self._save(image_path, summary)
        return summary

    def run_paths(self, paths):
        return [self.run_image(p) for p in paths]

    def _save(self, image_path, summary):
        if not self.save_json:
            return
        self.out_dir.mkdir(parents=True, exist_ok=True)
        stem = Path(image_path).stem
        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        out_file = self.out_dir / ("result_%s_%s.json" % (stem, ts))
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        log.info("结果已保存: %s", out_file)


def print_summary(summary):
    """控制台友好输出。"""
    print("=" * 64)
    print("图片: %s" % summary["image"])
    print("时间: %s" % summary["time"])
    print("-" * 64)
    print("%-14s %-22s %-6s %-6s %s" % ("规则", "提取值", "命中", "校验", "备注"))
    for f in summary["fields"]:
        note = "; ".join(f["errors"]) if f["errors"] else ""
        print("%-14s %-22s %-6s %-6s %s" % (
            f["name"], (f["value"] or "-")[:22],
            "是" if f["matched"] else "否", "是" if f["valid"] else "否", note))
    if summary["mes_plus"]:
        print("-" * 64)
        print("MES+ 查询结果:")
        for field, v in summary["mes_plus"].items():
            if v.get("error"):
                print("  %s -> 失败: %s" % (field, v["error"]))
            else:
                resp = v.get("response")
                data = resp.get("data") if isinstance(resp, dict) else resp
                print("  %s=%s -> %s" % (field, v["query_value"],
                                         json.dumps(data, ensure_ascii=False) if data else "无数据"))
    print("=" * 64)
    print("整体结果: %s" % ("通过" if summary["ok"] else "存在问题,请检查上方备注"))
