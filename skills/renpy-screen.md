---
name: renpy-screen
description: 编写或修改 Ren'Py 的 screen 语言（screen 定义、布局 hbox/vbox/grid/fixed、text/textbutton/button 等控件、样式前缀、action、show/hide/call screen、use 嵌套）时加载。涉及自定义菜单、按钮、状态条、对话框界面、UI 交互时必读。
---

# Ren'Py Screen 语言速查

> 来源 screens.html / style.html / screen_actions.html / screen_special.html，经 sl2 编译器源码（slparser.py/slast.py）核验，示例经 8.5.3 SDK lint 验证。

## 核心模型（必须先懂）

- screen 是**声明式 UI**：每次交互（状态变化）时整块**重新渲染**——不是"画一次"，是"描述每次该长什么样"。
- 块内同时存在**两种语句**：属性列表（`text "hi" xalign 0.5` 的 `xalign 0.5` 是属性）与 **screen 语句**（控件/控制语句）。
- 变量：screen 内可直接用全局变量；`default` 声明 screen 局部状态；`action` 是"点击后做什么"，不是直接赋值。

## screen 定义与属性

```renpy
screen hello_world():
    tag example        # 同名 tag 的 screen 互斥替换
    zorder 1           # 层级（大者更靠前）
    modal False        # True 时阻止下方交互
    style_prefix "pre" # 子控件样式前缀（见②轮）
    layer "screens"    # 显示层

    text "Hello, World."

screen center_text(s, size=42):   # 支持参数
    text s size size
```

属性：`modal`（阻塞下方）/`sensitive`（每次交互求值）/`tag`（同 tag 替换）/`zorder`/`variant`（平台变体）/`style_prefix`/`layer`/`roll_forward`（call 时回滚）。

## 显示与调用

```renpy
show screen hello_world          # 显示（不等待）
hide screen hello_world          # 隐藏
call screen ask_are_you_sure     # 调用：显示并等待，Return(x) 的值赋给结果变量
show screen expr_name            # 用变量名显示
"结果 [result]"                  # call screen 的返回值
```

- `show screen` 立即返回继续；`call screen` 阻塞直到 `Return(value)` / `Jump(label)` / `Hide`。
- screen 持续显示直到被 hide / 同 tag 替换 / `return`（游戏结束时）。

## 布局体系

**容器控件**（子控件按规则摆放）：

| 控件 | 布局规则 | 典型属性 |
|---|---|---|
| `fixed:` | 子控件按各自位置属性**绝对定位** | 子项用 `xalign/yalign/xpos/ypos` |
| `hbox:` | 横向排 | `spacing`（间距） |
| `vbox:` | 纵向排 | `spacing` |
| `grid 列 行:` | 网格（先填行再列，`transpose` 可换） | `spacing` |
| `side "c tl br":` | 九宫格：首字符=中心，其余=位置字母 | 位置字母 t/b/l/r/c 组合 |
| `frame:` / `window:` | 带边框/窗口背景的容器 | 样式 |
| `add "图"` | 显示图像/显示对象（可带位置/transform） | `xalign 1.0 yalign 0.0` |

```renpy
screen ask_are_you_sure:
    fixed:
        text "Are you sure?" xalign 0.5 yalign 0.3
        textbutton "Yes" xalign 0.33 yalign 0.5 action Return(True)
        textbutton "No" xalign 0.66 yalign 0.5 action Return(False)

screen grid_test:
    grid 2 3:
        text "Top-Left"
        text "Top-Right"
        text "Center-Left"
        text "Center-Right"
        text "Bottom-Left"
        text "Bottom-Right"

screen side_test:
    side "c tl br":          # 中心 + 左上 + 右下
        text "Center"
        text "Top-Left"
        text "Bottom-Right"
```

**位置属性**（子控件上直接用，同 transform 属性）：`xalign/yalign/xpos/ypos/xanchor/yanchor/xoffset/yoffset/zoom/rotate/alpha` 等；`at transform名` 可应用 ATL。

