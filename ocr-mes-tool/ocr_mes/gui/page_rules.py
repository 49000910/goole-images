# -*- coding: utf-8 -*-
"""规则维护页:查看/启停规则,可折叠的规则测试区。
新增/删除等复杂编辑仍建议用命令行 rule_manager.py(带注释保留与 git 留痕)。"""
import sys
import tkinter as tk
from tkinter import messagebox, ttk

from ..config import PROJECT_ROOT, load_rules
from ..rule_engine import RuleEngine
from .widgets import CollapsibleFrame

# rule_manager.py 是工具根目录的脚本,保证它能被导入
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
import rule_manager as rm  # noqa: E402


class _FakeLine:
    """规则测试用的轻量文本行(不做真实 OCR)。"""
    def __init__(self, text):
        self.text = text
        self.score = 1.0
        self.box = []


class RulesPage(ttk.Frame):
    def __init__(self, app):
        super().__init__(app.notebook, padding=8)
        self.app = app
        self._build()
        self.refresh()

    def _build(self):
        self.columnconfigure(0, weight=1)
        self.rowconfigure(0, weight=1)

        # 规则表
        wrap = ttk.Labelframe(self, text=" 规则列表(rules/rules.yaml) ", padding=4)
        wrap.grid(row=0, column=0, sticky="nsew")
        self.rowconfigure(0, weight=1)
        wrap.columnconfigure(0, weight=1)
        wrap.rowconfigure(0, weight=1)
        cols = ("id", "name", "enabled", "required", "type", "mes_field")
        self.table = ttk.Treeview(wrap, columns=cols, show="headings", height=10)
        for cid, (text, width) in {
            "id": ("ID", 140), "name": ("名称", 110), "enabled": ("启用", 50),
            "required": ("必填", 50), "type": ("匹配类型", 110),
            "mes_field": ("MES字段", 110)}.items():
            self.table.heading(cid, text=text)
            self.table.column(cid, width=width, anchor="w")
        self.table.grid(row=0, column=0, sticky="nsew")
        sb = ttk.Scrollbar(wrap, orient="vertical", command=self.table.yview)
        self.table.configure(yscrollcommand=sb.set)
        sb.grid(row=0, column=1, sticky="ns")

        bar = ttk.Frame(wrap)
        bar.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(4, 0))
        ttk.Button(bar, text="刷新", command=self.refresh).pack(side="left", padx=(0, 6))
        ttk.Button(bar, text="启用选中", command=lambda: self._toggle_selected(True))\
            .pack(side="left", padx=(0, 6))
        ttk.Button(bar, text="停用选中", command=lambda: self._toggle_selected(False))\
            .pack(side="left", padx=(0, 6))
        ttk.Label(bar, text="新增/删除等编辑请用命令行:python rule_manager.py --help",
                  foreground="#666666").pack(side="left", padx=12)

        # 可折叠:规则测试区
        panel = CollapsibleFrame(self, title="规则测试(输入文本,点测试)", expanded=True)
        panel.grid(row=1, column=0, sticky="ew", pady=(6, 0))
        self.test_text = tk.Text(panel.body, height=4, wrap="word", font=("Consolas", 10))
        self.test_text.pack(fill="x")
        self.test_text.insert("1.0", "工单号: WO-20260925-001\n序列号: SN0123456789AB\n工序: SMT")
        btns = ttk.Frame(panel.body)
        btns.pack(fill="x", pady=(4, 0))
        ttk.Button(btns, text="测试选中规则", command=lambda: self._test(selected_only=True))\
            .pack(side="left", padx=(0, 6))
        ttk.Button(btns, text="测试全部规则", command=lambda: self._test(selected_only=False))\
            .pack(side="left", padx=(0, 6))
        self.test_result = tk.Text(panel.body, height=6, wrap="word", state="disabled",
                                   font=("Consolas", 9), background="#f7f7f7")
        self.test_result.pack(fill="x", pady=(4, 0))

    # ---------------------------------------------------------------- 列表
    def refresh(self):
        for iid in self.table.get_children():
            self.table.delete(iid)
        try:
            rules = load_rules()
        except Exception as e:
            messagebox.showerror("错误", "读取规则失败: %s" % e, parent=self)
            return
        for r in rules:
            m = r.get("match", {}) or {}
            self.table.insert("", "end", iid=r["id"], values=(
                r["id"], r.get("name", ""), "是" if r.get("enabled", True) else "否",
                "是" if r.get("required", False) else "否",
                m.get("type", ""), (r.get("mes_query") or {}).get("field", "-")))
        self.app.set_status("规则已刷新: %d 条" % len(rules))

    def _toggle_selected(self, enable):
        sel = self.table.selection()
        if not sel:
            messagebox.showinfo("提示", "请先在列表中选择规则。", parent=self)
            return
        try:
            data = rm.load_raw()
            for rid in sel:
                rule = rm.find_rule(data, rid)
                if rule is not None:
                    rule["enabled"] = enable
            rm.save_raw(data)
        except Exception as e:
            messagebox.showerror("错误", "写回规则失败: %s" % e, parent=self)
            return
        self.refresh()

    # ---------------------------------------------------------------- 测试
    def _test(self, selected_only):
        text = self.test_text.get("1.0", "end").strip()
        if not text:
            messagebox.showinfo("提示", "请先输入测试文本。", parent=self)
            return
        lines = [_FakeLine(t) for t in text.splitlines() if t.strip()]
        if selected_only:
            sel = self.table.selection()
            if not sel:
                messagebox.showinfo("提示", "请先在列表中选择要测试的规则。", parent=self)
                return
            rules = [r for r in load_rules() if r["id"] in sel]
        else:
            rules = load_rules()
        results = RuleEngine(rules).apply(lines)
        out = []
        for r in results:
            out.append("[%s] %s(%s) -> %r  命中=%s 校验=%s" % (
                "OK " if (r.matched and r.valid) else "BAD", r.rule_id, r.name,
                r.value, r.matched, r.valid))
            for err in r.errors:
                out.append("     - %s" % err)
        self.test_result.configure(state="normal")
        self.test_result.delete("1.0", "end")
        self.test_result.insert("1.0", "\n".join(out) or "(无结果)")
        self.test_result.configure(state="disabled")
