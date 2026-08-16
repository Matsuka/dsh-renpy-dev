---
name: renpy-core
description: 编写或修改 Ren'Py 脚本（.rpy）时加载。核心语句语法速查、语句与 Python 等价的互转映射、缩进与顺序执行约定。涉及对白、流程、label、菜单、变量时必读。
---

# Ren'Py 核心速查

Ren'Py 是基于 Python 的视觉小说引擎，**.rpy 是 Python 超集**：变量/表达式/控制流就是 Python；`python:` 块、`$ 表达式`、`define`/`default` 直接是 Python。你懂 Python 就懂底层，这里只补 Ren'Py 特有层。

## 执行模型（必须先懂）

- **顺序执行**：脚本按顺序运行，`label` 是跳转目标，不是函数定义
- **init 阶段**：`define`/`default`/`init python:` 在游戏启动前执行（一次）
- **交互点**：`say`（对话）、`menu` 会**暂停等待玩家点击**（这是与纯 Python 最大的差异）

## 语句速查 + Python 等价（源码核验映射）

| Ren'Py | 作用 | Python 等价 |
|---|---|---|
| `e "你好"` | 角色对话（等待点击） | `e("你好")` → `renpy.say(e, "你好")` |
| `"旁白"` | 无角色旁白 | `renpy.say(None, "旁白")` |
| `label start:` | 跳转目标 | 可跳转代码块 |
| `jump start` | 无条件跳转（**不返回**） | `renpy.jump("start")` |
| `call sub(1, x=2)` | 压栈调用，return 回到此处 | `renpy.call("sub", 1, x=2)` |
| `return` / `return expr` | 弹栈返回 / 带返回值 | `renpy.return_()` / `renpy.return_(expr)` |
| `scene bg hall` | 清空当前层再显示 | `renpy.scene(); renpy.show("bg hall")` |
| `show e at right` | 显示图像（同名 tag 替换） | `renpy.show("e", at_list=[right])` |
| `hide e` | 隐藏图像 | `renpy.hide("e")` |
| `with fade` | 应用过渡 | `renpy.with_statement(fade)` |
| `menu:` | 选择菜单（展示+交互） | `renpy.menu([("选项", "值"), …])` |
| `$ x = 1` | 单行 Python | 直接 Python |
| `python:` | Python 块 | 直接 Python |
| `define x = 1` | init 阶段赋值（常量） | init 赋值 |
| `default x = 1` | init 默认值（可存档覆盖） | init 默认 |
| `image name = "p.png"` | 注册图像名 | `renpy.image("name", "p.png")` |
| `if/elif/else/while/for` | 条件与循环 | **本身就是 Python** |

## 约定与常见坑

- **缩进**：4 空格；块内语句必须缩进（Ren'Py 对缩进敏感，同 Python）
- **say 插值**：`e "[player_name]你好"`（`[var]` 插值）；动态文本用 `python` 拼接后 `renpy.say`
- **角色定义**：`define e = Character("艾琳", color="#c8c8ff")`；`Character` 可传 `what_prefix`/`what_suffix`
- **jump vs call**：`jump` 回不去，`call` 记得配套 `return`
- **show 需先有 image**：`show bg hall` 前必须有 `image bg hall = "..."` 或同名文件在 `images/` 目录（Ren'Py 自动索引）
- **变量作用域**：`default` 变量全局可用（store）；存档会保存 `default` 变量
- **修改后必须 lint**：写完代码先跑 `renpy_lint` 验证语法，有错先修

## 最小示例

```renpy
define e = Character("艾琳")

label start:
    scene bg classroom
    with fade
    e "你好，欢迎来到视觉小说！"
    menu:
        "继续剧情":
            jump chapter1
        "再看看":
            jump start

label chapter1:
    e "我们开始吧。"
    return
```

## 转换理解

需要更灵活时（条件 say、动态角色、复杂流程），把语句转成 Python 心智：
- `e "你好"` → `e("你好")`（Character 对象调用）
- `menu:` 块 → `renpy.menu([...])` 返回选中值
- `jump`/`call`/`return` → `renpy.jump/call/return_`

## 从剧本到可运行代码（模糊演出指示消解）

接到带演出指示的剧本时，按此流程一次写成可运行代码：

1. **资源先占位**：剧本提到的场景/角色图，项目里没有就用占位符定义，保证可 lint 可运行——
   `image bg classroom = Solid("#6b7a8f")`（纯色块），注释标注 `# TODO: 替换为真实素材`
2. **音频缺失不硬写**：需要音乐/音效但无文件时，**用注释说明如何启用**（如 `# play music "rain.ogg" loop`），不要直接 `play` 导致运行时"找不到文件"警告
3. **演出指示 → 语句映射**：
   - 场景/氛围 → `scene` + `with`（fade/dissolve）+ 占位背景色
   - 角色位置 → `show 角色 at left/right`
   - 情绪/表情 → 角色表情占位图（`show s sad`）+ 台词表达（合理默认，标注）
   - 分支/犹豫 → `menu:` + 各选项 `jump`
   - 多线汇合 → 公共 `label` + `jump` 合并
   - 转场/淡出 → `scene black` / `with dissolve`
4. **创作决策做合理默认并说明**：模糊的演出（"声音颤抖""画面微暗"）用台词+表情占位+场景色表达，不确定的向用户确认或标注待精修
5. **验证闭环**：写完全部用 `renpy_lint` 验证；`image` 引用、`menu` 分支、`jump` 目标错误都在 lint 可查范围内

目标验收：**模糊剧本一次转成 lint 通过、资源占位、缺失清单明确的代码**；补真实素材后即可上线。

