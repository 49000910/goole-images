# -*- coding: utf-8 -*-
"""MES+ 查询客户端。

用法(pipeline 内部):
    client = MesPlusClient(cfg["mes_plus"])
    data = client.query("workOrderNo", "WO-20260925-001")

对接真实 MES+ 时只需要改 config.yaml 的 mes_plus 段:
  base_url / query_path / method / auth —— 现场 MES+ 的接口规范请找系统管理员确认,
  把 query_path 里的 {field} {value} 占位符对准真实接口即可。
鉴权凭据一律走环境变量(见 auth.*_env),严禁把 token 写进仓库。
mock: true 时不会发任何网络请求,返回 mock_response,用于开发和演示。
"""
import copy
import logging
import os
import time

import requests

log = logging.getLogger(__name__)


class MesPlusError(RuntimeError):
    pass


class MesPlusClient:
    def __init__(self, cfg):
        self.cfg = cfg or {}
        self.mock = bool(self.cfg.get("mock", False))
        self.base_url = (self.cfg.get("base_url") or "").rstrip("/")
        self.query_path = self.cfg.get("query_path") or ""
        self.method = (self.cfg.get("method") or "GET").upper()
        self.timeout = float(self.cfg.get("timeout_seconds", 10))
        self.retries = int(self.cfg.get("retries", 2))
        self.verify_ssl = bool(self.cfg.get("verify_ssl", True))
        self.extra_headers = dict(self.cfg.get("headers") or {})
        self.auth_cfg = self.cfg.get("auth") or {}
        self.session = requests.Session()
        self._apply_auth()

    # ---------- 鉴权 ----------
    def _apply_auth(self):
        atype = (self.auth_cfg.get("type") or "none").lower()
        if atype == "none":
            return
        token_env = self.auth_cfg.get("token_env")
        if atype == "bearer":
            token = os.environ.get(token_env or "", "")
            if not token and not self.mock:
                raise MesPlusError(
                    "MES+ 使用 Bearer Token,请设置环境变量 %s(不要写入仓库)" % token_env)
            self.session.headers["Authorization"] = "Bearer %s" % token
        elif atype == "basic":
            user = os.environ.get(self.auth_cfg.get("username_env") or "", "")
            pwd = os.environ.get(self.auth_cfg.get("password_env") or "", "")
            if not user and not self.mock:
                raise MesPlusError(
                    "MES+ 使用 Basic 认证,请设置环境变量 %s / %s"
                    % (self.auth_cfg.get("username_env"), self.auth_cfg.get("password_env")))
            self.session.auth = (user, pwd)
        else:
            raise MesPlusError("不支持的鉴权类型: %s" % atype)

    # ---------- 查询 ----------
    def query(self, field, value):
        """按字段查 MES+。返回解析后的 JSON(dict);接口失败抛 MesPlusError。"""
        if not field or value is None or value == "":
            raise MesPlusError("query 参数不完整: field=%r value=%r" % (field, value))
        if self.mock:
            return self._mock_query(field, value)

        if not self.base_url or "{field}" not in self.query_path:
            raise MesPlusError(
                "config.yaml 里 mes_plus.base_url / query_path 未配置"
                "(query_path 需包含 {field} 和 {value} 占位符)")
        url = self.base_url + self.query_path.format(field=field, value=value)
        headers = dict(self.extra_headers)
        last_err = None
        for attempt in range(self.retries + 1):
            try:
                log.info("MES+ 查询(%d/%d): %s %s", attempt + 1, self.retries + 1, self.method, url)
                resp = self.session.request(
                    self.method, url, headers=headers,
                    timeout=self.timeout, verify=self.verify_ssl)
                resp.raise_for_status()
                return self._parse(resp, field, value)
            except requests.RequestException as e:
                last_err = e
                log.warning("MES+ 请求失败: %s", e)
                if attempt < self.retries:
                    time.sleep(1.5 * (attempt + 1))
        raise MesPlusError("MES+ 查询失败(%s=%s): %s" % (field, value, last_err))

    def _parse(self, resp, field, value):
        try:
            data = resp.json()
        except ValueError:
            return {"raw_text": resp.text}
        # MES+ 常见返回 {code, message, data};非 0 code 视为业务失败
        if isinstance(data, dict) and "code" in data and data["code"] not in (0, "0", 200, "200", "success"):
            raise MesPlusError(
                "MES+ 业务失败(%s=%s): code=%s message=%s"
                % (field, value, data.get("code"), data.get("message")))
        return data

    # ---------- mock ----------
    def _mock_query(self, field, value):
        log.info("[MOCK] MES+ 查询: %s=%s", field, value)
        time.sleep(0.05)
        template = self.cfg.get("mock_response")
        if isinstance(template, dict) and template:
            data = copy.deepcopy(template)
        else:
            data = {"code": 0, "message": "ok", "data": {}}
        # 把查询值带进返回,方便演示/核对
        if isinstance(data.get("data"), dict):
            data["data"].setdefault("queryField", field)
            data["data"].setdefault("queryValue", str(value))
        return data