**`has` 语句**（⚠ 实测修正）：在**容器控件块内**（button/frame/window/fixed/grid/hbox/side/vbox）替换子布局；**不能写在 screen 顶层**：
```renpy
screen volume_controls():
    frame:
        has vbox           # frame 内直接堆叠，免一层缩进

        bar value Preference("sound volume")
        bar value Preference("music volume")
```

## use：嵌套复用 screen

```renpy
screen file_slot(slot):
    button:
        action Return(slot)
        has hbox

        add "logo_base.png"
        vbox:
            text "Slot [slot]"

screen save_menu():
    grid 2 5:
        for i in range(1, 11):
            use file_slot(i)          # 带参数复用
```

- `use screen名(参数)` / `use expression 表达式 pass (实参)`（动态选择 screen）
- `use ... as 名字` 给嵌套内容命名空间；`id` 用于状态保持。

## 常用控件

**text**：文本显示。属性：`size`（字号）/`color`/`italic`/`bold`/`font`/`outlines`/`xalign` 等（Text Style Properties 全可用）：
```renpy
text "彩色大字" size 40 color "#ff8888"
```

**button / textbutton / imagebutton**（按钮三兄弟，交互属性通用）：

| 属性 | 作用 |
|---|---|
| `action` | 点击触发（**也决定 sensitive/selected**，未单独给时） |
| `alternate` | 右键/长按触发 |
| `hovered` / `unhovered` | 获得/失去焦点时触发 |
| `selected` | 选中态表达式（每交互求值） |
| `sensitive` | 可点性表达式（每交互求值） |
| `keysym` / `alternate_keysym` | 键盘快捷键 |

```renpy
textbutton "开始" action Jump("start") style "my_button"
textbutton "红字" text_color "#ff6666" hovered SetVariable("hover_msg", "悬停中") action Return(1)
button:
    action Return("primary")
    alternate Return("alternate")
    background Solid("#557799")
    xsize 200 ysize 40
    text "主键" size 16
```

- `textbutton "文字"` 的 `text_` 前缀属性透传给内部 text（`text_color`/`text_size`…）；`text_style` 指定文本样式名（默认 `<按钮样式>_text`）。
- `imagebutton`：`idle`/`hover`/`insensitive`/`selected_idle`/`selected_hover` 五态图；`auto "btn_%s.png"` 自动按状态名拼文件名：
```renpy
image btn_idle = Solid("#88aacc", xsize=100, ysize=36)
image btn_hover = Solid("#ffcc88", xsize=100, ysize=36)
imagebutton idle "btn_idle" hover "btn_hover" action Return("img")
```

## 样式体系

**style 语句**（style.html 核验）：
```renpy
style my_button is button:          # is 父 = 继承
    background Solid("#446688")
    hover_background Solid("#6688bb")   # hover_ 前缀 = 悬停态覆盖

style my_button_text is my_button:      # 文本样式默认继承按钮名 + _text
    color "#ffffff"
    hover_color "#ffdd88"
    size 20
```

- style 语句子句：`is 父名`（继承）、`take 样式名`（整体抄属性）、`clear`（清已赋值）、`variant "touch"`（平台条件）、`properties dict`（Python 字典）。
- **使用**：控件 `style "my_button"` 属性；或 screen 级 `style_prefix "my_button"` 让子控件自动前缀（`textbutton "P1"` → 样式 `my_button`，其文本 → `my_button_text`）：
```renpy
screen prefixed_test:
    style_prefix "my_button"
    vbox:
        textbutton "P1" action Return(1)   # 自动用 my_button 样式
```

**前缀机制**（最容易漏）：样式属性加 `idle_`/`hover_`/`selected_`/`insensitive_` 前缀 = 对应状态覆盖；控件还有 `selected_idle_`/`selected_hover_` 组合态：
```renpy
style my_button:
    background Solid("#446688")        # idle 态
    hover_background Solid("#6688bb")  # 悬停态
    insensitive_background Solid("#333")
```

