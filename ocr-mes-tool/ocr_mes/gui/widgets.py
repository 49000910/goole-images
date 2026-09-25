# -*- coding: utf-8 -*-
"""GUI 通用组件:可折叠面板、滚动容器。"""
import tkinter as tk
from tkinter import ttk


class CollapsibleFrame(ttk.Frame):
    """可折叠面板:点击标题栏展开/收起(▸/▾)。

    用法:
        panel = CollapsibleFrame(master, title="相机参数", expanded=True)
        panel.pack(fill="both", expand=True)
        panel.body 内放内容
    """

    EXPAND_MARK = "\u25be "   # ▾
    COLLAPSE_MARK = "\u25b8 "  # ▸

    def __init__(self, master, title="", expanded=True, **kw):
        super().__init__(master, **kw)
        self._title = title
        self._expanded = expanded

        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=1)

        self.header = ttk.Frame(self, cursor="hand2")
        self.header.grid(row=0, column=0, sticky="ew")
        self.mark = ttk.Label(self.header, text="", width=2)
        self.mark.pack(side="left")
        self.label = ttk.Label(self.header, text="", font=("", 10, "bold"))
        self.label.pack(side="left")
        self.sep = ttk.Separator(self, orient="horizontal")
        self.sep.grid(row=0, column=0, sticky="sew", padx=(0, 0))
        # 标题占满一行,分隔线压在底部
        self.label.lift()

        self.body = ttk.Frame(self, padding=(10, 4, 0, 0))
        self.body.grid(row=1, column=0, sticky="nsew")

        for w in (self.header, self.mark, self.label):
            w.bind("<Button-1>", lambda e: self.toggle())

        self._render()

    def _render(self):
        self.mark.configure(text=self.EXPAND_MARK if self._expanded else self.COLLAPSE_MARK)
        self.label.configure(text=self._title)
        if self._expanded:
            self.body.grid()
        else:
            self.body.grid_remove()

    def toggle(self, expanded=None):
        """展开/收起;expanded=True/False 可指定状态。"""
        if expanded is None:
            expanded = not self._expanded
        self._expanded = bool(expanded)
        self._render()

    def set_title(self, title):
        self._title = title
        self._render()


class ScrollFrame(ttk.Frame):
    """带纵向滚动的容器,canvas 内放内容用 self.inner。"""

    def __init__(self, master, height=180, **kw):
        super().__init__(master, **kw)
        self.canvas = tk.Canvas(self, height=height, highlightthickness=0)
        self.vbar = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=self.vbar.set)
        self.canvas.pack(side="left", fill="both", expand=True)
        self.vbar.pack(side="right", fill="y")

        self.inner = ttk.Frame(self.canvas)
        self._win = self.canvas.create_window((0, 0), window=self.inner, anchor="nw")
        self.inner.bind("<Configure>", self._on_inner_configure)
        self.canvas.bind("<Configure>", self._on_canvas_configure)
        # 滚轮
        self.canvas.bind_all("<MouseWheel>", self._on_wheel, add="+")
        self.canvas.bind_all("<Button-4>", self._on_wheel, add="+")
        self.canvas.bind_all("<Button-5>", self._on_wheel, add="+")

    def _on_inner_configure(self, _e):
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))

    def _on_canvas_configure(self, e):
        self.canvas.itemconfigure(self._win, width=e.width)

    def _on_wheel(self, e):
        # 只在鼠标位于本组件上方时滚动
        if str(e.widget).startswith(str(self.canvas)):
            step = -1 if (getattr(e, "delta", 0) > 0 or e.num == 4) else 1
            self.canvas.yview_scroll(step, "units")
