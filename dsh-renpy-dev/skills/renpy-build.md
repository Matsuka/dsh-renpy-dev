---
name: renpy-build
description: 编写或修改 Ren'Py 的构建发布配置（build.rpy 的 build.name/classify/archive/package 文件分类与归档、平台标签、旧游戏目录）时加载。涉及打包分发、归档 .rpa、多平台发布配置时必读。
---

# Ren'Py 构建发布速查（build.rpy 配置）

内容来自 build.html（59KB）经 00build.rpy 核验，示例经 8.5.3 SDK lint 验证（build_test.rpy）。

## 核心结论

- **打包运行在 launcher**：`Build Distributions`（GUI 工具）——**SDK 命令行没有 distribute 命令**（只有 compile/lint/run/quit/rmpersistent）；skill 覆盖"写 build.rpy 配置"，运行打包用 launcher。
- 配置写在项目 `build.rpy`（`init python:` 里调 `build.*`）。

## 基础配置

```renpy
init python:
    build.name = "mygame"                 # 项目名（生成目录/可执行名基础）
    build.directory_name = "mygame-1.0"   # 发布目录名（默认 name-version）
    build.executable_name = "mygame"      # 可执行名（Windows .exe / Mac .app / Linux .sh）
```
- 名字不能含空格/冒号/分号；`directory_name` 也决定 dists 输出目录名（`mygame-1.0-dists`，在项目上级目录）

## 文件分类（build.classify）

`build.classify(pattern, 标签)`——pattern 支持通配：

| 通配 | 含义 |
|---|---|
| `*` | 匹配除 `/` 外的字符 |
| `**` | 匹配所有（含路径） |
| `**.txt` / `game/*.txt` | 扩展名/目录限定 |

| 标签 | 含义 |
|---|---|
| `all` | 进所有包 + Android |
| `linux` / `mac` / `windows` | 平台专属 |
| `renpy` | 需要引擎文件的包 |
| `android` | Android 专属 |
| `archive` | 进 archive.rpa（但 archive 标签旧式；推荐自定义归档） |
| `None` | 排除该文件 |

```renpy
build.classify("README.txt", "all")
build.classify("**.txt", None)      # 排除其他 txt
```

## 归档（build.archive）

```renpy
build.archive("scripts", "all")     # 声明归档 + 进哪些平台
build.archive("images", "all")
build.classify("game/**.rpy", "scripts")   # 脚本进 scripts.rpa
build.classify("game/**.png", "images")    # 图片进 images.rpa
```
归档文件生成 `<归档名>.rpa`，**默认所有 rpy/rpyc 已进 archive.rpa**（无需手动 classify）；自定义归档用于把资源分组（加快加载/防篡改）。

## 包（build.package）

```renpy
build.package("all-premium", "zip", "windows mac linux renpy all bonus")
```
`build.package(名, 格式, "平台列表")`——格式 `zip`/`tar.bz2` 等；平台列表是文件分类标签集合（自定义标签要先 `build.archive("bonus_archive", "bonus")` 声明）。

## 其他

- **Special Files**：`requirements.txt`/`options.rpy` 等特殊文件自动处理
- **The Old-game Directory**：`game/../old-game/` 里的旧版文件（升级对比用，不进包）
- **Build Functions**：`build.clear()`/`build.remove(pattern)` 清空/移除已分类；`build.dump()` 调试
- **Documentation**：`build.documentation("docs/")` 包含文档

## 常见坑

- **distribute 在 launcher 跑**：SDK 命令行打不了包；确认用 launcher 的 Build Distributions
- **归档与包的区别**：archive=文件分组（.rpa），package=发布包（zip 含哪些 archive 列表）——先 archive 后 package
- **classify 顺序**：后声明的覆盖先声明的（README all + **.txt None 的例子）
- **名字别含特殊字符**：空格/冒号导致打包名错误
- **不分类的文件**：默认按扩展名自动归类（rpy/rpyc 进 archive.rpa 等），自定义 classify 覆盖默认
- **打包前 lint + test**：发布前先 lint + 自动化测试过一遍（见 renpy-test）
