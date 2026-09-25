# -*- coding: utf-8 -*-
"""OCR 规则维护 CLI(固定维护入口)。

常用命令:
  python rule_manager.py list                        # 查看全部规则
  python rule_manager.py show work_order_no          # 查看单条
  python rule_manager.py add --id sn_v2 --name 新序列号 \
         --match-type regex --pattern "SN[:：]?\\s*([A-Z0-9]{8,24})" \
         --mes-field sn --required
  python rule_manager.py update work_order_no --pattern "..." --v-length 6:32
  python rule_manager.py enable/disable work_order_no
  python rule_manager.py delete old_rule --yes
  python rule_manager.py test work_order_no --text "工单号: WO-20260925-001"
  python rule_manager.py check                       # 规则文件体检(重复ID/正则可编译等)

所有改动直接写回 rules/rules.yaml(保留注释),记得 git 提交留痕。
"""
import argparse
import logging
import re
import sys
from pathlib import Path

from ruamel.yaml import YAML

from ocr_mes.config import PROJECT_ROOT, load_rules
from ocr_mes.rule_engine import RuleEngine

RULES_FILE = PROJECT_ROOT / "rules" / "rules.yaml"


# ---------------------------------------------------------------- yaml 读写
def _yaml():
    y = YAML(typ="rt")          # round-trip: 保留注释与顺序
    y.preserve_quotes = True
    y.indent(mapping=2, sequence=4, offset=2)
    return y


def load_raw():
    with open(RULES_FILE, "r", encoding="utf-8") as f:
        return _yaml().load(f)


def save_raw(data):
    with open(RULES_FILE, "w", encoding="utf-8") as f:
        _yaml().dump(data, f)
    print("已写回 %s (记得 git 提交留痕)" % RULES_FILE)


def find_rule(data, rid):
    for r in data.get("rules", []):
        if r.get("id") == rid:
            return r
    return None


# ---------------------------------------------------------------- 子命令
def cmd_list(_):
    rules = load_rules()
    if not rules:
        print("规则文件为空")
        return
    print("%-18s %-12s %-8s %-8s %-14s %s" % ("ID", "名称", "启用", "必填", "匹配类型", "MES字段"))
    print("-" * 80)
    for r in rules:
        m = r.get("match", {}) or {}
        print("%-18s %-12s %-8s %-8s %-14s %s" % (
            r.get("id"), r.get("name", ""), "是" if r.get("enabled", True) else "否",
            "是" if r.get("required", False) else "否",
            m.get("type", ""), (r.get("mes_query") or {}).get("field", "-")))
    print("-" * 80)
    print("共 %d 条,规则文件: %s" % (len(rules), RULES_FILE))


def cmd_show(args):
    rule = find_rule(load_raw(), args.id)
    if rule is None:
        sys.exit("规则不存在: %s" % args.id)
    print(_dump_one(rule))


def _dump_one(rule):
    import io
    buf = io.StringIO()
    _yaml().dump(rule, buf)
    return buf.getvalue()


def _apply_common_opts(rule, args, creating):
    def set_if(name, key, cast=None):
        val = getattr(args, name, None)
        if val is not None:
            rule[key] = cast(val) if cast else val

    set_if("name", "name")
    if getattr(args, "required", None) is True:
        rule["required"] = True
    if getattr(args, "optional", None) is True:
        rule["required"] = False

    # match
    match = rule.setdefault("match", {})
    if getattr(args, "match_type", None):
        match["type"] = args.match_type
    if getattr(args, "pattern", None):
        match["pattern"] = args.pattern
    if getattr(args, "group", None) is not None:
        match["group"] = int(args.group)
    if getattr(args, "max_len", None) is not None:
        match["max_len"] = int(args.max_len)

    # validate
    checks = list(rule.get("validate") or [])
    if getattr(args, "v_regex", None):
        checks = [c for c in checks if c.get("type") != "regex"]
        checks.append({"type": "regex", "pattern": args.v_regex})
    if getattr(args, "v_length", None):
        lo, hi = args.v_length.split(":")
        checks = [c for c in checks if c.get("type") != "length"]
        checks.append({"type": "length", "min": int(lo), "max": int(hi)})
    if getattr(args, "v_choices", None):
        vals = [v.strip() for v in args.v_choices.split(",") if v.strip()]
        checks = [c for c in checks if c.get("type") != "choices"]
        checks.append({"type": "choices", "values": vals})
    if getattr(args, "clear_validate", None):
        checks = []
    if checks or "validate" in rule:
        rule["validate"] = checks
    elif creating:
        rule["validate"] = []

    # mes_query
    if getattr(args, "mes_field", None):
        mq = rule.setdefault("mes_query", {}) or {}
        mq["field"] = args.mes_field
        rule["mes_query"] = mq
    if getattr(args, "no_mes", None):
        rule.pop("mes_query", None)


