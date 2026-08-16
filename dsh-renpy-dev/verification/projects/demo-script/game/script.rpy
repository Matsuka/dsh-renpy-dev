# 雨夜——剧本转代码演示（资源均为占位符）
# 缺资源占位：bg/角色图用 Solid 色块；雨声音频用注释标注需 rain.ogg

# 极简项目无标准 GUI layout，退出确认对话框会报错 → 直接退出不确认
init python:
    config.quit_action = Quit(confirm=False)

# ── 占位资源（TODO：替换为真实素材） ──
image bg school_night = Solid("#2b3340")      # 占位：雨夜走廊
image s default = Solid("#7b8aa0")            # 占位：雪 常态
image s sad = Solid("#5a6a82")                # 占位：雪 低落
image s smile = Solid("#9db0c8")              # 占位：雪 微笑

# ── 角色 ──
define s = Character("雪", color="#c8d8f0")
define p = Character("主角", color="#f0d8c8")

# 雨声（需 audio/rain.ogg，缺失时注释不播放）
# 如需启用：play music "rain.ogg" loop

label start:
    # 开场：正方形动画演示（atl_square_demo.rpy）——播放完后点击继续
    call atl_square_demo
    # matrixcolor 颜色矩阵演示（matrixcolor_demo.rpy）——逐个效果点击切换
    call matrixcolor_demo
    scene bg school_night
    with dissolve
    show s default at left
    with fade

    s "又下雨了。"
    p "你好像有心事。"
    show s sad
    s "没什么。"
    "走廊里只有雨声。"   # 演出：雨声渐大（实现需音频，见上注释）

    p "（我该问她吗……）"
    menu:
        "愿意的话，可以告诉我。":
            jump ask_her
        "我去买伞，一起回去吧。":
            jump buy_umbrella

label ask_her:
    show s default
    s "其实……我有点怕黑。"
    show s sad
    s "只是从来没有说出口。"
    jump together

label buy_umbrella:
    show s smile
    s "谢谢你。"
    jump together

label together:
    p "那走吧。"
    "脚步声在走廊里回响。"
    scene black
    with dissolve
    "雨还在下。"
    return
