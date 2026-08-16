# l10n 源文件（翻译骨架：game/tl/<语言>/ 下翻译覆盖）
# 原理：say 自动编号标识 → extract 生成骨架 → 翻译者填新文本 → 运行时按标识查表

define e = Character(_("艾琳"))

label l10n_demo:
    e "你好，这是需要翻译的对白。" id hello_line    # 显式 id：翻译文件用同名标识
    e "得分 [points] 分。" id score_line            # 插值 [points] 照常求值，变量不翻译
    menu:
        "继续":
            jump l10n_next
        "结束":
            return

label l10n_next:
    "字符串翻译测试：_() 标记的字符串"        # screen/menu 文本走 strings old/new
    return
