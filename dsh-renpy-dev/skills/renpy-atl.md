---
name: renpy-atl
description: 编写或修改 Ren'Py 的 ATL 动画与变换（transform 定义、interpolation 插值、on/parallel/choice/repeat 语句、warpers、位置/缩放/旋转属性、show x at）时加载。涉及图像移动、淡入淡出、按钮 hover 效果、循环动画、转场时必读。
---

# Ren'Py ATL 速查（Animation and Transformation Language）

内容来自官方文档 transforms.html / transform_properties.html，逐条经引擎源码（atl.py / ast.py Transform / 000atl.rpy warpers）核验，全部语句经 8.5.3 SDK lint 验证（atl_test.rpy）。

## 核心概念（先懂这个）

- ATL 是**描述"随时间变化"的声明式语言**，不是 Python：语句按顺序执行，插值语句让属性平滑过渡。
- **表达式求值时机**：ATL 里用到的表达式在 transform **首次执行时**求值（show 时/作为 screen 显示时），不是语句执行到那行时——用变量当参数要先保证变量已定义。
- ATL 的"时钟"：每次 show 重新开始；同一 tag 的 show 继承动画时间基准（at）。
- transform 定义在 store 命名空间，用 `show 图 at 变换名` 应用。

## transform 定义与使用

```renpy
transform left_to_right:
    xalign 0.0
    linear 2.0 xalign 1.0
    repeat

transform slide_in(duration=1.0):   # 支持参数（默认值、*args、**kwargs）
    xalign 0.0
    easein_quad duration xalign 1.0

label start:
    show eileen happy at left_to_right
    show eileen happy at slide_in(0.5)
```

`image 名: <atl块>` 也可直接写 ATL（图像自带动画）；`show 图: <atl 块>` 行内 ATL（仅该次显示生效）。

## ATL 语句速查（源码 atl.py 核验）

| 语句 | 作用 | 示例 |
|---|---|---|
| `属性 值` | 立即设置 transform 属性 | `xalign 0.9`、`xanchor .3 xpos 100` |
| `linear 2.0 属性 值` | **插值动画**：2 秒内平滑过渡（warper 名 + 时长 + 属性） | `linear 2.0 xalign 0.5 yalign 0.5` |
| `warp 函数 2.0 属性 值` | 用自定义 warper 函数插值 | `warp my_warp 1.0 alpha 1.0` |
| `pause 2.0` / 裸数字 `2.0` | 停顿 N 秒（"pause" 关键词可省略） | `pause duration` |
| `block:` | 作用域块（内容可整体 repeat） | `block: linear 1 xoffset 10 … repeat` |
| `repeat` / `repeat 3` | 无限循环 / 循环 N 次 | 动画循环必备 |
| `parallel:` | 并行分支（各分支独立时间线，都完成后才继续） | 见下例 |
| `choice:` / `choice 2.0:` | 加权随机分支（权重默认 1.0） | 见下例 |
| `on 事件:` | 事件监听块：show/hide/hover/idle/selected_hover…（进入状态不阻塞） | 见下例 |
| `time 2.0` | 时间标签：从块开始算到该时刻执行后续 | 长动画分段 |
| `event 名` | 产生自定义事件（配 `on 名` 接收） | `event show` |
| `"图.png"` | 切换子显示对象（可 `with 转场`） | `"bw.png" with Dissolve(0.5)` |
| `contains 显示对象` / `contains:` | 嵌套子 ATL/显示对象（外层可继续执行其他语句） | 见下例 |
| `transform_表达式` | 把另一个 transform 当作子动画运行 | `move_right` |
| `function 函数` | Python 回调 `f(trans, st, at)`；返回秒数=间隔再调，None=进入下条 | 见下例 |
| `pass` | 空语句 | — |
| `animation` | image 定义里标记动画（配合 `show` 自动动画） | 见下例 |

**常用组合**：

