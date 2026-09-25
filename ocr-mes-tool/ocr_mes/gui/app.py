# -*- coding: utf-8 -*-
"""GUI 主窗口:分页(拍照采集 / 识别与MES查询 / 规则维护 / 设置)+ 状态栏。"""
import logging
import queue
import threading
import tkinter as tk
from tkinter import ttk

from ..config import load_config
from ..pipeline import Pipeline

from .page_capture import CapturePage
from .page_recognize import RecognizePage
from .page_rules import RulesPage
from .page_settings import SettingsPage

log = logging.getLogger(__name__)


class App:
    """GUI 应用。持有共享状态:配置、Pipeline(懒加载)、线程消息队列。"""

    def __init__(self):
        self.root = tk.Tk()
        self.root.title("OCR 识别 + MES+ 查询 工作台")
        self.root.geometry("1120x720")
        self.root.minsize(960, 620)

        self.cfg = load_config()
        self._pipeline = None
        self._pipeline_lock = threading.Lock()
        self.msg_queue = queue.Queue()   # 工作线程 -> UI 的 (kind, payload) 消息

        self._build_ui()
        self.root.after(80, self._poll_messages)

    # ---------------------------------------------------------------- UI
    def _build_ui(self):
        style = ttk.Style(self.root)
        try:
            style.theme_use("vista")
        except tk.TclError:
            pass
        style.configure("Toolbutton", padding=(6, 3))

        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill="both", expand=True, padx=6, pady=(6, 0))

        self.capture_page = CapturePage(self)
        self.recognize_page = RecognizePage(self)
        self.rules_page = RulesPage(self)
        self.settings_page = SettingsPage(self)

        self.notebook.add(self.capture_page, text=" 拍照采集 ")
        self.notebook.add(self.recognize_page, text=" 识别与MES查询 ")
        self.notebook.add(self.rules_page, text=" 规则维护 ")
        self.notebook.add(self.settings_page, text=" 设置 ")

        self.status_var = tk.StringVar(value="就绪")
        status = ttk.Label(self.root, textvariable=self.status_var,
                           relief="sunken", anchor="w", padding=(6, 2))
        status.pack(fill="x", side="bottom")

    def set_status(self, text):
        self.msg_queue.put(("status", text))

    def _poll_messages(self):
        try:
            while True:
                kind, payload = self.msg_queue.get_nowait()
                if kind == "status":
                    self.status_var.set(str(payload))
                elif kind == "devices":
                    self.capture_page.on_devices_found(payload)
                elif kind == "recognize_done":
                    self.recognize_page.on_result(payload)
                elif kind == "refresh_captures":
                    self.capture_page.refresh_gallery()
        except queue.Empty:
            pass
        self.root.after(80, self._poll_messages)

    # ---------------------------------------------------------------- 共享
    def get_pipeline(self):
        """懒加载 Pipeline(OCR 首次初始化约 1~2 秒)。线程安全。"""
        with self._pipeline_lock:
            if self._pipeline is None:
                self._pipeline = Pipeline()
        return self._pipeline

    def reload_config(self):
        self.cfg = load_config()
        with self._pipeline_lock:
            self._pipeline = None   # 下次识别用新配置重建
        log.info("配置已重新加载")

    def switch_page(self, index):
        self.notebook.select(index)

    def run_threaded(self, fn, *args, **kwargs):
        """把耗时操作丢到后台线程,UI 不卡死。"""

        def worker():
            try:
                fn(*args, **kwargs)
            except Exception as e:  # 后台线程兜底,避免静默
                log.exception("后台任务失败")
                self.set_status("出错: %s" % e)

        threading.Thread(target=worker, daemon=True).start()

    def run(self):
        self.root.mainloop()
