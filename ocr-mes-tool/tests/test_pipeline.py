# -*- coding: utf-8 -*-
"""端到端验证:生成样例标签图 -> OCR -> 规则提取 -> MES+(mock)查询。

直接运行: python tests/test_pipeline.py
依赖真实 OCR 引擎(rapidocr-onnxruntime),首次运行会初始化模型(本地完成,不联网)。
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ocr_mes.pipeline import Pipeline  # noqa: E402
from ocr_mes.mes_client import MesPlusClient  # noqa: E402


def test_rule_engine_pure_text():
    """不依赖 OCR:直接用文本行验证规则提取逻辑。"""
    from ocr_mes.rule_engine import RuleEngine, RuleResult  # noqa: F401
    from ocr_mes.config import load_rules

    class FakeLine:
        def __init__(self, text):
            self.text, self.score, self.box = text, 1.0, []

    rules = load_rules()
    engine = RuleEngine(rules)
    lines = [FakeLine(t) for t in [
        "MES 生产标签",
        "工单号: WO-20260925-001",
        "序列号: SN0123456789AB",
        "物料编码: MTR-8891-02",
        "批号: LOT20260925",
        "生产日期: 2026-09-25",
        "工序: SMT",
    ]]
    res = {r.rule_id: r for r in engine.apply(lines)}
    assert res["work_order_no"].value == "WO-20260925-001", res["work_order_no"]
    assert res["product_sn"].value == "SN0123456789AB", res["product_sn"]
    assert res["material_code"].value == "MTR-8891-02", res["material_code"]
    assert res["batch_no"].value == "LOT20260925", res["batch_no"]
    assert res["product_date"].value == "2026-09-25", res["product_date"]
    assert res["process_route"].value == "SMT" and res["process_route"].valid
    assert all(r.valid for r in res.values()), {k: v.errors for k, v in res.items()}
    print("[PASS] 规则引擎(纯文本) 6/6 字段提取与校验正确")


def test_mes_mock():
    client = MesPlusClient({"mock": True})
    resp = client.query("workOrderNo", "WO-20260925-001")
    assert resp["code"] == 0 and resp["data"]["queryValue"] == "WO-20260925-001"
    print("[PASS] MES+ 客户端(mock) 返回结构正确")


def test_pipeline_e2e():
    """完整链路:真实 OCR 样例标签图 + 规则 + mock MES+。"""
    from tests.gen_sample import gen
    sample = gen()

    pipe = Pipeline()
    summary = pipe.run_image(sample)
    fields = {f["rule_id"]: f for f in summary["fields"]}

    assert fields["work_order_no"]["value"] == "WO-20260925-001", fields["work_order_no"]
    assert fields["product_sn"]["matched"], "SN 未识别"
    assert "workOrderNo" in summary["mes_plus"], "MES+ mock 查询未执行"
    assert "error" not in summary["mes_plus"]["workOrderNo"]

    out_files = list((ROOT / "out").glob("result_sample_label_*.json"))
    assert out_files, "结果 JSON 未落盘"
    saved = json.loads(out_files[-1].read_text(encoding="utf-8"))
    assert saved["fields"][0]["rule_id"] == "work_order_no"
    print("[PASS] 端到端(真实 OCR + 规则 + mock MES+) 结果 JSON 已保存")
    return summary


if __name__ == "__main__":
    test_rule_engine_pure_text()
    test_mes_mock()
    summary = test_pipeline_e2e()
    print()
    from ocr_mes.pipeline import print_summary
    print_summary(summary)
    print()
    print("全部测试通过 ✔")
