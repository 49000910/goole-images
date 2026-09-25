# -*- coding: utf-8 -*-
"""拍照采集页:相机预览 / 拍照 / 文件导入,可折叠的相机参数与采集历史面板。"""
import os
import subprocess
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

import cv2
from PIL import Image, ImageTk

from ..config import PROJECT_ROOT
from .widgets import CollapsibleFrame, ScrollFrame

THUMB_W, THUMB_H = 150, 112
PREVIEW_W, PREVIEW_H = 800, 480


def open_in_explorer(path):
    path = str(path)
    try:
        if os.name == "nt":
            os.startfile(path)
        elif os.uname().sysname == "Darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
    except OSError as e:
        raise RuntimeError("打开失败: %s" % e)


class CapturePage(ttk.Frame):
    def __init__(self, app):
        super().__init__(app.notebook, padding=8)
        self.app = app
        self.cap = None
        self._preview_job = None
        self._photo = None            # 防止 ImageTk 被回收
        self._thumb_refs = {}
        self._thumb_btns = {}
        self._selected_thumb = None   # 选中缩略图的文件路径
        self.save_dir = Path(app.cfg.get("capture", {}).get("save_dir")
                             or PROJECT_ROOT / "captures")
        self.save_dir.mkdir(parents=True, exist_ok=True)

        self._build()
        self.refresh_gallery()
        self.app.run_threaded(self._enumerate_devices)

    # ---------------------------------------------------------------- 布局
    def _build(self):
        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=1)

        # 顶栏:设备与操作
        bar = ttk.Frame(self)
        bar.grid(row=0, column=0, sticky="ew", pady=(0, 6))
        ttk.Label(bar, text="相机:").pack(side="left")
        self.device_var = tk.StringVar()
        self.device_box = ttk.Combobox(bar, textvariable=self.device_var,
                                       state="readonly", width=22)
        self.device_box.pack(side="left", padx=(2, 6))
        ttk.Button(bar, text="刷新设备", command=self._on_refresh_devices).pack(side="left")
        ttk.Label(bar, text="  分辨率:").pack(side="left")
        self.res_var = tk.StringVar(value="1280x720")
        self.res_box = ttk.Combobox(bar, textvariable=self.res_var, state="readonly",
                                    width=12,
                                    values=["640x480", "1280x720", "1920x1080", "2592x1944"])
        self.res_box.pack(side="left", padx=(2, 6))
        self.start_btn = ttk.Button(bar, text="开始预览", command=self.start_preview)
        self.start_btn.pack(side="left", padx=2)
        self.stop_btn = ttk.Button(bar, text="停止预览", command=self.stop_preview, state="disabled")
        self.stop_btn.pack(side="left", padx=2)
        self.snap_btn = ttk.Button(bar, text="\U0001F4F7 拍照", command=self.take_photo, state="disabled")
        self.snap_btn.pack(side="left", padx=6)
        ttk.Button(bar, text="从文件导入", command=self.import_file).pack(side="left", padx=2)

        # 预览区
        holder = ttk.Frame(self)
        holder.grid(row=1, column=0, sticky="nsew")
        holder.columnconfigure(0, weight=1)
        holder.rowconfigure(0, weight=1)
        self.preview = ttk.Label(holder, text="\n  点击「开始预览」打开相机  \n",
                                 anchor="center", relief="groove",
                                 background="#222222", foreground="#dddddd")
        self.preview.grid(row=0, column=0, sticky="nsew", padx=(0, 4))

        # 可折叠:相机参数
        self.opt_panel = CollapsibleFrame(self, title="相机参数", expanded=False)
        self.opt_panel.grid(row=2, column=0, sticky="ew", pady=(6, 2))
        self.mirror_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(self.opt_panel.body, text="镜像画面(自拍习惯)",
                        variable=self.mirror_var).grid(row=0, column=0, sticky="w")
        ttk.Label(self.opt_panel.body, text="保存目录:").grid(row=1, column=0, sticky="w", pady=(4, 0))
        self.save_dir_var = tk.StringVar(value=str(self.save_dir))
        ttk.Entry(self.opt_panel.body, textvariable=self.save_dir_var, width=52)\
            .grid(row=2, column=0, sticky="w", pady=(0, 2))
        ttk.Button(self.opt_panel.body, text="更改",
                   command=self._choose_save_dir).grid(row=2, column=1, padx=6)

        # 可折叠:采集历史
        self.history_panel = CollapsibleFrame(self, title="采集历史(0 张)", expanded=True)
        self.history_panel.grid(row=3, column=0, sticky="ew")
        top = ttk.Frame(self.history_panel.body)
        top.pack(fill="x")
        ttk.Button(top, text="发送到识别查询页", command=self.send_to_recognize)\
            .pack(side="left", padx=(0, 6))
        ttk.Button(top, text="打开文件夹",
                   command=lambda: open_in_explorer(self.save_dir_var.get()))\
            .pack(side="left", padx=(0, 6))
        ttk.Button(top, text="删除选中", command=self.delete_selected).pack(side="left")
        self.gallery = ScrollFrame(self.history_panel.body, height=THUMB_H + 46)
        self.gallery.pack(fill="x", pady=(4, 0))
        self.refresh_gallery()

    # ---------------------------------------------------------------- 相机
    def _api_flag(self):
        return cv2.CAP_DSHOW if os.name == "nt" else cv2.CAP_ANY

    def _enumerate_devices(self):
        """扫描 0~5 号索引,能出图的记为可用设备(线程里跑,避免卡 UI)。"""
        found = []
        for idx in range(6):
            cap = cv2.VideoCapture(idx, self._api_flag())
            ok = cap.isOpened()
            if ok:
                ok, _ = cap.read()
            cap.release()
            if ok:
                found.append(idx)
            if len(found) >= 4:
                break
        self.app.msg_queue.put(("devices", found))

    def _on_refresh_devices(self):
        self.device_box.configure(values=())
        self.app.set_status("正在扫描相机设备...")
        self.app.run_threaded(self._enumerate_devices)

    def on_devices_found(self, found):
        self._device_list = found
        values = ["%d 号相机" % i for i in found]
        self.device_box.configure(values=values)
        if values:
            self.device_var.set(values[0])
            self.app.set_status("发现 %d 台相机,点「开始预览」" % len(found))
        else:
            self.app.set_status("未发现相机,可用「从文件导入」")

    def start_preview(self):
        if self.cap is not None:
            return
        idx = self._parse_device_index()
        if idx is None:
            messagebox.showwarning("提示", "请先「刷新设备」并选择相机,或确认相机已连接。", parent=self)
            return
        w, h = self.res_var.get().split("x")
        cap = cv2.VideoCapture(idx, self._api_flag())
        if not cap.isOpened():
            messagebox.showerror("错误", "无法打开相机 %s" % idx, parent=self)
            return
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, int(w))
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, int(h))
        self.cap = cap
        self.start_btn.configure(state="disabled")
        self.stop_btn.configure(state="normal")
        self.snap_btn.configure(state="normal")
        self.app.set_status("预览中(相机 %s @ %s)..." % (idx, self.res_var.get()))
        self._preview_loop()

    def _parse_device_index(self):
        text = self.device_var.get()
        if not text:
            return 0 if self._device_list else None
        try:
            return int(text.split("-")[0])
        except ValueError:
            return None

    def _preview_loop(self):
        if self.cap is None:
            return
        ok, frame = self.cap.read()
        if not ok:
            self.app.set_status("相机读帧失败,请检查连接后重新开始预览")
            self._preview_job = self.after(300, self._preview_loop)
            return
        if self.mirror_var.get():
            frame = cv2.flip(frame, 1)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(rgb)
        img.thumbnail((PREVIEW_W, PREVIEW_H))
        self._photo = ImageTk.PhotoImage(img)
        self.last_frame = img
        self.preview.configure(image=self._photo, text="")
        self._preview_job = self.after(30, self._preview_loop)

    def stop_preview(self):
        if self._preview_job:
            self.after_cancel(self._preview_job)
            self._preview_job = None
        if self.cap is not None:
            self.cap.release()
            self.cap = None
        try:
            self.preview.configure(image="", text="\n  预览已停止  \n")
            self.start_btn.configure(state="normal")
            self.stop_btn.configure(state="disabled")
            self.snap_btn.configure(state="disabled")
        except tk.TclError:
            pass  # 页面已销毁
        self.app.set_status("预览已停止")

    def take_photo(self):
        if self.cap is None or not hasattr(self, "last_frame"):
            messagebox.showwarning("提示", "请先开始预览再拍照。", parent=self)
            return
        img = self.last_frame
        if img.mode != "RGB":
            img = img.convert("RGB")
        name = "capture_%s.png" % datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        path = Path(self.save_dir_var.get()) / name
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path)
        self.refresh_gallery(select=path)
        self.app.set_status("已保存: %s" % path.name)

    def import_file(self):
        import shutil
        files = filedialog.askopenfilenames(
            title="选择要采集的图片",
            filetypes=[("图片", "*.jpg *.jpeg *.png *.bmp"), ("所有文件", "*.*")],
            parent=self)
        for f in files:
            shutil.copy(f, Path(self.save_dir_var.get()) / Path(f).name)
        if files:
            self.refresh_gallery()
            self.app.set_status("已导入 %d 张图片" % len(files))

    def _choose_save_dir(self):
        d = filedialog.askdirectory(title="选择采集保存目录", parent=self)
        if d:
            self.save_dir_var.set(d)
            self.save_dir = Path(d)
            self.save_dir.mkdir(parents=True, exist_ok=True)
            self.refresh_gallery()

    # ---------------------------------------------------------------- 采集历史
    def refresh_gallery(self, select=None):
        for w in self.gallery.inner.winfo_children():
            w.destroy()
        self._thumb_refs, self._thumb_btns = {}, {}
        self._selected_thumb = None
        base = Path(self.save_dir_var.get())
        images = sorted(list(base.glob("*.png")) + list(base.glob("*.jpg")) +
                        list(base.glob("*.jpeg")),
                        key=lambda p: p.stat().st_mtime, reverse=True)
        self.history_panel.set_title("采集历史(%d 张)" % len(images))

        per_row = 5
        for i, p in enumerate(images[:40]):   # 最多展示 40 张,防止卡顿
            img = Image.open(p)
            img.thumbnail((THUMB_W, THUMB_H))
            photo = ImageTk.PhotoImage(img)
            self._thumb_refs[str(p)] = photo
            cell = ttk.Frame(self.gallery.inner)
            cell.grid(row=i // per_row, column=i % per_row, padx=4, pady=4)
            btn = tk.Button(cell, image=photo, relief="flat", bd=0,
                            highlightthickness=2, highlightbackground="#bbbbbb",
                            command=lambda pp=str(p): self._select_thumb(pp))
            btn.pack()
            self._thumb_btns[str(p)] = btn
            ttk.Label(cell, text=p.name[:18], font=("", 8)).pack()
            btn.bind("<Double-Button-1>", lambda e, pp=str(p): self._select_thumb(pp, send=True))

        if images:
            self._select_thumb(str(select or images[0]))

    def _select_thumb(self, path, send=False):
        self._selected_thumb = path
        for pp, btn in self._thumb_btns.items():
            btn.configure(highlightbackground="#1a73e8" if pp == path else "#bbbbbb")
        self.app.set_status("已选中: %s%s" % (Path(path).name, "(双击可直接发送)" if send else ""))
        if send:
            self.send_to_recognize()

    def send_to_recognize(self):
        if not self._selected_thumb:
            messagebox.showinfo("提示", "请先点击选择一张采集图片。", parent=self)
            return
        self.app.recognize_page.set_image(self._selected_thumb)
        self.app.switch_page(1)
        self.app.set_status("已载入识别页: %s" % Path(self._selected_thumb).name)

    def delete_selected(self):
        if not self._selected_thumb:
            return
        if not messagebox.askyesno("确认", "删除 %s ?" % Path(self._selected_thumb).name, parent=self):
            return
        try:
            Path(self._selected_thumb).unlink()
        except OSError as e:
            messagebox.showerror("错误", str(e), parent=self)
            return
        self.refresh_gallery()
        self.app.set_status("已删除")

    # ---------------------------------------------------------------- 收尾
    def destroy(self):
        self.stop_preview()
        super().destroy()