## screen 中的文本（text×screen 混用）

screen 的 `text` 控件与 say 语句共用**同一条渲染管线**（转义 → 插值 → 标签），所以文本知识（见 renpy-text）在这里原样生效，但有四点差别：

- **插值作用域更大**：查找顺序 = **screen 局部（default/参数/SetScreenVariable）→ interpolate 命名空间 → 全局**。`[var]` 能直接吃到 UI 状态：
  ```renpy
  screen profile(name, hp):
      default max_hp = 100
      vbox:
          text "[name]  HP:[hp]/[max_hp]"   # 局部变量/参数都可插值
  ```
- **样式标签全适用**：`{b}{i}{u}{s}{size}{color}{font}{alpha}{cps}{plain}` 等照常（同管线）。
- **对话标签不适用**：`{w}{p}{nw}{fast}{done}` 是 say 的**交互**语义（等待点击/分段），screen 里交互归 `action`/`timer` 管——不要往 screen 文本里塞这些。
- **三层样式叠加**（近者覆盖远者）：文本标签（行内）< textbutton `text_` 前缀属性 < 控件 style 属性。示例：
  ```renpy
  textbutton "确定 {b}存{/b}" text_color "#fff" text_size 24
  #   行内标签(局部)       text_ 前缀属性     style 继承
  ```

另：screen 文本里消息类内容含 `[` 会被当插值解析（`[[` 转义）；`{alt}`（TTS 无障碍）在 screen 里照常有效。

## action 精选（00action_*.rpy 核验）

action 是"点击/触发后做什么"，给 `action`/`hovered`/`unhovered`/`alternate`/`key`/`timer` 等属性。

**Control（流程）**：

| action | 作用 |
|---|---|
| `Return(value)` | 结束 call screen 并返回 value（存 `_return`） |
| `Jump(label)` | 跳转（可跨屏幕终止当前 screen） |
| `Call(label, *args)` | 调用 label（return 回来） |
| `Show(screen)` / `Hide(screen)` | 显示/隐藏（`ToggleScreen` 切换） |
| `ShowTransient(screen)` | 临时显示（切换时自动消失） |
| `NullAction()` | 什么都不做（占位） |

**Data（变量操作，最常用族）**：`SetVariable(name, v)` / `SetScreenVariable(name, v)`（screen 局部）/ `IncrementVariable(name, n=1)` / `ToggleVariable(name, t, f)` / `CycleVariable(name, [a, b, c])`——另有 `LocalVariable`/`Field`/`Dict` 变体。

**Menu（游戏菜单）**：`ShowMenu("save")` / `Quit(confirm=False)` / `MainMenu()` / `Start(label)` / `Continue()`（读档继续）。

**Other**：`Function(fn, *args)`（调 Python 函数，如 `Function(renpy.notify, "hi")`）、`If(expr, true=…, false=…)`（条件 action）、`Confirm(prompt, yes=…, no=…)`（确认框）。

```renpy
textbutton "+1" action SetScreenVariable("_n", _n + 1)
textbutton "退出" action Confirm("确定？", yes=Quit(False), no=NullAction())
```

## 输入控件

**bar / vbar**（数值条，可拖）：`value` 是**数值对象**（或数字 + `range`）：
```renpy
bar value Preference("sound volume")      # 偏好值
bar value StaticValue(50, range=100)      # 静态值
bar value FieldValue(_preferences, "text_cps", range=3)  # 对象字段
bar value AnimatedValue(80, range=100, delay=2.0)       # 平滑动画值
```
属性：`changed 函数`（拖动回调）、`hovered/unhovered/released`。

**input**（文本输入）：`default`（初值）、`length`/`allow`/`exclude`/`prefix`/`suffix`/`mask`（密码）、`changed 函数`（每次改动回调，参数=当前文本）：
```renpy
init python:
    def set_name(v):
        renpy.store._name = v
screen name_input():
    input default "Player" changed set_name
```
`action`（回车触发，覆盖默认返回输入值）；规范做法用 `value InputValue`（如 `VariableInputValue("_name")`）。

