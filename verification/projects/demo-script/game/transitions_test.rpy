# 转场验证：预定义/自定义/ATL 转场/Python 转场/Dict 转场/自动转场（transitions.html 核验）

# ── 预定义转场使用 ──
label transitions_demo:
    scene black
    with dissolve            # 0.5s 溶解
    show logo base at truecenter
    with fade                # 淡黑再淡入
    with moveinright         # 从右进入
    with vpunch              # 垂直震动
    with hpunch              # 水平震动
    with blinds              # 百叶窗 1s
    with wipeleft            # 左向擦除
    with pushright           # 右推
    with ease                # 余弦缓动移动
    with zoominout           # 进入放大/离开缩小
    pause
    return

# ── 自定义转场类 ──
define slowdissolve = Dissolve(2.0)                    # 2s 溶解
define fadehold = Fade(0.5, 1.0, 0.5)                  # 黑场停顿 1s
define flash = Fade(0.1, 0.0, 0.5, color="#fff")       # 白闪
define slide = CropMove(1.0, "slideright")             # 右滑 1s
define combo = ComposeTransition(dissolve, before=moveoutleft, after=moveinright)  # 组合
define warp_dissolve = Dissolve(1.0, time_warp=_warper.easein_quad)  # 带缓动曲线

# ── ATL 转场：old_widget/new_widget 自定义 ──
transform spin(duration=1.0, *, new_widget=None, old_widget=None):
    delay duration
    xcenter .5
    ycenter .5
    old_widget
    events False
    rotate 0.
    easeout (duration / 2) rotate 360.0
    new_widget
    events True
    easein (duration / 2) rotate 720.0

# ── Python 转场：条件选择 ──
init python:
    def dissolve_or_pixellate(old_widget=None, new_widget=None):
        if persistent.want_pixellate:
            return pixellate(old_widget=old_widget, new_widget=new_widget)
        return dissolve(old_widget=old_widget, new_widget=new_widget)

# ── Dict 转场：按层 ──
define dis = { "master": Dissolve(1.0) }

# ── 自动转场配置（scene/show/hide 后自动应用；8.x 起为 store 变量，非 config） ──
define _scene_show_hide_transition = Dissolve(0.25)

label transitions_demo2:
    scene black
    with slowdissolve
    show logo base at truecenter
    with fadehold
    with slide
    with spin
    with dissolve_or_pixellate
    with dis
    pause
    scene black
    return
