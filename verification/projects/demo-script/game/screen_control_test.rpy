# screen 语言第 4 轮验证：控制语句 + 特殊 screen（default/for/if/on/python/showif + say/choice 覆盖）
# 覆盖：default 局部状态、for 循环控件、if 条件、on 事件、python 块、showif、
#       自定义 say/choice screen（id 契约）

# ── 控制语句：default + SetScreenVariable + if 联动 ──
screen scheduler():
    default club = None

    vbox:
        text "What would you like to do?"
        textbutton "Art Club" action SetScreenVariable("club", "art")
        textbutton "Writing Club" action SetScreenVariable("club", "writing")

        if club:
            text "选了 [club]"
            textbutton "Select" action Return(club)

# ── 控制语句：for 循环生成按钮 ──
screen five_buttons():
    vbox:
        for i, numeral in enumerate(['I', 'II', 'III', 'IV', 'V']):
            textbutton numeral action Return(i + 1)

# ── 控制语句：python 块 + $ 行（screen 内可执行 Python） ──
screen python_screen():
    python:
        greeting = "你好，第 %d 屏" % 4

    $ extra = "来自 $ 行"

    vbox:
        text greeting
        text extra

# ── 控制语句：on 事件（show/hide 时联动） ──
screen event_screen():
    vbox:
        text "事件屏"
    on "show" action renpy.notify("屏幕显示")
    on "hide" action renpy.notify("屏幕隐藏")

# ── 控制语句：showif 条件显示（带 appear/show/hide 过渡 transform） ──
transform cd_transform:
    xalign 0.5 yalign 0.5 alpha 0.0
    on appear:
        alpha 1.0
    on show:
        zoom .75
        linear .25 zoom 1.0 alpha 1.0
    on hide:
        linear .25 zoom 1.25 alpha 0.0

screen countdown():
    default n = 3

    vbox:
        text "[n]"
        showif n > 0:
            timer 1.0 action SetScreenVariable("n", n - 1)
        else:
            text "GO!"

# ── 特殊 screen：自定义 say（id 契约：who/what/window，what 必须有） ──
screen say(who, what):
    window id "window":
        has vbox

        if who:
            text who id "who"
        text what id "what"

# ── 特殊 screen：自定义 choice（items 列表 + 按钮） ──
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

# ── 特殊 screen：自定义 input（返回输入值） ──
screen input(prompt):
    window:
        has vbox

        text prompt
        input default "" copypaste True

label screen_control_demo:
    show screen scheduler
    pause
    show screen five_buttons
    pause
    show screen python_screen
    pause
    show screen event_screen
    pause
    show screen countdown
    pause
    hide screen scheduler
    hide screen five_buttons
    hide screen python_screen
    hide screen event_screen
    hide screen countdown
    s "这是自定义 say 屏幕效果。"    # 用自定义 say 显示
    "旁白也在自定义屏幕里。"
    return
