---
name: renpy-transitions
description: 编写或修改 Ren'Py 的转场效果（with dissolve/fade/move 预定义转场、Dissolve/Fade/CropMove/PushMove 自定义转场、ATL 转场 old_widget/new_widget、按层 Dict 转场、自动转场配置、Python 转场）及图像操作 im.*（旧 API，倾向 Transform）时加载。涉及画面切换、淡入淡出、滑动、震动、场景过渡时必读。
---

# Ren'Py 转场速查（transitions）

内容来自 transitions.html（86KB）经源码核验，示例经 8.5.3 SDK lint 验证（transitions_test.rpy）。

## 用法：`with 转场`

`with 转场名` 应用在上一条显示语句（scene/show/hide）之后，过渡旧画面→新画面：
```renpy
scene bg forest
with dissolve          # 常用：0.5s 溶解
show eileen happy at right
with moveinright       # 进入图像从右滑入
"转场只影响上一次 scene/show/hide 的变化。"
```

## 预定义转场（19 个，transitions.html）

| 转场 | 效果 |
|---|---|
| `dissolve` | 0.5s 溶解（最常用） |
| `fade` | 0.5s 淡黑 + 0.5s 淡入（黑场过渡） |
| `pixellate` | 马赛克块化 |
| `move` / `ease` | 位置变化的图平滑移动（ease=余弦缓动）；**只能用于 with 语句，不能进 ATL/Compose** |
| `moveinright/left/top/bottom`、`moveout*` | 进入/离开从对应侧滑入滑出 |
| `easein*` / `easeout*` | 同 move 家族但缓动 |
| `zoomin` / `zoomout` / `zoominout` | 进入放大 / 离开缩小 / 两者 |
| `vpunch` / `hpunch` | 垂直/水平震动 0.25s（冲击感） |
| `blinds` / `squares` | 百叶窗 / 方块 1s |
| `wipeleft/right/up/down` | 擦除方向（新图揭开） |
| `slideleft/right/up/down` | 新图滑入覆盖 |
| `slideaway*` | 旧图滑出露出新图 |
| `pushright/left/up/down` | 新图推旧图出 |
| `irisin` / `irisout` | 矩形虹膜展开/收起 |

## 自定义转场类

| 类 | 参数要点 | 示例 |
|---|---|---|
| `Dissolve(time, time_warp=None)` | 溶解；time_warp 缓动函数 | `Dissolve(2.0)` |
| `Fade(out, hold, in, color="#000")` | 淡出→黑场 hold→淡入；color 可改白/红 | `Fade(0.5, 1.0, 0.5)`（黑场停顿） |
| `ImageDissolve(img, time)` | 用灰度图控制溶解形状 | 图案溶解 |
| `AlphaDissolve(control, delay)` | 用动画 transform 控制透明区域 | 渐隐文字过渡 |
| `CropMove(time, mode)` | 裁剪/滑动/虹膜；mode: wiperight/slideright/slideaway/irisin/custom | `CropMove(1.0, "slideright")` |
| `PushMove(time, mode)` | 推挤（pushleft 等） | — |
| `MoveTransition(time)` | 位置变化图移动（move/ease 的类） | — |
| `ComposeTransition(trans, before, after)` | 组合：先 before 处理旧图、after 处理新图，再 trans | `ComposeTransition(dissolve, before=moveoutleft, after=moveinright)` |
| `Pixellate(time, x=20, y=20)` | 马赛克 | — |
| `Flash(color, delay)` | 单色闪 | 相机闪光 |

**自定义后使用**：`define 名 = Dissolve(...)`，然后 `with 名`。

## ATL 转场（最灵活）

用 ATL 写转场：transform 接收 `old_widget`/`new_widget` 两个特殊参数（旧图/新图），`events` 控制事件：
```renpy
transform spin(duration=1.0, *, new_widget=None, old_widget=None):
    delay duration
    xcenter .5
    ycenter .5
    old_widget
    events False
    rotate 0.
    easeout (duration / 2) rotate 360.0
    new_widget
    events True
    easein (duration / 2) rotate 720.0
# 用：with spin
```
vpunch/hpunch 的深度定制就是用 ATL 转场做。

## Dict 转场 / Python 转场 / 自动转场

- **Dict 转场**（按层应用）：`define dis = { "master": Dissolve(1.0) }` → `with dis`；常用于 `config.window_show_transition` 等
- **Python 转场**（条件选择）：定义 `def 名(old_widget=None, new_widget=None): return 转场(...)` → `with 名`（如按 persistent 设置选 pixellate/dissolve）
- **自动转场**：`define config.scene_show_hide_transition = Dissolve(0.25)`——scene/show/hide 后自动应用；同理 `config.window_show_transition` / `config.window_hide_transition`

## 图像操作 im.*（旧 API 提示）

`im.Scale`/`im.Composite`/`im.Crop`/`im.Flip`/`im.Rotozoom`/`im.Blur`/`im.Twocolor`/`im.Recolor`/`im.AlphaMask`/`im.MatrixColor`（im.py 核验）——**多数已由 Transform 属性/ATL 取代**：
- `im.Scale(img, w, h)` → `Transform(img, xysize=(w, h))`
- `im.Flip` → `Transform(xzoom=-1)`
- `im.Rotozoom` → `Transform(rotate=…)`
- `im.Blur` → `Transform(blur=N)`（或 matrixcolor）
- `im.Composite` → `Fixed`/`renpy.display.layout.Fixed` 合成
仍有用：批量静态处理、`im.MatrixColor`（旧版图像级调色）。新代码优先 Transform/ATL。

## 常见坑

- **`with` 只影响上一条显示语句**：连续两条 scene/show 后再 with，只过渡最后的变化（用 `with None` 分隔可强制）
- **move/ease 不能进 ATL/Compose**（只能 with 语句）——需要移动转场组合时用 ComposeTransition(dissolve, before/after)
- **`with None`**：清除待应用转场（`show x\nwith None\nshow y\nwith dissolve` 时 dissolve 只作用 y）
- **自定义转场用 `define` 定义**：放在 init 阶段（define 默认）；在 label 里 `$ 名 = Dissolve(...)` 也可但每帧重赋值浪费
- **Fade 的 hold_time=0 才是普通淡黑**：`Fade(0.5, 0, 0.5)`；hold>0 是黑场停顿
- **ATL 转场里 old_widget/new_widget 是当前帧的图**：`events False/True` 控制是否处理交互事件（新图要 True）
- **自动转场会影响所有 scene/show**：只想局部时用显式 `with` + `with None` 打断自动
