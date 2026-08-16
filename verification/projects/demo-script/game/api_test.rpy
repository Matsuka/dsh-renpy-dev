# renpy-api 验证：常用 API（renpy.* / persistent / 音频 / 系统函数）
# 覆盖：renpy.say/notify/pause、show/hide/call_screen、restart_interaction、
#       renpy.music.play/queue/stop、screenshot、persistent、random、timeout

# ── persistent：跨存档持久数据 ──
default persistent.unlocked = []
default persistent.best_score = 0

# ── init python：Python 层 API（renpy 自动可用，无需 import） ──
init python:
    def api_demo_python():
        renpy.notify("提示：Python 层通知")
        renpy.say(None, "Python 层旁白")
        renpy.pause(0.5)
        renpy.restart_interaction()
        return renpy.random.randint(1, 100)

# ── 音频（语句形式；文件缺失以注释占位，lint 不校验运行时） ──
# play music "audio/bgm.ogg" loop fadeout 1.0 fadein 1.0
# queue music "audio/bgm2.ogg"
# stop music fadeout 2.0
# play sound "audio/click.ogg"

# ── 界面 API ──
screen api_popup():
    frame:
        xalign 0.5 yalign 0.5
        vbox:
            text "弹窗"
            textbutton "确定" action Return("ok")

label api_demo:
    $ renpy.notify("通知：走 renpy.notify")
    $ x = api_demo_python()
    "随机数 [x]"
    $ renpy.show_screen("api_popup")
    $ renpy.pause(1.0)
    $ renpy.hide_screen("api_popup")
    $ r = renpy.call_screen("api_popup")
    "弹窗返回 [r]"
    $ renpy.screenshot("screenshots/api.png")
    $ persistent.best_score = max(persistent.best_score, x)
    "最高分 [persistent.best_score]"
    if persistent.unlocked:
        "已解锁 [persistent.unlocked]"
    $ persistent.unlocked.append("成就1")
    return
