---
name: 知识贡献（L1/L2 经验回传）
about: 提交经验证的 Ren'Py 引擎事实或通用原则，进入开源 skill
title: "[知识] 简短主题"
labels: knowledge
assignees: ''
---

> 本项目按「三层经验隔离」管理知识：L1 引擎事实 / L2 通用原则进开源 skill，L3 个人经验留在你的私有文件（见 CONTRIBUTING.md §2）。

**经验一句话**
（如：`renpy.music.play` 在 `init` 阶段调用会报错，需在 `start` 之后调用）

**层级判定**
- [ ] L1 引擎事实（语法/语义/API 的确定性结论）
- [ ] L2 通用原则（组织/命名/性能的"道理"，不绑定具体项目）

**验证证据**（L1 必须，L2 建议）
- [ ] 源码位置：文件 + 行号（如 `renpy/substitutions.py` L123）
- [ ] lint 证据：最小 `.rpy` 示例 + `renpy_lint` 输出
- [ ] 引擎运行证据：最小示例 + 观察结果
- [ ] 参考现有验证：`verification/projects/demo-script/` 中同类写法

**最小示例**（可跑）

```rpy
# 贴最小可复现代码
```

**SDK 版本**：8.5.x

**拟写入的 skill**：`renpy-core` / `renpy-text` / `renpy-atl` / `renpy-screen` / `renpy-api` / `renpy-practices` / 其他 ___

**诚实声明**
- 哪些已实测验证：___
- 哪些来自文档/源码推断（未实测）：___
