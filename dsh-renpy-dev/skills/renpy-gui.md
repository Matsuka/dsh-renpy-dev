---
name: renpy-gui
description: 编写或修改 Ren'Py 的 GUI 主题定制（gui.init 分辨率、gui.* 变量：颜色/字体/字号、对话/菜单/按钮配色、背景图约定、style 覆盖层级）时加载。涉及改主题色、换字体、调字号、界面风格定制时必读。
---

# Ren'Py GUI 定制速查

内容来自 gui.html（GUI Customization Guide）与模板 gui.rpy（482 行）核验，示例经 8.5.3 SDK lint 验证（gui_test.rpy）。

## 入口与结构

```renpy
# gui.rpy 顶部（init offset -2 保证 gui 先于其他 init）
init offset = -2

init python:
    gui.init(1280, 720)      # 重置样式为默认 + 设游戏分辨率

define gui.accent_color = "#00b8c3"    # 之后全是 gui.* 变量
```

- **gui.init(宽, 高)**：重置全部样式到合理默认 + 设置分辨率——**必须在其他样式定义前**（init offset -2）
- 定制层级：**① 改 gui.\* 变量**（简单）→ **② style 覆盖**（中级，style 块改 idle/hover/selected 状态）→ **③ 改 screens.rpy/总替换**（高级）

## 高频变量（gui.rpy 骨架核验）

**颜色**：
| 变量 | 用途 |
|---|---|
| `gui.accent_color` | 强调色（标题/标签/高亮） |
| `gui.idle_color` | 按钮未聚焦/未选中文本色 |
| `gui.idle_small_color` | 小号文本（存档槽时间/快速菜单） |
| `gui.hover_color` | 聚焦项（按钮文本/滑块拇指） |
| `gui.selected_color` | 选中按钮文本色（优先于 hover/idle） |
| `gui.insensitive_color` | 禁用按钮文本色（如无可回滚时） |
| `gui.interface_text_color` | 静态界面文本（帮助/关于） |
| `gui.text_color` | 对话文本色 |
| `gui.choice_button_text_idle/hover_color` | 选择菜单文本 |

**字体**：`gui.text_font`（对话/菜单/输入）、`gui.interface_text_font`（界面元素）、`gui.system_font`（异常/无障碍）、`gui.glyph_font`（箭头等符号）

**字号**：`gui.text_size`（对话）、`gui.name_text_size`（角色名）、`gui.interface_text_size`（界面/按钮默认）、`gui.label_text_size`（节标题）、`gui.title_text_size`（游戏标题）、`gui.notify_text_size`（通知）

**派生色**：`define gui.hover_color = Color(gui.accent_color).tint(.6)`——用 Color.tint 从主色派生，改主色联动

## 背景图约定（gui/ 目录）

| 文件 | 用途 |
|---|---|
| `gui/textbox.png` | 对话窗口背景（全宽，文字在中央 60%） |
| `gui/button/choice_idle_background.png` / `choice_hover_background.png` | 选择按钮背景 |
| `gui.main_menu_background` / `gui.game_menu_background` | 主/游戏菜单背景（gui.\* 变量） |
| `config.window_icon` | 窗口图标 |

## style 覆盖（中级）

gui.* 变量改不了的部分用 style 块（样式前缀见 renpy-screen）：
```renpy
style dialogue:
    color gui.text_color
    size gui.text_size

style button:
    background Solid("#446688")
    hover_background Solid("#6688bb")
```

## 常见坑

- **gui.init 必须在最前**：其他 init 里的样式定义会覆盖 gui.init 的结果；init offset -2 是标准做法
- **改分辨率 = gui.init 参数 + 素材重做**：1920×1080 → 1280×720 时背景/按钮图要匹配，字号可能要调
- **派生色用 Color().tint()**：直接写死 hover 色改主色时不联动
- **gui.insensitive_color 带 alpha**（`#8888887f`）：禁用态半透明
- **改字号后布局可能破**：text_size 调大要检查对话框/按钮是否够宽（Frame 九宫格 + xmaximum）
- **背景图是文件不是变量**：gui/textbox.png 等直接放 gui/ 目录（改文件即生效）；menu 背景用 `gui.main_menu_background`
- **gui 变量是 init 值**：运行时改 gui.x 不生效（重新 init 才刷新）；动态主题用 style 替换
