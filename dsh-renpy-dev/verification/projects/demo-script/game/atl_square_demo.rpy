# 正方形动画演示（renpy-atl skill 实战）：
# ① 四角依次平移两轮（easein_quad 类加速度，第一轮慢/第二轮快）
# ② 平移到屏幕中心
# ③ 顺时针旋转：加速(easein) → 匀速 2s(linear) → 减速停(easeout)
# ④ 并行：缩放随当前速度（加速放大 / 匀速保持 / 减速还原）

image square = Solid("#ff8888", xsize=80, ysize=80)

transform square_full_show:
    # ── 起点：左上角 ──
    xalign 0.0 yalign 0.0

    # ── 第一轮四角平移（慢，每段 2.0s，easein_quad = 类加速度） ──
    easein_quad 2.0 xalign 1.0 yalign 0.0    # 左上 → 右上
    easein_quad 2.0 xalign 1.0 yalign 1.0    # 右上 → 右下
    easein_quad 2.0 xalign 0.0 yalign 1.0    # 右下 → 左下
    easein_quad 2.0 xalign 0.0 yalign 0.0    # 左下 → 左上

    # ── 第二轮四角平移（快，每段 1.2s） ──
    easein_quad 1.2 xalign 1.0 yalign 0.0
    easein_quad 1.2 xalign 1.0 yalign 1.0
    easein_quad 1.2 xalign 0.0 yalign 1.0
    easein_quad 1.2 xalign 0.0 yalign 0.0

    # ── 平移到屏幕中心 ──
    linear 1.0 xalign 0.5 yalign 0.5

    # ── 中心：顺时针旋转（加速→匀速2s→减速停）并行缩放（随速度） ──
    parallel:
        rotate 0.0
        easein_quad 2.0 rotate 360     # 加速：0 → 1 圈
        linear 2.0 rotate 720          # 匀速 2 秒：保持速度再加 1 圈
        easeout_quad 2.0 rotate 1080   # 减速：再走 1 圈停下

    parallel:
        zoom 1.0
        easein_quad 2.0 zoom 1.8       # 加速段 → 放大
        linear 2.0 zoom 1.8            # 匀速段 → 保持最大
        easeout_quad 2.0 zoom 1.0      # 减速段 → 还原

label atl_square_demo:
    scene black
    show square at square_full_show
    pause
    return
