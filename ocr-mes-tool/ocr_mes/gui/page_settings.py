# -*- coding: utf-8 -*-
"""设置页:编辑 config.yaml(MES+ 接口 / OCR / 目录),保存时保留原注释。"""
import tkinter as tk
from tkinter import messagebox, ttk

import requests

from ..config import PROJECT_ROOT

CONFIG_FILE = PROJECT_ROOT / "config.yaml"


class SettingsPage(ttk.Frame):
    def __init__(self, app):
        super().__init__(app.notebook, padding=8)
        self.app = app
        self.vars = {}
        self._build()
        self._load()

    # ---------------------------------------------------------------- 布局
    def _build(self):
        self.columnconfigure(0, weight=1)

        mes = ttk.Labelframe(self, text=" MES+ 查询接口(上线前必改,详见 README) ", padding=8)
        mes.grid(row=0, column=0, sticky="ew")
        mes.columnconfigure(1, weight=1)
        for r in range(12):
            mes.rowconfigure(r, weight=0)

        def add(row, label, key, kind="entry", **cb_kw):
            ttk.Label(mes, text=label).grid(row=row, column=0, sticky="w", pady=2)
            var = tk.StringVar()
            if kind == "check":
                var = tk.BooleanVar()
                ttk.Checkbutton(mes, text="", variable=var, **cb_kw)\
                    .grid(row=row, column=1, sticky="w")
            else:
                ttk.Entry(mes, textvariable=var).grid(row=row, column=1, sticky="ew", pady=2)
            self.vars[key] = var
            return var

        self.mock_var = add(0, "mock 模式(不发真实请求)", "mes_plus.mock", kind="check")
        add(1, "base_url(服务器地址)", "mes_plus.base_url")
        add(2, "query_path({field}/{value} 占位)", "mes_plus.query_path")
        row = 3
        ttk.Label(mes, text="method").grid(row=row, column=0, sticky="w", pady=2)
        self.method_box = ttk.Combobox(mes, textvariable=tk.StringVar(),
                                       values=["GET", "POST"], width=8, state="readonly")
        self.method_box.grid(row=row, column=1, sticky="w", pady=2)

        add(4, "auth.type(bearer/basic/none)", "mes_plus.auth.type")
        add(5, "token 环境变量名", "mes_plus.auth.token_env")
        add(6, "basic 用户名环境变量名", "mes_plus.auth.username_env")
        add(7, "basic 密码环境变量名", "mes_plus.auth.password_env")
        add(8, "超时(秒)", "mes_plus.timeout_seconds")
        add(9, "重试次数", "mes_plus.retries")

        row = 10
        ttk.Label(mes, text="verify_ssl").grid(row=row, column=0, sticky="w", pady=2)
        self.ssl_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(mes, text="校验 HTTPS 证书", variable=self.ssl_var)\
            .grid(row=row, column=1, sticky="w")
        self.vars["mes_plus.verify_ssl"] = self.ssl_var

        ocr = ttk.Labelframe(self, text=" OCR 与目录 ", padding=8)
        ocr.grid(row=1, column=0, sticky="ew", pady=(10, 0))
        ocr.columnconfigure(1, weight=1)
        ttk.Label(ocr, text="OCR 置信度阈值(0~1)").grid(row=0, column=0, sticky="w", pady=2)
        self.score_var = tk.StringVar()
        ttk.Entry(ocr, textvariable=self.score_var, width=10)\
            .grid(row=0, column=1, sticky="w", pady=2)
        self.vars["ocr.text_score"] = self.score_var
        ttk.Label(ocr, text="采集图片保存目录").grid(row=1, column=0, sticky="w", pady=2)
        self.save_dir_var = tk.StringVar()
        ttk.Entry(ocr, textvariable=self.save_dir_var).grid(row=1, column=1, sticky="ew", pady=2)
        self.vars["capture.save_dir"] = self.save_dir_var

        bar = ttk.Frame(self)
        bar.grid(row=2, column=0, sticky="ew", pady=(12, 0))
        ttk.Button(bar, text="保存配置", command=self.save).pack(side="left", padx=(0, 6))
        ttk.Button(bar, text="测试 MES+ 连通性", command=self.test_connection).pack(side="left")
        hint = ("提示:mock=true 时查询不联网;凭据通过环境变量提供"
                "(MES_PLUS_TOKEN / MES_PLUS_USER / MES_PLUS_PASSWORD)。")
        ttk.Label(self, text=hint, foreground="#666666", wraplength=900)\
            .grid(row=3, column=0, sticky="w", pady=(8, 0))

    # ---------------------------------------------------------------- 数据
    def _load(self):
        import yaml
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
        mp = cfg.get("mes_plus", {})
        auth = mp.get("auth", {})
        self._set("mes_plus.mock", mp.get("mock", True))
        self._set("mes_plus.base_url", mp.get("base_url", ""))
        self._set("mes_plus.query_path", mp.get("query_path", ""))
        self.method_box.set((mp.get("method") or "GET").upper())
        self._set("mes_plus.auth.type", auth.get("type", "bearer"))
        self._set("mes_plus.auth.token_env", auth.get("token_env", "MES_PLUS_TOKEN"))
        self._set("mes_plus.auth.username_env", auth.get("username_env", "MES_PLUS_USER"))
        self._set("mes_plus.auth.password_env", auth.get("password_env", "MES_PLUS_PASSWORD"))
        self._set("mes_plus.timeout_seconds", mp.get("timeout_seconds", 10))
        self._set("mes_plus.retries", mp.get("retries", 2))
        self.ssl_var.set(bool(mp.get("verify_ssl", True)))
        self._set("ocr.text_score", cfg.get("ocr", {}).get("text_score", 0.5))
        cap = cfg.get("capture", {}).get("save_dir", "")
        self._set("capture.save_dir", cap or str(PROJECT_ROOT / "captures"))

    def _set(self, key, value):
        if key in self.vars:
            self.vars[key].set(value)

    def save(self):
        try:
            timeout = float(self.vars["mes_plus.timeout_seconds"].get())
            retries = int(self.vars["mes_plus.retries"].get())
            score = float(self.vars["ocr.text_score"].get())
            if not 0 < score <= 1:
                raise ValueError("OCR 置信度阈值应在 0~1 之间")
        except ValueError as e:
            messagebox.showerror("格式错误", str(e), parent=self)
            return

        from ruamel.yaml import YAML
        y = YAML(typ="rt")   # round-trip:保留 config.yaml 里的注释
        y.preserve_quotes = True
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            raw = y.load(f)

        mp = raw.setdefault("mes_plus", {})
        mp["mock"] = bool(self.mock_var.get())
        mp["base_url"] = self.vars["mes_plus.base_url"].get().strip()
        mp["query_path"] = self.vars["mes_plus.query_path"].get().strip()
        mp["method"] = self.method_box.get().upper()
        auth = mp.setdefault("auth", {})
        auth["type"] = self.vars["mes_plus.auth.type"].get().strip()
        auth["token_env"] = self.vars["mes_plus.auth.token_env"].get().strip()
        auth["username_env"] = self.vars["mes_plus.auth.username_env"].get().strip()
        auth["password_env"] = self.vars["mes_plus.auth.password_env"].get().strip()
        mp["timeout_seconds"] = timeout
        mp["retries"] = retries
        mp["verify_ssl"] = bool(self.ssl_var.get())
        raw.setdefault("ocr", {})["text_score"] = score
        raw.setdefault("capture", {})["save_dir"] = \
            self.vars["capture.save_dir"].get().strip()

        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            y.dump(raw, f)

        self.app.reload_config()
        self.app.capture_page.save_dir_var.set(self.vars["capture.save_dir"].get())
        messagebox.showinfo("已保存", "config.yaml 已写回(注释保留)。\n"
                                     "OCR 引擎将在下次识别时按新配置加载。", parent=self)
        self.app.set_status("配置已保存")

    def test_connection(self):
        base = self.vars["mes_plus.base_url"].get().strip()
        if not base:
            messagebox.showwarning("提示", "请先填写 base_url。", parent=self)
            return
        self.app.set_status("测试 MES+ 连通性: %s ..." % base)

        def worker():
            try:
                resp = requests.get(base, timeout=5, verify=bool(self.ssl_var.get()))
                self.app.set_status("MES+ 连通性: HTTP %s(%s)"
                                    % (resp.status_code, resp.reason))
            except requests.RequestException as e:
                self.app.set_status("MES+ 连通性失败: %s" % e)

        self.app.run_threaded(worker)
