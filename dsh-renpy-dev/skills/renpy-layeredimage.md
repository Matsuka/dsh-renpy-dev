---
name: renpy-layeredimage
description: 编写或修改 Ren'Py 的分层图像 LayeredImage（layeredimage 语句、always/attribute/group 分层、差分系统 show 表情切换、auto 自动属性、when 条件、image_format 取图、LayeredImageProxy）时加载。涉及角色差分、表情组合、换装系统、分层立绘时必读。
---

# Ren'Py 分层图像速查（LayeredImage）

内容来自 layeredimage.html（79KB），经 00layeredimage_ren.py 核验，示例经 8.5.3 SDK lint 验证（layeredimage_test.rpy）。

## 概念：把"一张立绘"拆成"分层组合"

LayeredImage 让一张角色图 = **always 层（底） + 若干 attribute/group 层（差分）**，`show 角色 属性` 时引擎按属性组合各层——替代传统"每表情一张整图"。

```renpy
layeredimage augustina:
    zoom 1.4
    at recolor_transform

    always:                    # 无条件层（底）
        "augustina_base"

    attribute base2 default    # 单独属性（默认启用）

    group outfit:              # 互斥组：同一组内属性互斥
        attribute dress default:
            "augustina_dress"
        attribute uniform:
            "augustina_uniform"
        attribute psychedelic null   # null = 该属性不显示（脱掉）

    group face auto:           # auto 组：按文件名自动定义属性
        pos (100, 100)
        attribute neutral default

label start:
    show augustina             # 显示 dress + neutral（各自 default）
    show augustina happy       # happy 不在组里 → 自动补进 auto 组
    show augustina uniform -happy   # uniform 替换 dress；-属性 = 移除
```

## 语句速查

| 语句 | 作用 |
|---|---|
| `layeredimage 名:` | 定义（顶层属性：zoom/at/transform 属性） |
| `always:` | 无条件层（可带 when/at/transform） |
| `attribute 名 [default] [when 表达式] [null]` | 独立属性层；default=默认启用；null=显示空 |
| `group 名:` | 互斥组（组内属性互斥，同一时间只显示一个） |
| `attribute 名`（组内） | 组内属性 |
| `group 名 auto:` | auto 组：属性未显式给图时按文件名自动查找 |
| `group 名 multiple:` | 多选组（可同时启用多个） |
| `variant 词`（attribute/group） | 图名拼 variant_属性 |
| `prefix 词`（group） | 属性名前缀（leftarm_hip） |
| `image_format "路径/{image}.png"` | 图名插值成文件路径 |
| `attribute_function 函数` | 属性集后处理（复杂依赖/随机） |

## 差分选择规则（show 时）

- `show 角色` → 所有 default 属性生效（每互斥组取 default 那个）
- `show 角色 happy` → 追加/切换：happy 若在某组 → 替换该组当前；不在组 → 进 auto 组
- `show 角色 uniform -happy` → `-前缀` 移除属性（-happy 关掉表情）
- `when` 条件：属性仅在条件满足时显示（如 `attribute b default when not a`——互斥链）
- 属性顺序无关：`show augustina happy eyes_blue dress`（属性可任意组合/排序）

## auto 组与取图

- auto 组属性没给显式图时，按 **pattern** 查找：默认格式 `sprites/{image}.png`（可 image_format 覆盖）；也找**已定义 image**（`image happy = ...`）
- 图名构成：`<图名>_<组>_<variant>_<属性>`（空格换下划线）；如 `group eyes variant blue` + `attribute closed` → 找 `augustina_eyes_blue_closed`（示例）
- auto 组是**分层差分的主力**：把 `charas/eileen/` 下文件按属性命名，`show eileen happy` 自动组装

## LayeredImageProxy（带效果的代理）

```renpy
image side augustina = LayeredImageProxy("augustina", Transform(crop=(0, 0, 362, 362), xoffset=-80))
image sepia_augustina = LayeredImageProxy("augustina", Transform(matrixcolor=SepiaMatrix()))

show sepia_augustina happy dress   # 代理接收差分属性 + 套效果
```
- 区别：`Transform("augustina", ...)` **不接收差分属性**（`show ... happy` 会失败）；Proxy 可以
- 用途：侧像、滤镜版立绘、镜像

## 常见坑

- **互斥组内属性互斥**：同一 group 同时 show 两个属性会报错/取其一；`multiple:` 组才能多选
- **`-属性` 只移除，不加**：`show x -happy` 不会显示 happy（happy 若不在显示集则无效果）
- **default 每个互斥组只能一个**：多个 default 冲突（最后一个生效？），用 when 做互斥链
- **auto 组找不到图**：属性名 → 文件名不匹配会静默空层（不报错，显示缺层）；检查 pattern/文件名大小写
- **null 属性**：显式"不显示"（如脱外套），配合 default 做穿衣切换
- **分层图 vs 整图**：小差分用分层（省内存、好扩展）；大动作差分（全身换 pose）用整图切换更简单
- **与自动索引的关系**：auto 组找"已定义 image 或 pattern 文件"——`images/charas/eileen/eileen happy.png` 会被自动索引成 `eileen happy`，layeredimage 的 auto 组可复用（见 renpy-practices 资源管理）
