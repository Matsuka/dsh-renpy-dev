# matrixcolor 演示与 lint 验证（00matrixcolor.rpy + im.py 核验）
# 用法：matrixcolor 是 transform 属性，值是 Matrix 或 ColorMatrix 表达式

image logo base = Solid("#88ccff", xsize=120, ysize=120)

# ── 手写 4x4 矩阵：交换红绿通道 ──
transform swap_red_green:
    matrixcolor Matrix([ 0.0, 1.0, 0.0, 0.0,
                         1.0, 0.0, 0.0, 0.0,
                         0.0, 0.0, 1.0, 0.0,
                         0.0, 0.0, 0.0, 1.0 ])

# ── 各内置 ColorMatrix（00matrixcolor.rpy 注册） ──
transform mc_brightness:
    matrixcolor BrightnessMatrix(0.3)          # 提亮（-1~1）

transform mc_contrast:
    matrixcolor ContrastMatrix(1.5)            # 增对比度（>1 增）

transform mc_saturation:
    matrixcolor SaturationMatrix(0.0)          # 0=灰度（NTSC 亮度权重）

transform mc_tint:
    matrixcolor TintMatrix("#ff8800")          # 染色

transform mc_hue:
    matrixcolor HueMatrix(120)                 # 色相偏移 120 度

transform mc_invert:
    matrixcolor InvertMatrix(1.0)              # 反相

transform mc_opacity:
    matrixcolor OpacityMatrix(0.5)             # 半透明

transform mc_colorize:
    matrixcolor ColorizeMatrix("#000000", "#ffffff")   # 黑白图双色渐变

transform mc_sepia:
    matrixcolor SepiaMatrix()                  # 老照片

transform mc_identity:
    matrixcolor IdentityMatrix()               # 原样

# ── 插值动画：matrixcolor 渐变（ColorMatrix.__call__(other, done) 机制） ──
transform mc_animated:
    matrixcolor TintMatrix("#f00")
    linear 2.0 matrixcolor TintMatrix("#00f")   # 红 → 蓝渐变
    linear 2.0 matrixcolor TintMatrix("#f00")
    repeat

# ── SplineMatrix：多点颜色渐变（SplineMatrix(BrightnessMatrix(...), [控制点])） ──
transform mc_spline:
    matrixcolor BrightnessMatrix(0.0)
    linear 2.0 matrixcolor SplineMatrix(BrightnessMatrix(1.0), [ 0.0, 1.0, 0.0 ])

# ── 组合：矩阵乘法（* 组合多个效果，注意顺序） ──
transform mc_combo:
    matrixcolor SaturationMatrix(0.5) * TintMatrix("#4488ff") * BrightnessMatrix(0.2)

label matrixcolor_demo:
    scene black
    show logo base at truecenter
    show logo base at mc_brightness
    pause
    show logo base at mc_contrast
    pause
    show logo base at mc_saturation
    pause
    show logo base at mc_tint
    pause
    show logo base at mc_hue
    pause
    show logo base at mc_invert
    pause
    show logo base at mc_sepia
    pause
    show logo base at mc_colorize
    pause
    show logo base at mc_animated
    pause
    show logo base at mc_spline
    pause
    show logo base at mc_combo
    pause
    return
