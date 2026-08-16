define e = Character("E")

label start:
    # ── 语句版 ──
    e "语句版对话"
    "旁白"
    scene bg lecturehall
    with fade
    show e at right
    menu:
        "继续":
            pass

    # ── Python 等价版（验证映射） ──
    $ renpy.say(e, "Python: renpy.say(e, ...)")
    $ renpy.say(None, "Python: renpy.say(None, ...)")
    $ renpy.scene()
    $ renpy.show("bg lecturehall")
    $ renpy.with_statement(fade)
    $ renpy.show("e", at_list=[right])
    $ c = renpy.menu([("选项1", "opt1"), ("选项2", "opt2")])
    $ renpy.jump("start2")

label start2:
    $ renpy.say(None, "Python: renpy.jump 到达")
    return
