# screen 语言第 3 轮验证：action 精选 + 输入控件（bar/input/key/timer）
# 覆盖：control/data/menu/other action、bar 数值、input、key 快捷键、timer

default _choice = 0

# ── bar：数值条（Preference / StaticValue / FieldValue / 变量） ──
screen volume_bars():
    frame:
        has vbox

        bar value Preference("sound volume")            # 偏好值
        bar value Preference("music volume")
        bar value StaticValue(50, range=100)            # 静态值（可拖）
        bar value FieldValue(_preferences, "text_cps", range=3)  # 对象字段
        bar value AnimatedValue(80, range=100, delay=2.0)       # 动画值

# ── input：文本输入（default + changed 回调存变量） ──
init python:
    def set_name(v):
        renpy.store._name = v

screen name_input():
    window:
        has vbox

        text "Enter your name."
        input default "Player" changed set_name
        input default "" length 12 allow "abcxyz"

# ── key：快捷键（可多个键） ──
screen hotkeys():
    key "p" action ShowMenu("preferences")
    key ["s", "w"] action NullAction()
    key "m" action ToggleScreen("volume_bars")

# ── timer：限时 ──
screen timed_choice():
    vbox:
        textbutton "Yes" action Return("yes")
        textbutton "No" action Return("no")
    timer 3.0 action Return("too_slow")

# ── action 综合：data / menu / other ──
screen action_demo():
    vbox:
        textbutton "jump" action Jump("screen_actions_demo")
        textbutton "call" action Call("screen_actions_demo")
        textbutton "return" action Return("done")
        textbutton "show" action Show("volume_bars")
        textbutton "hide" action Hide("volume_bars")
        textbutton "toggle" action ToggleScreen("hotkeys")
        textbutton "set" action SetVariable("_choice", 1)
        textbutton "inc" action IncrementVariable("_choice")
        textbutton "toggle_var" action ToggleVariable("_choice", 1, 0)
        textbutton "cycle" action CycleVariable("_choice", [0, 1, 2])
        textbutton "set_screen" action SetScreenVariable("_local_n", 5)
        textbutton "menu" action ShowMenu("save")
        textbutton "confirm" action Confirm("确定退出？", yes=Quit(False), no=NullAction())
        textbutton "func" action Function(renpy.notify, "hello from action")
        textbutton "if" action If(_choice > 1, true=Return("big"), false=Return("small"))
        textbutton "quit" action Quit(confirm=False)

screen counter():
    default _local_n = 0
    vbox:
        text "计数 [_local_n]"
        textbutton "+1" action SetScreenVariable("_local_n", _local_n + 1)

label screen_actions_demo:
    show screen volume_bars
    pause
    show screen name_input
    pause
    show screen hotkeys
    pause
    show screen action_demo
    pause
    show screen counter
    pause
    hide screen volume_bars
    hide screen name_input
    hide screen hotkeys
    hide screen action_demo
    hide screen counter
    call screen timed_choice
    "限时选择结果：[_return]"
    return
