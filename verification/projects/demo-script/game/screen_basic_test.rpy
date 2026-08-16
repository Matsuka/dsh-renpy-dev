# screen 语言第 1 轮验证：基础 + 布局体系（screens.html + sl2 核验）
# 覆盖：screen 定义/参数/属性、fixed/hbox/vbox/grid/side 布局、add/transform、
#       use（带参/expression）、show/hide/call screen

# ── screen 定义：参数 + 属性（tag/zorder/modal/style_prefix） ──
screen hello_world():
    tag example
    zorder 1
    modal False

    text "Hello, World."

screen center_text(s, size=42):
    text s size size

# ── 布局：fixed（绝对定位） ──
screen ask_are_you_sure:
    fixed:
        text "Are you sure?" xalign 0.5 yalign 0.3
        textbutton "Yes" xalign 0.33 yalign 0.5 action Return(True)
        textbutton "No" xalign 0.66 yalign 0.5 action Return(False)

# ── 布局：hbox / vbox / grid / side ──
screen box_test:
    hbox:
        text "Left"
        text "Right"

screen vbox_test:
    vbox:
        text "Top."
        text "Bottom."

screen grid_test:
    grid 2 3:
        text "Top-Left"
        text "Top-Right"
        text "Center-Left"
        text "Center-Right"
        text "Bottom-Left"
        text "Bottom-Right"

screen side_test:
    side "c tl br":
        text "Center"
        text "Top-Left"
        text "Bottom-Right"

# ── add + transform 位置 ──
transform t1():
    xpos 150
    linear 1.0 xpos 0

screen add_test:
    add "logo_base.png" xalign 1.0 yalign 0.0
    text "Test" at t1

# ── use：嵌套（带参数 / expression / with id） ──
screen file_slot(slot):
    button:
        action Return(slot)
        has hbox

        add "logo_base.png"
        vbox:
            text "Slot [slot]"

screen use_test:
    vbox:
        use file_slot(1)
        use file_slot(2)

screen child():
    add "logo_base.png" as main

screen parent():
    use child as mycdd

# ── 显示/隐藏/调用 ──
label screen_basic_demo:
    show screen hello_world
    pause
    show screen box_test
    pause
    show screen grid_test
    pause
    show screen use_test
    pause
    hide screen hello_world
    hide screen box_test
    hide screen grid_test
    hide screen use_test
    pause
    call screen ask_are_you_sure
    "选择了 [result]"
    return
