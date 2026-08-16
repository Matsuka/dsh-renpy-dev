# LayeredImage 验证：分层图像 + 差分系统（layeredimage.html + 00layeredimage_ren.py 核验）
# 覆盖：always/attribute default/group 差分/auto 组自动定义/when 条件/image_format/差分切换

# ── 基础分层图像：always 底 + attribute 默认 + group 差分 ──
layeredimage augustina:
    zoom 1.4

    always:
        "augustina_base"

    attribute base2 default

    group outfit:
        attribute dress default:
            "augustina_dress"
        attribute uniform:
            "augustina_uniform"
        attribute psychedelic null

    group face auto:
        pos (100, 100)
        attribute neutral default

# ── image_format：子目录按名取图 ──
layeredimage work:
    image_format "sprites/eileen/{image}.png"

    always:
        "base"

    group outfit:
        attribute work:
            "work_outfit"

# ── when 条件：互斥属性 ──
layeredimage conditional:
    attribute a
    attribute b default when not a
    attribute c default when not b

# ── group 带 variant / prefix ──
layeredimage variant_test:
    group eyes variant blue:
        attribute closed
    group arm prefix left:
        attribute hip

label layeredimage_demo:
    show augustina                    # 显示 dress + neutral（默认）
    pause
    show augustina happy              # auto 组 → 表情切换
    pause
    show augustina uniform -happy     # uniform 替换 dress，-happy 移除表情
    pause
    show conditional a
    pause
    show conditional                  # b/c 默认互斥链
    pause
    return
