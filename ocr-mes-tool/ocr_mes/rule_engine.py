# -*- coding: utf-8 -*-
"""规则引擎:把 OCR 文本行按 rules.yaml 里的固定规则提取成字段。

规则文件是唯一维护入口(见 rules/rules.yaml),支持三种匹配方式:
  regex         在 OCR 全文里做正则,取第 group 个捕获组
  after_keyword 行内出现关键字时,取关键字后面的内容(自动去除 : : = 等分隔符)
  contains      只要文本包含关键字即命中(不提取值,用于存在性判断)

支持四种校验:
  regex   / length / choices / numeric,校验失败会记录在 errors 里而不是中断。
"""
import logging
import re
from dataclasses import dataclass, field

log = logging.getLogger(__name__)

# after_keyword 匹配时,关键字后允许出现的分隔符(会被剥掉)
_SEP_RE = re.compile(r"^[\s:：=\-—–>》】\]]+")


@dataclass
class RuleResult:
    rule_id: str
    name: str
    value: str = ""          # 提取到的值(未命中时为空串)
    raw: str = ""            # 命中处的原始文本
    score: float = 0.0       # 命中行的 OCR 置信度
    matched: bool = False
    valid: bool = False
    required: bool = False   # 必填规则未命中会拉低整体结果
    errors: list = field(default_factory=list)
    mes_query: dict = field(default_factory=dict)

    def to_dict(self):
        return {
            "rule_id": self.rule_id, "name": self.name, "value": self.value,
            "raw": self.raw, "score": round(self.score, 3),
            "matched": self.matched, "valid": self.valid,
            "errors": self.errors, "mes_query": self.mes_query,
        }


class RuleEngine:
    def __init__(self, rules):
        self.rules = [r for r in rules if r.get("enabled", True)]
        skipped = len(rules) - len(self.rules)
        if skipped:
            log.info("跳过 %d 条已停用规则", skipped)

    # ---------- 对外主入口 ----------
    def apply(self, lines, join_sep="\n"):
        """lines: ocr_engine.OcrLine 列表。返回 RuleResult 列表(按规则文件顺序)。"""
        full_text = join_sep.join(l.text for l in lines)
        results = []
        for rule in self.rules:
            res = self._apply_one(rule, lines, full_text)
            results.append(res)
        return results

    # ---------- 单条规则 ----------
    def _apply_one(self, rule, lines, full_text):
        rid = rule.get("id", "<no-id>")
        name = rule.get("name", rid)
        res = RuleResult(rule_id=rid, name=name,
                         required=bool(rule.get("required", False)),
                         mes_query=rule.get("mes_query", {}) or {})
        try:
            value, raw, score = self._match(rule.get("match", {}), lines, full_text)
        except re.error as e:
            res.errors.append("正则表达式错误: %s" % e)
            return res
        if raw is None:
            if rule.get("required", False):
                res.errors.append("未命中")
            return res
        res.matched, res.raw, res.score = True, raw, score
        res.value = value if value is not None else raw
        self._validate(rule.get("validate", []) or [], res)
        return res

    # ---------- 匹配 ----------
    def _match(self, match_cfg, lines, full_text):
        mtype = match_cfg.get("type", "regex")
        if mtype == "regex":
            return self._match_regex(match_cfg, lines, full_text)
        if mtype == "after_keyword":
            return self._match_after_keyword(match_cfg, lines)
        if mtype == "contains":
            kw = match_cfg.get("pattern", "")
            for l in lines:
                if kw in l.text:
                    return kw, l.text, l.score
            return "", None, 0.0
        raise ValueError("未知匹配类型: %s" % mtype)

    def _match_regex(self, match_cfg, lines, full_text):
        pat = re.compile(match_cfg["pattern"], re.MULTILINE)
        m = pat.search(full_text)
        if not m:
            return "", None, 0.0
        group = match_cfg.get("group")
        if group is None:
            group = 1 if m.groups() else 0
        value = m.group(group)
        # 回到 OCR 行上取置信度
        raw_line, score = "", 0.0
        for line in lines:
            if value and value in line.text:
                raw_line, score = line.text, line.score
                break
        return value, raw_line or value, score

    def _match_after_keyword(self, match_cfg, lines):
        kw = match_cfg.get("pattern", "")
        if not kw:
            raise ValueError("after_keyword 规则必须提供 pattern(关键字)")
        for l in lines:
            pos = l.text.find(kw)
            if pos < 0:
                continue
            tail = _SEP_RE.sub("", l.text[pos + len(kw):]).strip()
            max_len = match_cfg.get("max_len")
            if max_len:
                tail = tail[: int(max_len)]
            return tail, l.text, l.score
        return "", None, 0.0

    # ---------- 校验 ----------
    def _validate(self, checks, res):
        ok = True
        for chk in checks or []:
            ctype = chk.get("type")
            err = None
            if ctype == "regex":
                if not re.fullmatch(chk["pattern"], res.value or ""):
                    err = "值 %r 不满足格式 %s" % (res.value, chk["pattern"])
            elif ctype == "length":
                n = len(res.value or "")
                lo, hi = chk.get("min", 0), chk.get("max", 10 ** 9)
                if not (lo <= n <= hi):
                    err = "长度 %d 不在 [%s, %s] 内" % (n, lo, hi)
            elif ctype == "choices":
                if res.value not in (chk.get("values") or []):
                    err = "值 %r 不在允许列表 %s 内" % (res.value, chk.get("values"))
            elif ctype == "numeric":
                try:
                    num = float(res.value)
                except (TypeError, ValueError):
                    err = "值 %r 不是数字" % res.value
                else:
                    lo, hi = chk.get("min"), chk.get("max")
                    if lo is not None and num < lo:
                        err = "数值 %s 小于下限 %s" % (num, lo)
                    if hi is not None and num > hi:
                        err = "数值 %s 大于上限 %s" % (num, hi)
            else:
                err = "未知校验类型: %s" % ctype
            if err:
                ok = False
                res.errors.append(err)
        res.valid = ok
