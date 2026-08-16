# 自动索引验证：images/ 目录文件自动定义 image（不写 image 语句）
# 预期（若自动索引开启）：images/bg/house.png → `bg house`
#                          images/charas/eileen/happy.png → `charas eileen happy`？或 `eileen happy`？——实测确定

label auto_image_test:
    show bg house            # 若自动索引定义成功，此 show 不报错
    pause
    show charas eileen happy # 测试目录名是否进 tag
    pause
    show definitely_missing_image   # 对照：不存在应报错（验证 lint 查图）
    pause
    return
