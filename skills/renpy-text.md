---
name: renpy-text
description: 编写或修改 Ren'Py 的文本与对话（say 语句变体、Character 角色定义、[var] 插值、{b}{size}{color} 等文本标签、转义与换行、say/centered/extend）时加载。涉及对白排版、强调/颜色/字号、动态插值、等待/翻页标签时必读。
---

# Ren'Py 文本与对话速查

内容来自官方文档 text.html / dialogue.html / custom_text_tags.html，逐条经引擎源码（substitutions.py / text.py / lexer.py / character.py）与 8.5.3 SDK 内置 Python 实测核验（83 项断言全过）。

## 文本处理三层管线（先懂这个）

`.rpy 源码字符串` → ① **lexer**（转义展开 + 空白折叠）→ ② **substitute**（`[var]` 插值）→ ③ **tokenize/render**（`{tag}` 文本标签渲染）

三个特殊字符：`\` 转义、`[` 插值、`{` 文本标签。多空格会被折叠为单空格（`"a  b"` → `a b`）。

## say 语句变体（对话）

| 写法 | 效果 |
|---|---|
| `"这是旁白"` | 无角色旁白（narrator，`say_thought` 风格） |
| `"艾琳" "这是对话"` | 字符串直接给角色名（name_only=adv） |
| `e "这是对话"` | Character 对象（最常用） |
| `e "…" nointeract` | 显示但不等待点击 |
| `e "…" (what_color="#8c8")` | say 参数（转发给 renpy.exports.say） |
| `"砰！！" with vpunch` | 台词带转场 |
| `extend "接着的话"` | 续接上一句（= 上一句 + `{fast}` + 新文本） |
| `centered "居中文字"` | 屏幕中央、无窗口（独立语句 say-centered） |
| `vcentered "…"` | 竖排文本居中 |
| 三引号 `"""…"""` | monologue 模式：空行分段，每段一个对话块 |

say 的 Python 等价：`e("…")` → `renpy.say(e, "…")`（源码 Say.execute 核验）。

## Character 角色定义

```renpy
define e = Character("艾琳", who_color="#c8c8ff", what_prefix="「", what_suffix="」")
```

常用参数（源码 character.py 核验）：`name`（None=旁白式无名字）、`kind`（模板基底）、`image`（绑定的图像 tag）、`voice_tag`、`what_prefix/suffix`（台词前后缀）、`who_prefix/suffix`（名字前后缀）、`dynamic`（名字动态求值）、`condition`（Python 表达式为假则跳过该句）、`interact`（False 不等待）、`advance`（False 无法点击跳过）、`ctc`/`ctc_pause`（点击继续指示器）、`screen`（显示对话的 screen 名）。

**特殊角色**（defaultstore.py / 00definitions.rpy 核验）：`narrator`（旁白）、`adv`（默认 ADV 角色）、`nvl`（NVL 多行模式）、`name_only`（字符串名）、`centered`/`vcentered`、`extend`。

**character 命名空间**（避免与变量冲突）：
```renpy
define character.e = Character("艾琳")   # 之后 e "…" 可用
default e = 100                          # 变量 e 互不干扰
```

## 插值 `[expr]`

- 任何 Python 表达式：`e "我是 [player.names[0]]。"`
- 查找顺序：screen 局部 → `interpolate` 命名空间 → 全局
- 转换 flags（可组合，顺序无关，如 `!ul` 与 `!lu` 相同）：

| flag | 作用 | flag | 作用 |
|---|---|---|---|
| `!r` | repr | `!q` | 把值里的 `{` 加倍为 `{{`（防被当标签） |
| `!s` | str | `!u` / `!l` / `!c` | 大写 / 小写 / 首字母大写 |
| `!t` | 翻译字符串 | `!i` | 递归插值（值里再插值） |

- 格式符透传 Python `format()`：`[score:05.1f]`、`[100.0 * p / max:.2]`
- `[var=]` 调试形式：输出 `var=值`（repr）
- 缺变量直接报错；字面 `[` 写 `[[`

**screen 里的插值（text×screen 交接必读）**：screen 的 `text` 控件与 say 同管线，`[var]` 插值原样生效且**作用域更大**——查找顺序：screen 局部（default/参数/SetScreenVariable）→ interpolate → 全局。样式标签全适用；但 `{w}{p}{nw}{fast}{done}` 这类**对话交互标签在 screen 里不适用**（交互归 action/timer），详情见 renpy-screen「screen 中的文本」。

## 文本标签（render 层）

**通用标签**（text.py 源码核验）：

| 标签 | 作用 | 示例 |
|---|---|---|
| `{b}` `{i}` `{u}` `{s}` | 粗体/斜体/下划线/删除线 | `{b}重点{/b}` |
| `{plain}` | 取消 b/i/u/s | `{b}粗 {plain}不粗{/plain} 粗{/b}` |
| `{size=N}` | 字号：`+N`/`-N` 增减、`*N` 乘、纯数字绝对值 | `{size=+10}大{/size}` |
| `{color=#rrggbb}` | 颜色（#rgb/#rgba/#rrggbb/#rrggbbaa） | `{color=#f00}红{/color}` |
| `{alpha=0.5}` | 不透明度（`+`/`-` 增减、`*` 乘） | `{alpha=*0.5}半透明{/alpha}` |
| `{font=文件.ttf}` | 换字体 | `{font=mikachan.ttf}…{/font}` |
| `{k=N}` | 字距 | `{k=.5}宽{/k}` |
| `{cps=N}` | 打字速度（`*N` 倍数） | `{cps=*2}快{/cps}` |
| `{a=url}` / `{a=jump:标签}` / `{a=call:标签}` | 超链接（jump/call/show/showmenu/URL 协议） | `{a=jump:more}更多{/a}` |
| `{image=图.png}` | 行内插图（自闭合） | `{image=heart.png}` |
| `{space=N}` / `{vspace=N}` | 水平/垂直留白（自闭合） | `{space=30}` |
| `{alt}` / `{noalt}` | TTS 朗读/不朗读 | `{alt}爱心{/alt}` |
| `{rt}` `{rb}` `{art}` | 注音（ruby）上/下/交替 | `【東｜とう】` 或 `{rb}東{/rb}{rt}とう{/rt}` |
| `{outlinecolor=#…}` | 描边色 | `{outlinecolor=#0f0}…{/outlinecolor}` |
| `{feature:liga=0}` | OpenType 特性开关 | `{feature:liga=0}…{/feature}` |
| `{=样式名}` | 应用已命名样式 | `{=mystyle}…{/=}` |
| `{#任意}` | 忽略（翻译消歧用） | `"新{#playlist}"` |
| `{shader=名字}` | 文本着色器（需开启） | 见 textshaders.html |
| `{vert}` / `{horiz}` | 竖排/横排 | — |

**对话标签**（w/p/nw/fast/done/clear）：

| 标签 | 作用 |
|---|---|
| `{w}` / `{w=1.0}` | 等点击继续 / 等 N 秒 |
| `{p}` / `{p=1.0}` | 结束本段并等待 / N 秒后继续（多段对白） |
| `{nw}` / `{nw=2}` | 本行显示完自动消失（配 `show` 换表情） |
| `{fast}` | 之前文本瞬间显示（配合 {nw} 续句） |
| `{done}` | 之后文本不显示（防跳字，不进历史） |
| `{clear}` | NVL 模式换页（等效 nvl clear，不结束文本块） |

经典组合（换表情续句）：
```renpy
show eileen concerned
e "有时候我会难过。{nw}"
show eileen happy
extend " 但很快就好起来了！"
```

## 转义与字面量（实测引擎行为）

| 源码写法 | 显示 |
|---|---|
| `\"` `\'` `\\` `\n` `\u4f60` | 引号 / 反斜杠 / 换行 / 中文（lexer 层） |
| `%` | **不需要转义**（现代引擎实测：`50%` 原样显示） |
| `\%` | 显示 `%%`（不是 `%`！旧文档的 "%% → %" 是 old_substitutions 旧语法，现代引擎不生效） |
| `\{` / `\[` | 展开为 `{{` / `[[`（供后续层转义） |
| `{{` | 字面 `{`（tokenize 层）；注意 `{{tag}}` 显示为 `{tag}}`（`}}` 不折叠）→ 字面 `{tag}` 写 `{{tag}` |
| `[[` | 字面 `[`（substitute 层） |
| `}` `]` | 无需转义，原样 |
| `\}` `\]` | 只转成单个 `}` / `]`（不是 `}}`/`]]`） |
| `r"…"` | raw 字符串：不转义、不折叠空白 |
| 多空格 | 折叠为单空格：`"a  b"` → `a b`（折叠发生在反斜杠处理**之前**） |
| `\ `（反斜杠空格） | 需放在不会被折叠掉的位置才产生额外空格：实测 `"a\  b"` → `a b`（仍折叠）；`"a \ b"` → `a  b`（两个空格） |

**注意**：`{` 后跟未知标签在渲染时报错（如 `{zzz}`）；`[` 内表达式求值失败也报错。两者都在**渲染期**才校验，lint 查不到。

**插值 flags 实测补充**：`!q` 只把值里的 `{` 加倍为 `{{`（`}` 不动）；flags 顺序无关（`!ul` == `!lu`）；`[expr=]` 调试形式输出 `expr=repr`。

## 对话窗口管理

```renpy
window show            # 显示窗口（默认转场）
window hide            # 隐藏窗口
window auto True       # say 前自动显示、scene/menu 前自动隐藏
```

## 最小示例

```renpy
define e = Character("艾琳", who_color="#c8c8ff")
define character.naomi = Character("娜奥米", who_color="#8c8")

label start:
    scene bg classroom
    with fade
    e "欢迎！{b}今天{/b}学习 {color=#ff8888}文本标签{/color}。"
    $ points = 8
    e "你得了 [points] 分，[points!c] 分！"   # !c 大写首字母
    e "字面量：{{花括号}、[[方括号]、100%（% 无需转义）"
    "这是旁白。{w=1.0}一秒后继续。"
    e "第一段{fast} 第二段" with dissolve
    menu:
        "继续":
            jump start
        "结束":
            return
```

要点：文本标签渲染期才校验（lint 查不到），写后务必**实际运行**看效果；动态文本用插值而非拼接。

## 默认文字速度配置（打字速度层级，源码核验）

想让文本默认按指定速度逐字显示（打字机效果），配置层级如下（引擎 text.py / preferences.py 核验）：

| 配置 | 写法 | 说明 |
|---|---|---|
| 段落级 | `{cps=40}…{/cps}` / `{cps=*2}` | 最高优先，`*N` 为倍数 |
| 角色级 | `define e = Character("艾琳", what_slow_cps=40)` | Character 支持任意 `what_<样式属性>` 参数 |
| 样式级 | `style say_dialogue: slow_cps 40` | say 文本默认样式；可配合 `slow_cps_multiplier 1.5` 乘系数 |
| 引擎兜底 | — | `slow_cps` 为 None/True 时取**玩家偏好** `text_cps`（游戏内设置，运行时值，脚本里读不到） |

**注意**：`text_cps` 是玩家偏好不是项目配置——想在项目里设默认速度，用 `style say_dialogue: slow_cps N`（或 Character `what_slow_cps`），不要写 `define config.text_cps`（不存在此配置）。`{w}`/`{p}` 无参数时引擎是**等待点击**，带参数（`{w=1.0}`）才是等 N 秒。
