---
name: renpy-l10n
description: 编写或修改 Ren'Py 的本地化/翻译（translate 语句、字符串翻译 old/new、语言切换、extract/merge 工作流、翻译标识）时加载。涉及多语言版本、翻译文件组织、运行时切语言时必读。
---

# Ren'Py 本地化速查（translation）

内容来自 translation.html，经 renpy/translation/*.py 与 ast.py Translate 类核验，双语言示例经 8.5.3 SDK lint 验证（l10n_test.rpy + tl/japanese）。

## 原理：查表覆盖（必须先懂）

- 源文本永远不被改；翻译是**覆盖层**：运行时按"翻译标识"查当前语言的映射表，命中显示翻译、未命中回退源文本。
- ast.py Translate.execute 核验：源语句（language None）执行时 `lookup_translate(identifier)` 查表，命中则跳转翻译块；**翻译块（language 非 None）不能直接运行**，只能被查表跳转进入。
- 翻译文件组织：`game/tl/<语言>/` 目录（如 `tl/japanese/`、`tl/zh_cn/`）。

## translate 语句全族

**语句翻译（整条重写 say）**：
```renpy
# game/script.rpy（源）
e "你好，这是需要翻译的对白。" id hello_line    # 显式 id；不写则自动编号（label+内容hash）

# game/tl/japanese/xxx.rpy（翻译）
translate japanese hello_line:
    # e "你好，这是需要翻译的对白。"    # 原文注释保留
    e "こんにちは、これは翻訳が必要な台詞です。"
```

- 标识：`id 名称` 显式指定（稳定）；自动标识 = label + 内容 hash（改内容会变，需重新 extract）。
- 翻译块可**整条重写**：多句 say（长文分段）、`pass`（跳过不显示）、甚至 `$ python 预处理` 后插值（如数字转罗马字再翻）。
- 翻译块内插值 `[var]` 照常求值——**变量名不翻译**，只翻文字部分。

**字符串翻译（old/new 对，screen/menu/角色名）**：
```renpy
# 源：menu 选项、Character(_("名字"))、screen 文本 都会被 extract 收录
translate japanese strings:
    old "继续"
    new "続ける"
    old "艾琳"
    new "アイリン"
```
- 源文本标记：`_("文本")`（单下划线，声明可翻译，显示时翻）、`__("文本")`（立即翻）、`___(...)`。
- **同文本不同上下文消歧**：`"New"` / `"New{#game}"` / `"New{#playlist}"`（`{#上下文}` 后缀区分，如 text skill 的 `{#}` 标签）。

**其他翻译类型**：`translate 语言 image 名 = "本地化素材"`（按语言换图）、`translate 语言 style 名:`（按语言换样式）、`translate 语言 screen 名:` / `python`（界面/代码级）。

## 语言选择与切换

**默认语言优先级**（default-language 节）：`RENPY_LANGUAGE` 环境变量 → `config.language` → 之前选过的语言 → 自动检测（首次运行）→ `config.default_language` → None（源语言）。

**运行时切换**：
```renpy
$ renpy.change_language("japanese")     # Python 形式（force/rebuild 参数）
# screen 里：textbutton "日本語" action Language("japanese")
# 回到源语言：Language(None) / renpy.change_language(None)
```
切换后：对话/字符串/图片/样式全部按新语言的 tl 目录重载。

## 工作流（extract/merge）

extract_strings / merge_strings 是 **launcher（GUI 开发工具）命令**，SDK 命令行只有 lint/compile/run：

1. launcher 选项目 → Generate Translations → 输入语言 → **Extract String Translations**：扫描源文本生成骨架 `game/tl/<语言>/*.rpy`（原文注释 + 空翻译）
2. 翻译者填翻译（或交给翻译工具）
3. launcher → 同一项目 → **Merge String Translations**：把新 extract 的字符串合并进现有文件；默认**不覆盖已存在的非空翻译**（"Replace existing translations" 勾选才会覆盖）；"Reverse languages" 可反向生成
4. 改源文本后：重新 extract + merge 更新

## 常用 API / action

- `Language(language)`：screen action，切语言（None=源语言）
- `renpy.change_language(lang, force=False, rebuild=False)`
- `renpy.known_languages()`：已注册语言集合
- `renpy.get_translation_identifier()` / `get_translation_info()`：调试翻译命中
- `_` / `__` / `___`：字符串翻译标记

## 常见坑

- **自动标识随内容变化**：改源文本内容 → hash 变 → 旧翻译失效，必须重新 extract/merge；不想失效就用显式 `id`。
- **`{tags}` 必须保留**：翻译文本里的 `{b}{color}` 等标签要和原文对齐（对不齐 lint 警告、显示错乱）。
- **插值变量不翻译**：`[points]`、`[name]` 在翻译里原样保留（翻译 `[latin_points]` 需 python 预处理）。
- **字符串翻译不覆盖语句**：say 的文本走语句翻译（translate 块），menu/screen 文本走 strings；别搞混。
- **`{#上下文}` 消歧**：多条相同文本要分别翻译时用 `{#xxx}` 区分。
- **翻译块不能单独运行**：tl 目录里没有对应源语句的 translate 块 lint 会警告（孤儿翻译）；源里没有 id 的 translate 匹配不到。