def cmd_add(args):
    data = load_raw()
    if find_rule(data, args.id) is not None:
        sys.exit("规则 ID 已存在: %s(如需覆盖请用 update)" % args.id)
    rule = {"id": args.id, "name": args.name or args.id, "enabled": not args.disabled,
            "required": bool(args.required)}
    _apply_common_opts(rule, args, creating=True)
    if not rule.get("match", {}).get("pattern"):
        sys.exit("必须提供 --pattern(匹配关键字或正则)")
    data.setdefault("rules", []).append(rule)
    save_raw(data)
    print("已新增规则: %s" % args.id)
    print(_dump_one(rule))


def cmd_update(args):
    data = load_raw()
    rule = find_rule(data, args.id)
    if rule is None:
        sys.exit("规则不存在: %s" % args.id)
    if args.disable:
        rule["enabled"] = False
    if args.enable:
        rule["enabled"] = True
    _apply_common_opts(rule, args, creating=False)
    save_raw(data)
    print("已更新规则: %s" % args.id)
    print(_dump_one(rule))


def cmd_toggle(args):
    data = load_raw()
    rule = find_rule(data, args.id)
    if rule is None:
        sys.exit("规则不存在: %s" % args.id)
    rule["enabled"] = (args.action == "enable")
    save_raw(data)
    print("规则 %s 已%s" % (args.id, "启用" if rule["enabled"] else "停用"))


def cmd_delete(args):
    data = load_raw()
    rules = data.get("rules", [])
    rule = find_rule(data, args.id)
    if rule is None:
        sys.exit("规则不存在: %s" % args.id)
    if not args.yes:
        confirm = input("确认删除规则 %s(%s)?[y/N] " % (args.id, rule.get("name", "")))
        if confirm.strip().lower() != "y":
            print("已取消")
            return
    data["rules"] = [r for r in rules if r.get("id") != args.id]
    save_raw(data)
    print("已删除规则: %s" % args.id)


def cmd_test(args):
    rules = load_rules()
    rule = next((r for r in rules if r["id"] == args.id), None)
    if rule is None:
        sys.exit("规则不存在: %s" % args.id)
    engine = RuleEngine([rule])
    if args.text is not None:
        lines = [_FakeLine(t) for t in args.text.splitlines() if t.strip()]
    elif args.image:
        from ocr_mes.ocr_engine import OcrEngine
        lines = OcrEngine().recognize(args.image)
    else:
        sys.exit("需要 --text \"...\" 或 --image 图片路径")
    results = engine.apply(lines)
    all_valid = True
    for r in results:
        print("规则:   %s(%s)" % (r.rule_id, r.name))
        print("提取值: %r" % r.value)
        print("命中:   %s  校验: %s" % (r.matched, r.valid))
        if r.errors:
            all_valid = False
            print("问题:   %s" % "; ".join(r.errors))
    if not all_valid:
        sys.exit(1)  # 非零退出码,便于脚本/CI 判断


class _FakeLine:
    """rule_manager test 用的轻量文本行(不做真实 OCR)。"""
    def __init__(self, text):
        self.text = text
        self.score = 1.0
        self.box = []


