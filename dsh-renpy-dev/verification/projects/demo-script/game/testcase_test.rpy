# 自动化测试验证：testsuite + testcase（testcases.html 核验）
# 运行：python renpy.py <项目> test <suite名>

label testcase_demo:
    "欢迎来到自动化测试演示。"
    show screen test_popup
    "关闭弹窗继续。"
    menu:
        "选地图":
            "你选了地图。"
        "离开":
            "你离开了。"
    "演示结束。"
    return

screen test_popup():
    modal True
    frame:
        xalign 0.5 yalign 0.5
        vbox:
            spacing 12
            text "测试弹窗"
            textbutton "关闭":
                id "test_close"
                action Hide("test_popup")

testsuite test_suite:
    before testcase:
        run Jump("testcase_demo")
        advance until screen "test_popup"

    testcase choose_map:
        pause 0.5
        click id "test_close" until not screen "test_popup"
        pause 0.5
        advance until screen "choice"
        click "选地图"
        advance until "你选了地图。"
        pause 0.5

    testcase leave_map:
        pause 0.5
        click id "test_close" until not screen "test_popup"
        pause 0.5
        advance until screen "choice"
        click "离开"
        advance until "你离开了。"
        pause 0.5
