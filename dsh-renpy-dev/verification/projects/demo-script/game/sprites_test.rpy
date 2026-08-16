# 特殊显示对象验证：SpriteManager/SnowBlossom 粒子 + Drag&Drop + Movie
# 覆盖：SnowBlossom 现成粒子、Drag/DragGroup 拖拽、SpriteManager 自定义粒子、movie_cutscene/Movie

# ── 粒子：SnowBlossom（现成飘雪/落叶效果） ──
image snowflake = Solid("#ffffff", xsize=8, ysize=8)

init python:
    def snow_scene():
        # 飘雪：10 片雪花，垂直下落
        sm = SnowBlossom("snowflake", count=10, border=50, xspeed=(20, 50), yspeed=(100, 200))
        return sm

# ── 自定义粒子：SpriteManager + Sprite + update 回调 ──
init python:
    sm = SpriteManager(update=0)

    def particle_update(t):
        for s in sm.sprites:
            s.y += 2
            if s.y > 600:
                s.y = 0
        return 0

    def make_particles():
        sm.update = particle_update
        for i in range(5):
            sp = sm.create("snowflake")
            sp.x = i * 50
            sp.y = i * 30
        return sm

# ── Drag & Drop：DragGroup + Drag（可拖 + 可放置） ──
init python:
    def drag_callback(dragged, drop):
        return drop

    # DragGroup/Drag 是 store 内置类；Drag 是 displayable，screen 用 add 放置
    def make_drag(name, d, draggable=True, droppable=False):
        return Drag(d, drag_name=name, draggable=draggable, droppable=droppable, dragged=drag_callback)

screen drag_screen():
    # Drag 是 displayable，位置由 DragGroup/布局决定
    add make_drag("item1", "snowflake")
    add make_drag("slot", Solid("#333366", xsize=120, ysize=120), draggable=False, droppable=True)

# ── Movie：过场视频 + Movie displayable ──
# $ renpy.movie_cutscene("intro.webm")        # 全屏过场（点击可跳过）
# image mv = Movie(play="intro.webm")          # 嵌入视频

label special_displayables_demo:
    show snow_scene at truecenter
    show make_particles at truecenter
    pause
    show screen drag_screen
    pause
    hide screen drag_screen
    # $ renpy.movie_cutscene("intro.webm", loops=0)
    return