```renpy
# 左右来回（repeat）
show logo base:
    xalign 0.0
    linear 1.0 xalign 1.0
    linear 1.0 xalign 0.0
    repeat

# 并行：横向+纵向各自循环
show logo base:
    parallel:
        xalign 0.0
        linear 1.3 xalign 1.0
        linear 1.3 xalign 0.0
        repeat
    parallel:
        yalign 0.0
        linear 1.6 yalign 1.0
        linear 1.6 yalign 0.0
        repeat

# 随机表情（加权）
image eileen random:
    choice:
        "eileen happy"
    choice:
        "eileen vhappy"
    choice 2.0:
        "eileen concerned"
    pause 1.0
    repeat

# hover 反馈（按钮/图像交互）
transform pulse_button:
    on hover, idle:
        linear .25 zoom 1.25
        linear .25 zoom 1.0

# function 回调：振动
init python:
    import random
    def slide_vibrate(trans, st, at, /):
        if st > 1.0:
            trans.xoffset = 0
            return None
        trans.xoffset = random.randrange(-10, 11)
        return 0
# transform 里写：function slide_vibrate

# contains：嵌套动画后继续外层（否则子循环会卡住）
transform move_anim:
    contains an_animation   # 子动画循环
    xalign 0.0
    linear 1.0 yalign 1.0   # 外层照常继续
```

## warpers（时间函数）

`<warper名> <时长> <属性> <值>` 中 warper 控制插值节奏（000atl.rpy 注册，Robert Penner 缓动）：

| 常用 | 效果 | 变体（×8 家族） |
|---|---|---|
| `linear` | 匀速 | — |
| `ease` | 缓入缓出（先慢后快再慢） | `easein`/`easeout` |
| `ease_quad` | 二次缓动 | `easein_quad`/`easeout_quad` |
| `ease_cubic` | 三次缓动（更陡） | in/out 同 |
| `ease_back` | 过冲回弹 | in/out |
| `ease_elastic` | 弹性震荡 | in/out |
| `ease_bounce` | 落地弹跳 | in/out |
| `pause`/`instant` | 内部用：瞬间跳变 | — |

自定义：`@renpy.atl_warper` 注册 `def f(t): return t'`（t 0→1 映射到 0→1）：

```renpy
python early:
    @renpy.atl_warper
    def custom_warp(t):
        return t * t
# transform 里：warp custom_warp 1.0 xalign 1.0
```

## 常用属性（transform_properties.html 精选）

| 类 | 属性 | 说明 |
|---|---|---|
| 位置 | `xpos` `ypos` `pos` | 左上角坐标（0-1 相对 / 像素） |
| 锚点 | `xanchor` `yanchor` `anchor` | 对齐点（0=左/上 1=右/下） |
| 快捷 | `xalign` `yalign` `align` | = pos 和 anchor 同时设（`xalign 0.5` 水平居中） |
| 中心 | `xcenter` `ycenter` `xycenter` | 按中心定位 |
| 偏移 | `xoffset` `yoffset` | 像素偏移（叠加） |
| 大小 | `xsize` `ysize` `xysize` | 缩放到的尺寸；`fit` 值 contain/cover/fill/scale-down/scale-up |
| 缩放 | `zoom` `xzoom` `yzoom` | 倍数（1.0=原大，2.0=两倍） |
| 旋转 | `rotate` | 角度（度）；`rotate_pad True` 旋转时留边 |
| 像素 | `alpha`（透明度 0-1）、`additive`（叠加混合）、`blur`、`matrixcolor`（矩阵） | |
| 裁剪 | `crop` `corner1` `corner2` | 裁剪区域 |
| 极坐标 | `around` `angle` `radius` | 围绕某点转圈 |
| 分层 | `layer` `zorder` | 显示层级 |
| 其他 | `subpixel`（亚像素平滑移动）、`nearest`（像素风） | |

属性插值单位：`rotate` 角度、`zoom` 倍数、`alpha` 0-1、`xalign/yalign` 0-1、`xpos` 可相对可像素。

## 内置 transform（transforms.html）

`left` `right` `center` `top` `bottom` `topleft` `topright` `truecenter`（全屏居中）、`offscreenleft` `offscreenright`（屏幕外）、`reset`（重置默认）、`default`（默认位置，可被 `config.default_transform` 重定义）。

```renpy
show eileen happy at left        # 左下
show eileen happy at truecenter  # 屏幕中央
show eileen happy at offscreenright
```

## 常见坑（源码核验）

