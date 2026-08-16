---
name: renpy-sprites
description: 编写或修改 Ren'Py 的特殊显示对象：SpriteManager 粒子系统（含 SnowBlossom 现成飘雪/落叶）、Drag & Drop 拖拽（Drag/DragGroup 类）、Movie 视频（movie_cutscene 过场 / Movie displayable 嵌入）时加载。涉及飘雪落叶、粒子特效、拖拽库存、纸牌、视频过场时必读。
---

# Ren'Py 特殊显示对象速查（粒子 / 拖拽 / 视频）

内容来自 sprites.html / drag_drop.html / movie.html 经源码核验，示例经 8.5.3 SDK lint 验证（sprites_test.rpy）。

## 粒子：SnowBlossom（现成效果，首选）

飘雪/落叶/光点**不用手写粒子**，用现成的 `SnowBlossom`：

```renpy
image snowflake = Solid("#ffffff", xsize=8, ysize=8)

init python:
    def snow_scene():
        return SnowBlossom("snowflake", count=10, border=50,
                           xspeed=(20, 50), yspeed=(100, 200))

label start:
    show snow_scene at truecenter     # SnowBlossom 是 displayable
```

参数：`count`（数量）/`border`（屏幕边距，防止骤隐）/`xspeed`/`yspeed`（速度，单值或范围随机）/`start`（延迟）/`fast`（横向）/`horizontal`（水平飘）/`distribution`（分布：linear/gaussian/arcsine）。

## 自定义粒子：SpriteManager + Sprite

需要自己控制每帧行为时用 SpriteManager：

```renpy
init python:
    sm = SpriteManager(update=0)

    def particle_update(t):            # 每帧回调（t=显示后秒数），返回下次更新间隔
        for s in sm.sprites:
            s.y += 2
            if s.y > 600:
                s.y = 0
        return 0

    def make_particles():
        sm.update = particle_update
        for i in range(5):
            sp = sm.create("snowflake")    # create 创建 Sprite
            sp.x = i * 50
            sp.y = i * 30
        return sm
```

- **Sprite 字段**：`x`/`y`（坐标）、`zorder`（层级）、`events`（True 时子对象处理事件）；方法 `destroy()`/`set_child(d)`
- **SpriteManager 参数**：`update`（每帧回调）/`event`（事件回调）/`ignore_time`/`animation`；方法 `create(d)`/`redraw(delay)`
- **性能**：粒子用纹理池，别每个粒子一个独立大图；`ignore_time=True` 用于小图池

## Drag & Drop：Drag / DragGroup 类

**注意：没有 drag/drop 语句**（`draggable` 只是 viewport 的关键词）；拖拽主体是 **Python 层的 Drag/DragGroup 类**（store 内置）：

```renpy
init python:
    def drag_callback(dragged, drop):    # 放下回调
        return drop

    def make_drag(name, d, draggable=True, droppable=False):
        return Drag(d, drag_name=name, draggable=draggable, droppable=droppable, dragged=drag_callback)

screen drag_screen():
    add make_drag("item1", "snowflake")                                     # 可拖物品
    add make_drag("slot", Solid("#333366", xsize=120, ysize=120), draggable=False, droppable=True)  # 放置区
```

**Drag 关键参数**（drag_drop.html 核验）：
- `d`（子显示对象）、`drag_name`（名称，同名恢复位置）、`draggable`（可拖）、`droppable`（可被放置）
- 回调：`dragged(drags, drop)`（拖完，drop=放置目标或 None）、`dropped(drag, drags)`（被放置）、`dragging`、`clicked`（点击未拖）
- `drag_handle`（拖拽手柄矩形）、`mouse_drop`（True 按鼠标位置放，False 默认按重叠最多放）、`drag_raise`
- **父容器**：Drag 的 parent 应是 `Fixed()` 或 **DragGroup**（store 内置类，管理拖拽组）；新 Drag 自动加入默认组
- **子状态样式**：child 的 `selected_hover`（拖动中）/`selected_idle`（可放置）/`hover`/`idle` 反映拖拽状态
- **Transform 别直接套 Drag**——套在 child 上

## Movie 视频

**全屏过场**（最常用）：
```renpy
$ renpy.movie_cutscene("intro.webm")       # 播放过场，点击可跳过
# 参数：delay（秒数，None=视频长度，-1=等点击）/ loops（额外循环，-1 无限）/ stop_music（默认停音乐）
```

**嵌入视频**（Movie displayable）：
```renpy
image mv = Movie(play="intro.webm")        # 显示时自动播、隐藏时停
show mv
# 参数：size / channel（默认 movie）/ play / start_image（未播时显示）/ side_mask（立体遮罩）
```

支持格式：Ren'Py 可播放的视频格式（webm/ogv 等，取决于平台后端）。

## 常见坑

- **SnowBlossom 优先于手写 SpriteManager**：常见粒子效果（雪/叶/光点）一行搞定；SpriteManager 留给自定义行为
- **Drag 是 displayable 用 add**，不是 screen 语句/action
- **Transform 套 Drag 的 child**，别套 Drag 本身（会破坏拖拽定位）
- **放置判定**：默认按"重叠最多"，`mouse_drop=True` 按鼠标位置——需求不同要选对
- **Movie 缺文件**：cutscene 找不到文件运行时报错；开发期注释占位
- **粒子性能**：count 别太大（每帧更新全部）；SpriteManager 小图池用 `ignore_time`
- **视频格式兼容**：不同平台支持格式不同（Android/Web 受限），跨平台要测试
