# 构建发布验证：build.rpy 配置（build.html + 00build.rpy 核验）

# 打包配置（写在项目 build.rpy；运行打包需 launcher 的 "Build Distributions"）

init python:
    build.name = "demo_game"                     # 项目名（生成目录/可执行名的基础）
    build.directory_name = "demo_game-1.0"       # 发布目录名（默认 name-version）
    build.executable_name = "demo_game"          # 可执行名（.exe/.app/.sh）

    # 文件分类：README 进所有包，排除其他 txt
    build.classify("README.txt", "all")
    build.classify("**.txt", None)

    # 归档：脚本/图片分两个 .rpa
    build.archive("scripts", "all")
    build.archive("images", "all")
    build.classify("game/**.rpy", "scripts")
    build.classify("game/**.rpyc", "scripts")
    build.classify("game/**.jpg", "images")
    build.classify("game/**.png", "images")

    # 自定义包：bonus 内容单独打包
    build.archive("bonus_archive", "bonus")
    build.classify("game/bonus/**", "bonus_archive")
    build.package("all-premium", "zip", "windows mac linux renpy all bonus")

    # 平台专属（Android 额外文件）
    build.classify("game/**/icon.png", "android")

label build_demo:
    "build.rpy 配置已定义（lint 验证语法）。"
    return
