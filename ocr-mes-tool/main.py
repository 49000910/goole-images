# -*- coding: utf-8 -*-
"""命令行入口:图片 -> OCR -> 规则 -> MES+ 查询。

用法:
  python main.py 图片1.jpg 图片2.png        # 处理指定图片
  python main.py D:\\photos\\*.jpg          # 支持通配符
  python main.py 样例.jpg --real            # 关掉 mock,直连真实 MES+(需先改 config.yaml)
  python main.py 样例.jpg --config my.yaml --rules my_rules.yaml
"""
import glob
import logging
import sys

from ocr_mes.pipeline import Pipeline, print_summary


def expand(paths):
    out = []
    for p in paths:
        hits = glob.glob(p)
        out.extend(hits if hits else [p])
    return out


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    import argparse
    ap = argparse.ArgumentParser(description="OCR 规则提取 + MES+ 查询")
    ap.add_argument("images", nargs="+", help="图片路径(支持通配符)")
    ap.add_argument("--config", help="配置文件路径(默认 config.yaml)")
    ap.add_argument("--rules", help="规则文件路径(默认 rules/rules.yaml)")
    ap.add_argument("--real", action="store_true",
                    help="关闭 mock 直连真实 MES+;前提是 config.yaml 已按现场接口改好")
    args = ap.parse_args()

    images = expand(args.images)
    if not images:
        sys.exit("没有找到图片")

    pipe = Pipeline(config_path=args.config, rules_path=args.rules)
    # --real 时把 mock 关掉(覆盖配置)
    if args.real:
        pipe.cfg.setdefault("mes_plus", {})["mock"] = False
        from ocr_mes.mes_client import MesPlusClient
        pipe.mes = MesPlusClient(pipe.cfg["mes_plus"])

    all_ok = True
    for img in images:
        try:
            summary = pipe.run_image(img)
        except Exception as e:  # 单张失败不影响其他图片
            logging.error("处理 %s 失败: %s", img, e)
            all_ok = False
            continue
        print_summary(summary)
        all_ok = all_ok and summary["ok"]
    sys.exit(0 if all_ok else 2)


if __name__ == "__main__":
    main()
