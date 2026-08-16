# screen 语言第 2 轮验证：控件（text/textbutton/button/imagebutton）+ 样式体系
# 覆盖：text 属性、textbutton（action/hovered/text_ 前缀）、button（alternate/selected）、
#       imagebutton（idle/hover）、style 语句（is 父/take）、style_prefix

# ── 样式定义（style 语句：继承 + 属性） ──
style my_button is button:
    background Solid("#446688")
    hover_background Solid("#6688bb")

style my_button_text is my_button:
    color "#ffffff"
    hover_color "#ffdd88"
    size 20

# ── 控件：text ──
screen text_props_test:
    vbox:
        text "小字" size 20
        text "彩色大字" size 40 color "#ff8888"
        text "斜体" italic True
        text "带边框按钮文本" style "my_button_text"

# ── 控件：textbutton（action / hovered / text_ 前缀） ──
screen tb_test:
    vbox:
        textbutton "开始" action Jump("screen_controls_demo") style "my_button"
        textbutton "红字按钮" text_color "#ff6666" hovered SetVariable("hover_msg", "悬停中") action Return(1)
        textbutton "金色" style "my_button" text_size 24

# ── 控件：button（action / alternate / selected / sensitive） ──
screen btn_test:
    vbox:
        button:
            action Return("primary")
            alternate Return("alternate")   # 右键/长按触发
            background Solid("#557799")
            xsize 200
            ysize 40
            text "主键" size 16
        button:
            action Return("sel")
            selected True
            background Solid("#779955")
            text "已选中" size 16
        button:
            action Return("no")
            sensitive False               # 不可点击
            text "禁用" size 16

# ── 控件：imagebutton（idle/hover/insensitive 图） ──
image btn_idle = Solid("#88aacc", xsize=100, ysize=36)
image btn_hover = Solid("#ffcc88", xsize=100, ysize=36)
image btn_ins = Solid("#555555", xsize=100, ysize=36)

screen imgbtn_test:
    vbox:
        imagebutton idle "btn_idle" hover "btn_hover" action Return("img")
        imagebutton idle "btn_idle" hover "btn_hover" insensitive "btn_ins" action Return("no2") sensitive False

# ── style_prefix：screen 级前缀批量套用 ──
screen prefixed_test:
    style_prefix "my_button"

    vbox:
        textbutton "P1" action Return(1)
        textbutton "P2" action Return(2)

label screen_controls_demo:
    show screen text_props_test
    pause
    show screen tb_test
    pause
    show screen btn_test
    pause
    show screen imgbtn_test
    pause
    show screen prefixed_test
    pause
    hide screen text_props_test
    hide screen tb_test
    hide screen btn_test
    hide screen imgbtn_test
    hide screen prefixed_test
    return