- **表达式求值时机**：参数在 transform 首次执行时才求值——用 `duration` 变量要先定义。
- **repeat 无限循环会卡住后续语句**：循环块后面永远到不了，用 `time N` 提前跳出或把循环放 `contains` 里。
- **on 语句不阻塞**：`on show:` 块执行完就结束该状态，不会一直停在块内（除非块内有 pause/repeat）。
- **parallel 的等待**：所有并行分支都完成后才执行后续（一个分支 repeat 会无限等待）。
- **属性别名**：`xalign 0.5` 和 `xpos 0.5 xanchor 0.5` 等价；先设 pos 再插值注意锚点。
- **transform 复用**：同一 transform 同时给多个图像用没问题；但带状态的 ATL（on/choice）在 screen 里要 `at Transform(...)` 独立实例。
- **rotate 与 zoom 组合**：rotate 会改变包围盒（rotate_pad），zoom 在旋转后应用。
- **warp 函数签名**：`(t: float) -> float`，t 从 0 到 1，返回 0 到 1。

## 最小示例

```renpy
transform float_loop:
    block:
        yoffset 0
        linear 1.0 yoffset -20
        linear 1.0 yoffset 0
        repeat

transform fade_hover:
    on hover:
        alpha 1.0
    on idle:
        alpha 0.6

label atl_demo:
    scene bg classroom
    show eileen happy at truecenter
    show eileen happy at float_loop
    pause
    show eileen happy at fade_hover
    pause
    return
```

要点：ATL 是动画语言，lint 只验语法——写完后实际运行看运动效果；插值单位（相对/像素、角度、倍数）最容易写错。

## matrixcolor：颜色矩阵（transform 属性）

`matrixcolor` 是 transform 属性，值 = **手写 `Matrix([...])`（4×4）** 或 **`ColorMatrix` 表达式**（00matrixcolor.rpy / matrixcolor.html 核验）。

**4×4 矩阵语义**（预乘 alpha 颜色，通道可交叉混合）：
```
R' = R*a + G*b + B*c + A*d      G' = R*e + G*f + B*g + A*h
B' = R*i + G*j + B*k + A*l      A' = R*m + G*n + B*o + A*p
```
手写示例（交换红绿通道）：
```renpy
transform swap_red_green:
    matrixcolor Matrix([ 0.0, 1.0, 0.0, 0.0,
                         1.0, 0.0, 0.0, 0.0,
                         0.0, 0.0, 1.0, 0.0,
                         0.0, 0.0, 0.0, 1.0 ])
```

**内置 ColorMatrix**（全在 renpy/common/00matrixcolor.rpy）：

| 类 | 参数 | 效果 |
|---|---|---|
| `BrightnessMatrix(value)` | -1~1 | 亮度（alpha 不动） |
| `ContrastMatrix(value)` | <1 减、>1 增 | 对比度 |
| `SaturationMatrix(value, desat=(0.2126,0.7152,0.0722))` | 1=原图 0=灰度 | 饱和度（desat=NTSC 亮度权重） |
| `TintMatrix(color)` | 任意 Color | 染成该色（预乘 alpha） |
| `HueMatrix(deg)` | 任意度数，360=一圈 | 色相偏移 |
| `InvertMatrix(value)` | 0~1 | 反相（0 不反 1 全反，可动画） |
| `OpacityMatrix(value)` | 0~1 | 乘 alpha（只动透明度） |
| `ColorizeMatrix(black, white)` | 两个 Color | 黑白图双色渐变（配合 SaturationMatrix(0)） |
| `SepiaMatrix(tint="#ffeec2", desat=...)` | — | 老照片（= Tint×灰度） |
| `IdentityMatrix()` | — | 原样 |
| `SplineMatrix(矩阵, [控制点…])` | — | 多点渐变插值（值域 0~1 序列） |

**插值动画**（ColorMatrix 的 `__call__(other, done)` 机制，ATL 插值直接写）：
```renpy
transform mc_animated:
    matrixcolor TintMatrix("#f00")
    linear 2.0 matrixcolor TintMatrix("#00f")   # 红 → 蓝渐变
    linear 2.0 matrixcolor TintMatrix("#f00")
    repeat
```

**组合**：`*` 乘法叠加（注意顺序，右侧先应用）：
```renpy
matrixcolor SaturationMatrix(0.5) * TintMatrix("#4488ff") * BrightnessMatrix(0.2)
```

**坑**：预乘 alpha 下染色/亮度类矩阵的通道要按 alpha 缩放（内置类已处理，手写矩阵要注意）；`value` 越界值（Brightness >1 等）会产生过曝/黑块；matrixcolor 与 `alpha` 属性是两条路径，互不替代；Python 层可用 `im.MatrixColor(img, matrix)`（im.py）做静态处理。