**key**（快捷键，screen 级）：`key "p" action …` / 多键 `key ["s", "w"] action …`；`capture` 控制是否拦截事件。

**timer**（定时）：`timer 3.0 action Jump("too_slow")`；`repeat True` 循环、`modal` 控制模态拦截下的触发：
```renpy
screen timed_choice():
    textbutton "Yes" action Return("yes")
    textbutton "No" action Return("no")
    timer 3.0 action Return("too_slow")
```

## 控制语句

| 语句 | 作用 | 示例 |
|---|---|---|
| `default 名 = 值` | 声明 screen **局部状态**（每次交互保持，直到 screen 关闭） | `default club = None` |
| `if/elif/else:` | 条件渲染（每次交互重算） | `if club:` |
| `for i, v in 列表:` | 循环生成控件 | `for i, n in enumerate(numerals):` |
| `on "事件" action …` | screen 生命周期事件：show/hide/replace/replaced | `on "hide" action Hide("nav")` |
| `showif 条件:` / `else:` | 条件显示（可带 appear/show/hide 过渡 transform） | 见下 |
| `python:` / `$ expr` | screen 内执行 Python（局部变量可用） | `$ extra = "x"` |

```renpy
screen scheduler():
    default club = None
    vbox:
        textbutton "Art" action SetScreenVariable("club", "art")
        if club:
            textbutton "Select" action Return(club)

screen countdown():
    default n = 3
    vbox:
        text "[n]"
        showif n > 0:
            timer 1.0 action SetScreenVariable("n", n - 1)
        else:
            text "GO!"
```

## 特殊 screen（say/menu/input 可自定义覆盖）

Ren'Py 内置界面本质是 screen，可覆盖同名定义（screen_special.html）：

**say**（对话界面）：参数 `(who, what)`；**id 契约**：`window` 容器、`who` 名字、`what` 正文——`what` 必须有（Ren'Py 用它算自动前进/ctc）：
```renpy
screen say(who, what):
    window id "window":
        has vbox
        if who:
            text who id "who"
        text what id "what"
```

**choice**（menu 菜单）：参数 `(items)`——每项是对象：`caption`（文案）/`action`（选择动作，None 时是菜单标题）/`chosen`（是否选过）：
```renpy
screen choice(items):
    window:
        style "menu_window"
        vbox:
            style "menu"
            for i in items:
                if i.action:
                    button:
                        action i.action
                        text i.caption
                else:
                    text i.caption
```

**input**（文本输入屏）：`(prompt)`；其他：notify（提示浮条）/nvl/skip-indicator/main-menu/navigation/save/load/preferences/confirm 均可覆盖。

## 常见坑（渲染模型，最核心）

- **每次交互整块重算**：screen 不是"画一次"，是"描述每次长什么样"——状态变化（action/变量/timer）→ 整块重渲染；不要在 screen 里放有副作用的 Python（`python:` 块每次重算都会跑）。
- **screen 局部 vs 全局**：`default` 声明的变量只在本 screen 存活（call 返回/隐藏后丢）；要跨屏保存用全局变量（store）或 persistent。
- **action vs 直接赋值**：`textbutton "x" action SetVariable("n", 1)` 是点击才生效；写 `$ n = 1` 是渲染时立即执行（每帧重算一次！）。
- **`on` 事件不阻塞**（同 ATL）：事件块执行完就结束，不是持续状态。
- **call screen 返回值**：只有 `Return(value)` / `Jump` / `Hide` 能结束；返回存在 `_return`。
- **`show screen` 与 `call screen`**：show 不等待继续走剧情，屏幕留在那里；call 阻塞等返回值。
- **样式前缀**：控件状态样式靠 `idle_/hover_/selected_/insensitive_` 前缀，漏了就一个样式吃遍所有状态。
- **imagebutton 五态图**：idle/hover/insensitive/selected_idle/selected_hover 缺图会黑块（可用 auto 自动拼名）。
