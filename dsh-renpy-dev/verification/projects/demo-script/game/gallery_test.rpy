# 内容系统验证（块②③④）：Gallery 图鉴 / MusicRoom 音乐室 / Achievement 成就
# 覆盖：Gallery 类（unlock/image/button/transition）、MusicRoom（add/toggle）、achievement 注册/授予

# ── 块② Gallery 图鉴 ──
init python:
    g = Gallery()
    g.locked_button = "gallery_locked.png"
    g.hover_border = "gallery_hover.png"
    g.idle_border = "gallery_idle.png"
    g.transition = dissolve

    # 正确流程：button 创建 → image 加图 → unlock 解锁条件
    g.button("bg1")
    g.image("bg lecturehall")
    g.image("bg meadow")
    g.unlock("bg lecturehall")

    g.button("bg2")
    g.image("bg uni")
    g.unlock("bg uni")

screen gallery_screen():
    vbox:
        # make_button 返回 Button displayable → 用 add；或 textbutton action g.Action("bg1")
        add g.make_button("bg1", "bg lecturehall")
        textbutton "图组2" action g.Action("bg2")

# ── 块③ MusicRoom 音乐室 ──
init python:
    mr = MusicRoom(fadeout=1.0)
    mr.add("audio/1.ogg")                      # 播放过自动解锁（renpy.seen_audio）
    mr.add("audio/2.ogg", always_unlocked=True)  # 常开（无需播放）

screen music_room_screen():
    vbox:
        textbutton "曲1" action mr.Play("audio/1.ogg")
        textbutton "曲2" action mr.Play("audio/2.ogg")
        textbutton "停止" action mr.Stop()
        textbutton "切换播放" action mr.TogglePlay()

# ── 块④ Achievement 成就 ──
init python:
    achievement.register("ending_true")          # 注册成就
    achievement.register("collector", stat_max=10)  # 进度型成就

    def grant_ending():
        achievement.grant("ending_true")         # 授予
        achievement.progress("collector", 5)     # 进度
        return achievement.has("ending_true")    # 查询

label content_systems_demo:
    $ got = grant_ending()
    "成就状态 [got]"
    show screen gallery_screen
    pause
    show screen music_room_screen
    pause
    hide screen gallery_screen
    hide screen music_room_screen
    return
