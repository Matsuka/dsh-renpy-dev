# ATL 全语句 lint 验证（renpy-atl skill 知识核验）
# 覆盖：transform 定义/参数、属性语句、插值+warp、pause、block、parallel、choice、
#       repeat、on、animation、contains、displayable 切换、transform 表达式、function、time、event

init python:
    import random

    def atl_slide_vibrate(trans, st, at, /):
        if st > 1.0:
            trans.xalign = 1.0
            trans.yoffset = 0
            return None
        trans.xalign = st
        trans.yoffset = random.randrange(-10, 11)
        return 0

# ── transform 定义（属性语句 + 参数） ──
transform left_to_right:
    xalign 0.0
    linear 2.0 xalign 1.0
    repeat

transform slide_in(duration=1.0):
    xalign 0.0
    easein_quad duration xalign 1.0

transform bounce_bounce:
    block:
        linear 0.5 yoffset 0
        linear 0.5 yoffset -20
        repeat

transform multi_prop:
    xalign 0.0 yalign 0.0
    linear 1.5 xalign 0.5 yalign 0.5  # 多属性同插值

transform with_warp:
    xalign 0.0
    warp custom_warp 1.0 xalign 1.0  # 自定义 warper 函数（见 python early 下定义）

python early:
    @renpy.atl_warper
    def custom_warp(t):
        return t * t

# ── parallel / choice / on / animation / contains / displayable / function / time / event ──
transform parallel_demo:
    parallel:
        xalign 0.0
        linear 1.3 xalign 1.0
        linear 1.3 xalign 0.0
        repeat
    parallel:
        yalign 0.0
        linear 1.6 yalign 1.0
        linear 1.6 yalign 0.0
        repeat

transform choice_demo:
    choice:
        xoffset 0
    choice 2.0:
        xoffset 10
    pause 1.0
    repeat

transform hover_demo:
    on hover, idle:
        linear .2 zoom 1.1
        linear .2 zoom 1.0
    on show:
        alpha 0.0
        linear .5 alpha 1.0

image eileen random_anim:
    animation
    "eileen happy"
    pause 1.0
    "eileen vhappy"
    pause 1.0
    repeat

transform contains_demo:
    contains:
        "logo_base.png"
        xalign 0.0
        linear 1.0 xalign 1.0

transform disp_switch:
    "logo_base.png"
    pause 1.0
    "logo_bw.png" with Dissolve(0.5, alpha=True)

transform time_demo:
    "logo_base.png"
    xoffset 0
    block:
        linear 1 xoffset 10
        linear 1 xoffset 0
        repeat
    time 2.0
    xoffset 0
    "logo_bw.png"
    time 4.0

transform func_demo:
    function atl_slide_vibrate
    pause 1.0
    repeat

label atl_demo:
    show logo base at left_to_right
    show logo base at slide_in(0.5)
    show logo base at bounce_bounce
    show logo base at parallel_demo
    show logo base at hover_demo
    show logo base at contains_demo
    show logo base at disp_switch
    show logo base at time_demo
    show logo base at func_demo
    pause
    return