def cmd_check(_):
    """规则文件体检:重复ID、缺字段、正则可编译、mes_query 类型。"""
    data = load_raw()
    problems = []
    seen = set()
    for i, r in enumerate(data.get("rules", []), 1):
        where = "第 %d 条规则(%s)" % (i, r.get("id", "?"))
        rid = r.get("id")
        if not rid or not re.fullmatch(r"[a-z][a-z0-9_]*", str(rid)):
            problems.append("%s: id 缺失或非法(须为小写字母开头的 [a-z0-9_])" % where)
        elif rid in seen:
            problems.append("%s: id 重复" % where)
        seen.add(rid)
        m = r.get("match") or {}
        if m.get("type") not in ("regex", "after_keyword", "contains"):
            problems.append("%s: match.type 非法" % where)
        if not m.get("pattern"):
            problems.append("%s: match.pattern 缺失" % where)
        elif m.get("type") == "regex":
            try:
                re.compile(m["pattern"])
            except re.error as e:
                problems.append("%s: 正则编译失败 %s" % (where, e))
        for c in r.get("validate") or []:
            if c.get("type") == "regex":
                try:
                    re.compile(c["pattern"])
                except re.error as e:
                    problems.append("%s: 校验正则编译失败 %s" % (where, e))
    if problems:
        print("发现 %d 个问题:" % len(problems))
        for p in problems:
            print("  - %s" % p)
        sys.exit(1)
    print("规则文件检查通过,共 %d 条规则" % len(data.get("rules", [])))


# ---------------------------------------------------------------- 入口
def build_parser():
    p = argparse.ArgumentParser(description="OCR 规则维护工具(rules/rules.yaml 唯一维护入口)")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list", help="列出全部规则").set_defaults(func=cmd_list)

    sp = sub.add_parser("show", help="查看单条规则")
    sp.add_argument("id")
    sp.set_defaults(func=cmd_show)

    def common(sp, creating):
        if creating:
            sp.add_argument("--id", required=True, help="规则ID(小写字母开头的 [a-z0-9_])")
            sp.add_argument("--name", help="中文显示名")
            sp.add_argument("--disabled", action="store_true", help="创建为停用状态")
        sp.add_argument("--match-type", choices=["regex", "after_keyword", "contains"])
        sp.add_argument("--pattern", help="正则或关键字")
        sp.add_argument("--group", type=int, help="regex 取第几个捕获组")
        sp.add_argument("--max-len", type=int, help="after_keyword 截取长度")
        sp.add_argument("--required", action="store_true", help="必填字段")
        sp.add_argument("--optional", action="store_true", help="改为非必填")
        sp.add_argument("--mes-field", help="MES+ 查询字段名")
        sp.add_argument("--no-mes", action="store_true", help="去掉 MES 查询映射")
        sp.add_argument("--v-regex", help="校验:整值正则")
        sp.add_argument("--v-length", help="校验:长度区间,如 6:32")
        sp.add_argument("--v-choices", help="校验:枚举,逗号分隔")
        sp.add_argument("--clear-validate", action="store_true", help="清空校验")

    sp = sub.add_parser("add", help="新增规则")
    common(sp, True)
    sp.set_defaults(func=cmd_add)

    sp = sub.add_parser("update", help="更新规则")
    sp.add_argument("id")
    common(sp, False)
    sp.add_argument("--enable", action="store_true")
    sp.add_argument("--disable", action="store_true")
    sp.set_defaults(func=cmd_update)

    for action in ("enable", "disable"):
        sp = sub.add_parser(action, help="%s 规则" % action)
        sp.add_argument("id")
        sp.set_defaults(func=cmd_toggle, action=action)

    sp = sub.add_parser("delete", help="删除规则")
    sp.add_argument("id")
    sp.add_argument("--yes", action="store_true", help="跳过确认")
    sp.set_defaults(func=cmd_delete)

    sp = sub.add_parser("test", help="用一段文本或一张图测试单条规则")
    sp.add_argument("id")
    sp.add_argument("--text", help="测试文本(可多行)")
    sp.add_argument("--image", help="测试图片路径(走真实 OCR)")
    sp.set_defaults(func=cmd_test)

    sub.add_parser("check", help="规则文件体检").set_defaults(func=cmd_check)
    return p


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
