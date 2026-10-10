#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Ren'Py 项目索引器（随 renpy 预设分发）。

用法:
    python indexer.py <sdk_base> <project_dir> <out_json> [user_dir]

机制:
  - 把 SDK 的 renpy.py 作为 renpy.__main__ 模块加载（renpy.py 运行时就是这么
    别名自己的，path_to_saves 等都在里面）。
  - 注册自定义命令 dump_index，然后 bootstrap Ren'Py（一次运行）。
  - 启动过程中 dump() 会写 reflect.json（若传 --json-dump），其中
    location.define/screen/transform/callable 是权威的。
  - dump_index 命令运行时遍历 renpy.game.script.namemap.values() 取 labels
    （8.5.x 中 namemap 以 node 为键，dump.py 的 isinstance(name, str) 检查
    导致 location.label 恒为空——这里直接读 node.name/filename/linenumber）。
  - 合并输出统一索引 JSON。

环境依赖: RENPY_PATH_TO_SAVES（可选，重定向存档/token 目录）
"""
import os
import sys
import json
import importlib.util

renpy_base = sys.argv[1]
project_dir = sys.argv[2]
out_file = sys.argv[3]
user_dir = sys.argv[4] if len(sys.argv) > 4 else os.path.join(os.path.dirname(project_dir), ".renpy-user")

sys.path.append(renpy_base)
os.environ.setdefault("RENPY_PATH_TO_SAVES", user_dir)

# 1. 加载 renpy.py 为 renpy.__main__（不执行其 main()，仅取函数定义）。
_main_spec = importlib.util.spec_from_file_location("renpy.__main__", os.path.join(renpy_base, "renpy.py"))
_main_mod = importlib.util.module_from_spec(_main_spec)
sys.modules["renpy.__main__"] = _main_mod
_main_spec.loader.exec_module(_main_mod)

# 2. 导入 renpy 包并把 __main__ 属性指过去。
import renpy
renpy.__main__ = _main_mod

_reflect = os.path.join(user_dir, "reflect-%d.json" % os.getpid())


def dump_index():
    """自定义命令：写出项目索引 JSON。"""
    from renpy.arguments import ArgumentParser

    ap = ArgumentParser(description="Dump the project index JSON.")
    ap.add_argument("--index-out", dest="index_out", required=True)
    args = ap.parse_args()

    index = {"error": False, "labels": {}, "defines": {}, "screens": {}, "transforms": {}, "callable": {}}

    # labels: namemap 以 node 为键（node == name，hash 相同），遍历 values()。
    for node in renpy.game.script.namemap.values():
        n = node.name
        if isinstance(n, str) and n and not n.startswith("_"):
            fn = (node.filename or "").replace("\\", "/")
            if fn.startswith("game/"):
                index["labels"][n] = [fn, node.linenumber]

    # defines/screens/transforms/callable: 复用启动时 dump() 写出的 reflect.json。
    if os.path.exists(_reflect):
        try:
            with open(_reflect, encoding="utf-8") as f:
                rj = json.load(f)
            loc = rj.get("location", {})
            index["defines"] = loc.get("define", {})
            index["screens"] = loc.get("screen", {})
            index["transforms"] = loc.get("transform", {})
            index["callable"] = loc.get("callable", {})
        except Exception as e:  # noqa: BLE001
            index["error"] = "reflect read failed: %s" % (e,)

    # ── 增强分类：人物 / 转场 / 变量（扫描 game/*.rpy 源码分类） ──
    import re

    characters = {}
    transitions = {}
    variables = {}

    def put(target, name, fn, ln):
        if not name or name.startswith("_"):
            return
        target[name] = [fn, ln]

    TRANSITION_RE = re.compile(
        r"^(Fade|Dissolve|ImageDissolve|MoveTransition|Move|Pixellate|Slide|MultipleTransition|"
        r"ComposeTransition|CropMove|PushMove|MoveFactory|AlphaDissolve|OldMoveTransition|"
        r"TouchDissolve|WipeTransition|Zoom|Squish|flashbulb|irisout|irisin)\s*\("
    )

    game_dir = os.path.join(project_dir, "game")
    if os.path.isdir(game_dir):
        try:
            names = sorted(os.listdir(game_dir))
        except OSError:
            names = []
        for fn in names:
            if not fn.endswith(".rpy"):
                continue
            path = os.path.join(game_dir, fn)
            try:
                with open(path, encoding="utf-8") as f:
                    for ln, raw in enumerate(f, 1):
                        line = raw.strip()
                        m = re.match(r"^define\s+([A-Za-z_][\w.]*)\s*=\s*(.*)$", line)
                        if m:
                            name, val = m.group(1), m.group(2)
                            short = "game/" + fn
                            if re.match(r"^Character\s*\(", val):
                                put(characters, name, short, ln)
                            elif TRANSITION_RE.match(val):
                                put(transitions, name, short, ln)
                            elif not re.match(r"^(config\.|gui\.|style\.)", name):
                                put(variables, name, short, ln)
                            continue
                        m = re.match(r"^default\s+([A-Za-z_][\w.]*)", line)
                        if m:
                            put(variables, m.group(1), "game/" + fn, ln)
                            continue
                        m = re.match(r"^\$\s*([A-Za-z_][\w.]*)\s*=", line)
                        if m:
                            put(variables, m.group(1), "game/" + fn, ln)
                            continue
                        m = re.match(r"^transform\s+([A-Za-z_][\w.]*)", line)
                        if m:
                            put(transitions, m.group(1), "game/" + fn, ln)
                            continue
            except Exception:  # noqa: BLE001
                pass

    # 把 AST 的 transforms（transform 语句）并入转场
    for name, loc in index["transforms"].items():
        transitions.setdefault(name, loc)

    index["characters"] = characters
    index["transitions"] = transitions
    index["variables"] = variables

    with open(args.index_out, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    try:
        os.remove(_reflect)
    except OSError:
        pass

    return False


import renpy.arguments as _arguments  # noqa: E402

_arguments.register_command("dump_index", dump_index)

os.makedirs(os.path.dirname(out_file), exist_ok=True)

sys.argv = ["renpy.py", project_dir, "dump_index", "--index-out=" + out_file, "--json-dump=" + _reflect]

import renpy.bootstrap  # noqa: E402

renpy.bootstrap.bootstrap(renpy_base)
