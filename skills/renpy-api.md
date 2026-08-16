---
name: renpy-api
description: 编写或修改 Ren'Py 脚本用到 Python 层 API 时加载：renpy.* 函数（say/notify/pause/show_screen/restart_interaction/screenshot/random 等）、persistent 持久化、renpy.music/sound 音频、store 变量与存档。涉及保存进度、播放音乐、系统提示、Python 集成时必读。
---

# Ren'Py API 速查（renpy.* / persistent / 音频）

内容经 renpy/exports（212 个 renpy.* 函数）与 audio/persistent 源码核验，示例经 8.5.3 SDK lint 验证（api_test.rpy）。

## 核心概念

- **store = 全局变量空间**：脚本里 `default x = 1` / `$ x = 2` / `init python: x = 3` 都进 store，任何地方可读。
- **persistent = 跨存档持久数据**：`default persistent.xxx` 声明的数据在**所有存档/所有周目**间保留（未读时也保留），适合成就/解锁/结局记录。
- **renpy.* 是 Python 函数**：`$ renpy.notify(...)` 等价于语句形式的对应物；语句（say/play/show）是语法糖，Python 形式更灵活。
- **音频三通道**：`music`（背景乐，循环）、`sound`（音效）、`voice`（语音）——`renpy.music.*` 管 music/voice 通道，`renpy.sound.*` 管 sound 通道。

## persistent（跨存档数据）

```renpy
default persistent.unlocked = []        # 只声明一次，之后直接读写
default persistent.best_score = 0

label finish:
    $ persistent.best_score = max(persistent.best_score, score)
    $ persistent.unlocked.append("成就1")
    if "成就1" in persistent.unlocked:
        "已解锁成就1"
```

- 只存**简单可 pickle 数据**（数字/字符串/列表/字典）；别存对象/图片。
- 多游戏共存用 `config.persistent.unique_name`；合并规则 `renpy.persistent.default_merge`（列表默认并集）。
- persistent 变化后如需立即刷新界面 → `renpy.restart_interaction()`。

## 常用 renpy.*（源码核验，212 个中精选）

> 语句的 Python 等价（renpy.say/jump/call/show/hide/menu…）见 **renpy-core 映射表**，这里只列 core 没覆盖的"无语句形式"API。

**对话/交互**：

| 函数 | 作用 |
|---|---|
| `renpy.notify(msg)` | 右上角系统提示浮条（无语句形式） |
| `renpy.pause(sec)` | 暂停等待（0 或省略=等点击；`pause` 语句的 Python 形式） |
| `renpy.restart_interaction()` | 立即重算一次交互（改完状态让界面刷新） |
| `renpy.timeout(sec)` | 设置本次交互超时（到点自动继续） |
| `renpy.end_interaction(value)` | 结束交互并返回 value |

**界面**：`renpy.show_screen(name)` / `renpy.hide_screen(name)` / `renpy.call_screen(name, *args)`（返回 Return 值）/ `renpy.display_notify(msg)`。

**音频**：
```python
renpy.music.play("bgm.ogg", loop=True, fadein=1.0, fadeout=1.0)  # 换背景乐
renpy.music.queue("bgm2.ogg")        # 排队（当前播完接上）
renpy.music.stop(fadeout=2.0)
renpy.music.set_volume(0.5, delay=1.0, channel="music")
renpy.sound.play("click.ogg")        # 音效通道
renpy.music.get_playing(channel="music")  # 正在播的曲目
```
语句等价：`play music "bgm.ogg" loop` / `queue music` / `stop music` / `play sound`。

**系统**：`renpy.screenshot(filename)`（截图存文件）、`renpy.random`（随机：randint/choice/shuffle）、`renpy.open_url(url)`（开浏览器）、`renpy.movie_cutscene(path, loops=0)`（播放视频）。

## 常见坑（实测/源码核验）

- **`init python` 里不需要 `import renpy`**——renpy 自动可用；实测：写了 `import renpy` 且函数体引用 `renpy.music` 会在 lint 时触发模块属性异常（00mixers 初始化失败），删掉即好。
- **`renpy.music` vs `renpy.sound`**：play 背景乐用 music，音效用 sound；用错通道会导致音效被 stop music 一起停。
- **persistent 别存大对象/不可 pickle 数据**（会存档失败）；列表默认合并规则是并集。
- **音频文件缺失**：play 运行时警告不崩溃，但 lint 可能报告；开发期用注释占位（见 renpy-core 剧本策略）。
- **`renpy.show_screen` 不触发等点击**：要"显示并等待"用 `call screen` 语句或 `renpy.call_screen`。
- **`renpy.say` 在函数里要用 `renpy.say(None, ...)` 或角色对象**：`who` 不能传字符串角色名（name_only 由语句层处理）。
- **persistent 改动不自动刷新界面**：需要 `renpy.restart_interaction()`（或下次交互自然重算）。
- **存档/令牌写入位置（本开发模式重定向）**：Ren'Py 默认把存档、令牌、persistent 写到 `%APPDATA%\RenPy`，沙箱下会被拦截。本开发模式用 `RENPY_PATH_TO_SAVES` 环境变量重定向到项目 `.renpy-user/`（官方 `renpy.py` 支持）。若手动运行 Ren'Py 命令（如直接调 `renpy.py <项目> lint`），**需带上该环境变量**，否则沙箱会报 `%APPDATA%` 权限错误。
