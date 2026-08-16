# GUI 定制验证：gui.init + gui.* 变量（gui.html + gui.rpy 骨架核验）

# gui.init 重置样式 + 设分辨率（必须最早，init offset -2）
init offset = -2

init python:
    gui.init(1280, 720)

# ── 颜色（高频 8 个） ──
define gui.accent_color = "#00b8c3"
define gui.idle_color = "#888888"
define gui.idle_small_color = "#aaaaaa"
define gui.hover_color = Color(gui.accent_color).tint(.6)
define gui.selected_color = "#ffffff"
define gui.insensitive_color = "#8888887f"
define gui.interface_text_color = "#aaaaaa"

# ── 字体 ──
define gui.text_font = "DejaVuSans.ttf"
define gui.interface_text_font = "DejaVuSans.ttf"

# ── 字号 ──
define gui.text_size = 33
define gui.name_text_size = 45
define gui.interface_text_size = 36
define gui.label_text_size = 45
define gui.title_text_size = 75

# ── 对话/菜单色 ──
define gui.text_color = "#402000"
define gui.choice_button_text_idle_color = "#888888"
define gui.choice_button_text_hover_color = "#0066cc"

label gui_demo:
    "GUI 变量已定义（lint 验证语法）。"
    return
