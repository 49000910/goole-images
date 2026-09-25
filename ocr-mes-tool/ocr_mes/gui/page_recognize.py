# -*- coding: utf-8 -*-
"""识别与MES查询页:选择图片 -> OCR -> 规则校验 -> MES+ 查询 -> 展示结果。"""
import json
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk


class RecognizePage(ttk.Frame):
    def __init__(self, app):
        super().__init__(app.notebook, padding=8)
        self.app = app
        self._running = False
        self._build()

    def _build(self):
        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=0)
        self.rowconfigure(2, weight=0)
        self.rowconfigure(3, weight=1)

        # 图片选择行
        top = ttk.Frame(self)
        top.grid(row=0, column=0, sticky="ew", pady=(0, 6))
        ttk.Label(top, text="图片:").pack(side="left")
        self.image_var = tk.StringVar()
        ttk.Entry(top, textvariable=self.image_var).pack(
            side="left", fill="x", expand=True, padx=(2, 6))
        ttk.Button(top, text="浏览...", command=self.browse).pack(side="left", padx=2)
        self.run_btn = ttk.Button(top, text="识别并查询MES+ (\u25B6)",
                                  command=self.run_recognize)
        self.run_btn.pack(side="left", padx=6)

        # 字段结果表
        table_wrap = ttk.Labelframe(self, text=" 字段提取与校验 ", padding=4)
        table_wrap.grid(row=1, column=0, sticky="ew")
        cols = ("name", "value", "matched", "valid", "note")
        self.table = ttk.Treeview(table_wrap, columns=cols, show="headings", height=7)
        heads = {"name": ("规则", 120), "value": ("提取值", 240),
                 "matched": ("命中", 60), "valid": ("校验", 60), "note": ("备注", 360)}
        for cid, (text, width) in heads.items():
            self.table.heading(cid, text=text)
            self.table.column(cid, width=width, anchor="w")
        self.table.pack(fill="x")

        # 整体结论
        self.verdict_var = tk.StringVar(value="")
        self.verdict = ttk.Label(self, textvariable=self.verdict_var, font=("", 12, "bold"))
        self.verdict.grid(row=2, column=0, sticky="w", pady=6)

        # MES+ 结果
        mes_wrap = ttk.Labelframe(self, text=" MES+ 查询返回 ", padding=4)
        mes_wrap.grid(row=3, column=0, sticky="nsew")
        self.rowconfigure(3, weight=1)
        mes_wrap.columnconfigure(0, weight=1)
        mes_wrap.rowconfigure(0, weight=1)
        self.mes_text = tk.Text(mes_wrap, height=10, wrap="word", state="disabled",
                                font=("Consolas", 9))
        self.mes_text.grid(row=0, column=0, sticky="nsew")
        sb = ttk.Scrollbar(mes_wrap, orient="vertical", command=self.mes_text.yview)
        self.mes_text.configure(yscrollcommand=sb.set)
        sb.grid(row=0, column=1, sticky="ns")

    # ---------------------------------------------------------------- 操作
    def browse(self):
        f = filedialog.askopenfilename(
            title="选择图片",
            filetypes=[("图片", "*.jpg *.jpeg *.png *.bmp"), ("所有文件", "*.*")],
            parent=self)
        if f:
            self.set_image(f)

    def set_image(self, path):
        self.image_var.set(str(path))
        self.run_recognize()   # 采集页送过来的图直接开跑

    def run_recognize(self):
        if self._running:
            return
        image = self.image_var.get().strip()
        if not image:
            messagebox.showinfo("提示", "请先选择图片(拍照采集页发送或「浏览」)。", parent=self)
            return
        if not Path(image).exists():
            messagebox.showerror("错误", "图片不存在: %s" % image, parent=self)
            return
        self._running = True
        self.run_btn.configure(state="disabled")
        self.app.set_status("OCR 识别中(首次运行需加载模型,约 1~2 秒)...")
        threading.Thread(target=self._worker, args=(image,), daemon=True).start()

    def _worker(self, image):
        try:
            pipeline = self.app.get_pipeline()
            summary = pipeline.run_image(image)
        except Exception as e:
            self.app.set_status("识别失败: %s" % e)
            self.app.msg_queue.put(("recognize_done", {"error": str(e), "image": image}))
            return
        self.app.msg_queue.put(("recognize_done", summary))

    def on_result(self, summary):
        self._running = False
        self.run_btn.configure(state="normal")
        if "error" in summary:
            self.verdict_var.set("✗ 识别失败: %s" % summary["error"])
            self.verdict.configure(foreground="#c62828")
            return
        # 字段表
        for iid in self.table.get_children():
            self.table.delete(iid)
        for f in summary["fields"]:
            self.table.insert("", "end", values=(
                f["name"], f["value"] or "-",
                "是" if f["matched"] else "否",
                "是" if f["valid"] else "否",
                "; ".join(f["errors"])))
        # MES+
        self.mes_text.configure(state="normal")
        self.mes_text.delete("1.0", "end")
        lines = []
        for field, v in summary["mes_plus"].items():
            if v.get("error"):
                lines.append("%s -> 失败: %s" % (field, v["error"]))
            else:
                lines.append("%s = %s" % (field, v["query_value"]))
                lines.append(json.dumps(v.get("response"), ensure_ascii=False, indent=2))
                lines.append("")
        self.mes_text.insert("1.0", "\n".join(lines) or "(无 MES 查询字段)")
        self.mes_text.configure(state="disabled")
        # 结论
        ok = summary["ok"]
        self.verdict_var.set(("✔ 整体通过" if ok else "✗ 存在问题,请查看备注") +
                             "   (%s, %s 行 OCR 文本)" % (Path(summary["image"]).name,
                                                          len(summary["ocr_lines"])))
        self.verdict.configure(foreground="#2e7d32" if ok else "#c62828")
        self.app.set_status("识别完成: %s" % Path(summary["image"]).name)
