# -*- coding: utf-8 -*-
"""配置加载:config.yaml -> dict,支持相对路径自动解析。"""
import os
from pathlib import Path

import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = PROJECT_ROOT / "config.yaml"


def load_config(path=None):
    """读取配置文件。path 为空时使用项目根目录下的 config.yaml。"""
    cfg_path = Path(path) if path else DEFAULT_CONFIG
    if not cfg_path.exists():
        raise FileNotFoundError("配置文件不存在: %s" % cfg_path)
    with open(cfg_path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}
    # 相对路径一律相对于项目根目录
    rf = cfg.get("rules_file")
    if rf and not os.path.isabs(rf):
        cfg["rules_file"] = str(PROJECT_ROOT / rf)
    out_dir = cfg.get("output", {}).get("dir")
    if out_dir and not os.path.isabs(out_dir):
        cfg.setdefault("output", {})["dir"] = str(PROJECT_ROOT / out_dir)
    return cfg


def load_rules(path=None):
    """读取 OCR 规则文件(rules.yaml)。规则文件是唯一维护入口,禁止在代码里写死。"""
    rule_path = Path(path) if path else PROJECT_ROOT / "rules" / "rules.yaml"
    if not rule_path.exists():
        raise FileNotFoundError("规则文件不存在: %s" % rule_path)
    with open(rule_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    rules = data.get("rules", [])
    if not isinstance(rules, list):
        raise ValueError("规则文件格式错误: rules 必须是列表")
    return rules
