---
name: renpy-test
description: 编写或修改 Ren'Py 的自动化测试（testsuite/testcase 语句、run/advance/click 测试命令、until 条件、enabled/only/xfail/parameter 属性、运行 test 命令、hooks）时加载。涉及自动化回归、点击流程测试、发布前验证时必读。
---

# Ren'Py 自动化测试速查

内容来自 testcases.html（135KB）核验，示例经 8.5.3 SDK 实测：`python renpy.py <项目> test <suite>` **直接可用**（rpytest 框架，2 用例 PASSED）。

## 概念：脚本内嵌测试

在 .rpy 里写 `testsuite` + `testcase` 块，模拟玩家操作（点击/推进/条件）验证游戏流程——**比 lint 强**：lint 只验语法，test 真实运行游戏。

## 结构

```renpy
testsuite quick_start:                 # 套件
    before testcase:                   # hook：每个用例前执行
        run Jump("quickstart_demo")    # 从已知 label 开始
        advance until screen "quickstart_popup"

    testcase choose_map:               # 用例
        pause 0.5
        click id "quickstart_close" until not screen "quickstart_popup"
        advance until screen "choice"
        click "Take the map"           # 点菜单选项（文本匹配）
        advance until "You picked the map."   # 推进到出现该文本
        pause 0.5
```

**运行**：
```
python renpy.py <项目路径> test <suite名>     # 或 test（全部）
# 输出 rpytest 报告：test suites/cases/hooks 通过数 + Status: PASSED
```

## testcase 属性（testcase-statement 核验）

- `enabled 表达式`：False 跳过（平台条件，如 `enabled renpy.windows`）
- `only 表达式`：True 时只跑 marked 的用例
- `xfail 表达式`：True 时预期失败（标记 xfailed 不报 failed）
- `parameter 名, [值1, 值2]`：参数化（每个值跑一次；多参数组合）

## 测试命令

**基本**：
| 命令 | 作用 |
|---|---|
| `pause 秒` | 等待（时间推进） |
| `run 语句` | 执行脚本语句（如 `run Jump("label")` 定位起点） |
| `advance [until 条件]` | 推进交互；until 条件满足才停 |
| `click "文本"` | 点击文本匹配的按钮/选项 |
| `click id "名字" [until 条件]` | 按 id 点击（screen 控件 `id "..."`） |

**条件（until 用）**：`screen "名字"`（某 screen 显示中）、`not screen "..."`、`"文本"`（出现该文本）、`label "名"` 等

**键盘/鼠标**：`key "名称"`（按键）、`mouse`/`drag` 命令（模拟操作）

**控制**：条件/选择器/循环语句（test 内可用 if/for 等）

**Python**：`$ print(...)`、`python:` 块（test 内执行；`init python in test:` 定义辅助函数，`renpy.is_in_test()` 判断是否测试环境）

## 用途

- **回归**：改剧本/UI 后跑套件，确认流程没断（menu 选项、弹窗、转场）
- **UI 验证**：screen 是否显示/关闭（`advance until screen "..."`）
- **发布前**：全流程 smoke（start → 关键分支 → ending）

## 常见坑

- **id 是测试锚点**：要给可点击控件加 `id "名字"`（`click id` 才稳）；纯文本匹配 `click "文本"` 依赖文本唯一
- **advance until 条件不满足会卡**：条件写错测试超时；先 `pause` 再 advance
- **弹窗 modal 会挡点击**：先 `click id "close"` 关弹窗再继续
- **run Jump 定位起点**：每个用例从稳定状态开始（before testcase hook），避免依赖前一个用例
- **参数化是乘法**：多个 parameter 组合全跑，注意用例数膨胀
- **测试要可重复**：别依赖随机/真实时间（用 pause 固定节奏）
