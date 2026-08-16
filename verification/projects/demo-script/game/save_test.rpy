# 存档机制验证（块①）：renpy.save/load API + File action 族 + 槽位组织
# 覆盖：renpy.save/load/list_slots、FileSave/FileLoad/FilePage/FileSlot/FileTime/FileScreenshot/QuickSave

init python:
    def save_utils():
        # 存档槽命名：page-slot 约定（auto-1、manual-1 等）
        renpy.save("manual-1", extra_info="手动存档")
        # renpy.load("manual-1")          # 运行时才执行（注释：会直接读档）
        slots = renpy.list_slots()
        return len(slots)

screen save_slots():
    # 存档页 + 槽位（标准存/读档屏骨架）
    vbox:
        textbutton "上一页" action FilePagePrevious()
        textbutton "下一页" action FilePageNext()

        grid 2 3:
            for i in range(1, 7):
                $ slot = "%s-%d" % (FileCurrentPage(), i)
                button:
                    action FileSave(slot)      # 存
                    vbox:
                        text FileSaveName(slot)          # 存档名
                        text FileTime(slot, format="%m/%d %H:%M")  # 时间
                        add FileScreenshot(slot)         # 截图
                        textbutton "读" action FileLoad(slot)
                        textbutton "删" action FileDelete(slot)

screen quick_save_bar:
    hbox:
        textbutton "快速存档" action QuickSave()
        textbutton "快速读档" action QuickLoad()

label save_demo:
    $ n = save_utils()
    "当前存档数 [n]"
    show screen save_slots
    pause
    show screen quick_save_bar
    pause
    hide screen save_slots
    hide screen quick_save_bar
    return
