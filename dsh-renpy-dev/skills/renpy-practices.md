---
name: renpy-practices
description: Ren'Py 工程最佳实践与常见坑的总览：文件/角色/标签组织、资源管理、跨域坑清单（text/atl/screen/api/l10n 浓缩）、性能注意。写脚本前先扫一眼，组织决策时参考。个人项目经验请写入私有文件 renpy-practices-personal.md，勿入本文件。
---

# Ren'Py 工程实践速查（框架版）

## 使用说明：经验三层隔离与优先级

本 skill 是**开源社区项目**的通用骨架，只含前两层经验：

- **L1 引擎事实**：语法/语义/API（经源码核验 + lint 验证）——可信度最高
- **L2 通用原则**：组织/命名/性能的"道理"（不绑定任何具体项目）——社区共识

**L3 个人经验**（具体项目/个人习惯）**不进本文件**——请写入私有文件 `~/.dsh/skills/renpy-practices-personal.md`，随机器积累，不随开源包发布。

**经验优先级（冲突时谁说了算）**：
`引擎事实(L1) > 通用原则(L2) > 个人经验(L3) > 模型常识`

写代码时以 L1 语法规则为准；组织决策参考 L2 原则；个人习惯放 L3；模型凭印象永远垫底。

**贡献指南**：新坑/新经验 → 判定层级 → L1/L2 条目经源码核验 + lint 验证后 PR 到对应主题区；L3 写入自己的私有文件。

**查文档兜底（L1 约定）**：本 skill 与各 renpy-* skill 是**静态知识快照**，可能未覆盖全部特性。
当需要 skill 未覆盖的语法/API 时：
1. **不要凭记忆臆造**——查阅 SDK 自带官方文档 `<sdkPath>/doc/` 下的 HTML
   （如 text.html、atl.html、screens.html、screen_actions.html、layeredimage.html 等）。
2. 文档与技能冲突时，**以引擎实测为准**（写最小示例 → `renpy_lint` / 运行验证）。
3. 核实后把结论写入私有文件 `renpy-practices-personal.md`（L3），供后续复用；
   若属于通用事实（L1）或通用原则（L2），按贡献指南提交。

---

<!-- 以下主题区逐轮讨论填充（每轮一个主题，逐条确认"通用性"后写入） -->

## 组织规范（L2）

**文件组织取决于项目形态**（两种形态可涵盖常规项目）：

| 形态 | 剧本本质 | 文件切分 | label 组织 |
|---|---|---|---|
| **线性分支剧情**（传统 VN） | 章节/路线顺序 + menu 分支 | 按章节/路线：`chapter1.rpy`、`route_a.rpy` | label 语义化命名（章节前缀，如 `chapter1_forest`） |
| **状态机**（系统重/多状态流转） | label 是状态节点，jump/call 流转 | 按状态/系统分组：`states.rpy`、`events.rpy`、`screens.rpy` 分离 | label 系统前缀（`state_`/`event_`）防冲突 |

通用条目（两种形态都适用）：
- **label 全局唯一是硬约束**（L1：重名 lint 报错——`label start` 重复定义实测会直接报错）
- 角色/图像等定义集中在文件头部或独立定义文件，避免散落（`definitions.rpy`）
- `define`（常量）与 `default`（可存档变量）分组管理，语义清晰

## 资源管理（L1 自动索引规则 + L2 组织）

**自动索引精确规则**（00images.rpy 源码 + 8.5.3 实测双核验）：
- 默认扫描目录 `images/`（`config.image_directories` 可扩展）；扩展名 .jpg/.jpeg/.png/.webp/.avif/.svg
- **只按文件名（basename）注册，目录层级不参与命名**：`images/bg/house.png` → image `house`；`images/charas/eileen/happy.png` → image `happy`（不是 `charas eileen happy`）
- 文件名按空格/下划线切分多组件：`images/eileen happy.png` → `eileen happy`（`show eileen happy` 差分可用）——**差分靠文件名，目录只做组织**
- 文件名转小写；`name@2x.png` 高清变体自动关联同名
- 已有显式 `image` 定义时不覆盖
- 同名不同角色会冲突：`charas/a/happy.png` 与 `charas/b/happy.png` 都注册成 `happy`

**组织建议（L2）**：
- 资源按类型分目录（images/audio/fonts），角色子目录仅组织（`charas/eileen/` 放该角色文件）
- 差分素材文件名带 tag：`eileen happy.png`、`eileen sad.png`（放同角色子目录）
- 需要目录参与命名 / 特殊命名时，用显式 `image 名 = "路径"` 语句（自动索引满足不了时）

**分层差分（LayeredImage，见 renpy-layeredimage）**：
- 角色差分优先用 `layeredimage`（部件分层，避免表情×衣服整图爆炸）；auto 组 + 自动索引配合：`charas/eileen/eileen happy.png` 自动进 `show eileen happy`
- 换装用 `group` 互斥 + `null`（脱装）；表情/姿态各一个 auto 组
- 简单项目/少量差分可继续用整图 + 文件名差分；分层是"差分变多时"的升级路径

**缓存（L1 实测）**：`game/cache/` 可安全删除（重新编译）；损坏的 cache 会导致 renpy 包初始化异常（如 `renpy.music` 属性缺失），清缓存即恢复。

## 跨域坑清单（L1 浓缩，全收）

> 写脚本前扫一眼；细节见对应 skill（标注）。全部经源码核验或实测。

**文本（renpy-text）**：
- `%` 不需要转义（`50%` 原样；`\%` 反而显示 `%%`——"%%→%"是旧语法）
- 字面 `{tag}` 写 `{{tag}`（`{{tag}}` 显示 `{tag}}`，`}}` 不折叠）
- `!q` 只把 `{` 加倍为 `{{`，`}` 不动
- 文本标签渲染期才校验，**lint 查不到**（未知标签/坏插值必须实际运行）
- `text_cps` 是玩家偏好不是项目配置（默认速度用 `style say_dialogue: slow_cps N`）
- `{w}`/`{p}` 无参数是等点击，带参数（`{w=1.0}`）才等 N 秒

**ATL（renpy-atl）**：
- 表达式在 transform **首次执行时**求值（参数变量要先定义）
- `repeat` 无限循环卡住后续语句（用 `time N` 跳出或 `contains` 隔离）
- `on` 事件块不阻塞（执行完就结束该状态）
- `parallel` 全部分支完成才继续（一个分支 repeat 会无限等）
- `xalign 0.5` == `xpos 0.5 xanchor 0.5`（属性别名）
- 带状态 ATL（on/choice）在 screen 里要 `at Transform(...)` 独立实例
- rotate 改变包围盒（rotate_pad），zoom 在旋转后应用
- warp 函数签名 `(t: float) -> float`，t/返回值都 0~1

**screen（renpy-screen）**：
- **每次交互整块重算**：screen 是描述不是绘制——副作用别放 `$`/`python:` 块（每帧跑）
- `default` 变量只在本 screen 存活（跨屏用 store/persistent）
- `action` 是点击才执行；`$ n = 1` 是渲染时立即执行
- `on` 事件不阻塞（同 ATL）
- `call screen` 只有 Return/Jump/Hide 能结束；返回存 `_return`
- `show screen` 不等继续走、`call screen` 阻塞等返回值
- 状态样式靠 `idle_/hover_/selected_/insensitive_` 前缀（漏了就一个样式吃遍所有状态）
- imagebutton 五态图缺图会黑块（auto 自动拼名）

**API（renpy-api）**：
- `init python` 里**不需要 `import renpy`**（写了且引用 `renpy.music` 会让 lint 异常）
- 背景乐用 `renpy.music`、音效用 `renpy.sound`（用错通道会被 stop music 一起停）
- persistent 别存不可 pickle 数据（会存档失败）
- 音频文件缺失运行时警告不崩（开发期注释占位）
- `renpy.show_screen` 不等点击（要等待用 `call screen`/`call_screen`）
- 函数里 `renpy.say(None, ...)` 或角色对象，who 不能传字符串角色名
- persistent 改动不刷新界面（需 `renpy.restart_interaction()`）

**l10n（renpy-l10n）**：
- 自动标识随源文本内容变化（改内容→hash 变→旧翻译失效；用显式 `id` 防）
- 翻译文本 `{tags}` 必须与原文对齐
- 插值变量名不翻译（`[points]` 原样保留）
- say 走语句翻译（translate 块），menu/screen 走 strings——别搞混
- 相同文本分别翻译用 `{#上下文}` 消歧
- 孤儿 translate 块 lint 警告（源里没有对应 id）

**通用**：
- label 全局唯一（重名 lint 报错）
- `game/cache/` 可删；损坏会导致 renpy 包初始化异常（清缓存恢复）
- 写完全部 lint 验证（lint 会查 label 重名/screen 参数/图像引用，但不查文本标签）

## 性能注意（L1 核验 + L2）

**图像缓存**（config.py / im.py 核验）：
- `config.image_cache_size_mb` 默认 **400**（贴图缓存上限）；超出时按需淘汰重载——大图+小缓存会反复加载抖动
- 图像尺寸别远超屏幕分辨率（2 倍以上白占缓存 + 缩放开销）；背景图做成实际屏幕尺寸
- `renpy.free_memory()` 手动清缓存（大场景切换/内存紧张时）
- 调试：`RENPY_DEBUG_IMAGE_CACHE` 环境变量或 `--debug-image-cache` 参数打印缓存内容

**重绘模型**（display/core.py 核验）：
- 画面按需重绘：transform 动画/timer/needs_redraw 回调触发 redraw；无变化不重绘（省电省 CPU）
- screen 里**每帧重算的表达式别放重活**（文件 IO/大列表推导/网络——每次交互都跑）
- ATL 动画数量与复杂度直接决定 redraw 频率；大量并行动画开销叠加
- `config.fast_redraw_frames = 12`（快速重绘帧数上限）

**通用**：先功能后优化；性能问题用 `--profile` / 帧率观察定位，别凭感觉优化。

## 常用 config 速查（L1 核验 + 散落引用）

config 是引擎全局配置（几百个），这里收**高频**；完整表见官方 configuration variables 文档。用法：`define config.xxx = 值`（init 阶段）。

| config | 默认 | 用途（详见 skill） |
|---|---|---|
| `image_cache_size_mb` | 400 | 图像缓存上限（practices 性能） |
| `rollback_enabled` | True | 回滚开关（False 禁 Ctrl+Z） |
| `window_icon` | None | 窗口图标路径 |
| `name` / `version` | "" | 游戏名/版本（打包名用） |
| `default_transform` | None | show 默认 transform（可改默认位置） |
| `say_arguments_callback` | None | say 参数后处理回调 |
| `save_directory` | None | 存档目录名 |
| `language` | None | 默认语言（l10n） |
| `scene_show_hide_transition` | None | scene/show/hide 后自动转场（transitions） |
| `window_show_transition` / `window_hide_transition` | None | 对话窗口显隐转场 |
| `automatic_images` | None | 自动索引开关（00obsolete 旧机制，资源管理） |
| `text_cps` | 玩家偏好 | 默认打字速度（**玩家偏好非项目配置**，用 style slow_cps，见 text） |
| `quit_action` | Quit() | 退出行为（极简项目可 `Quit(confirm=False)` 免确认） |

**坑**：config 是 init 值，运行时改不生效；改 config 要重启游戏验证；部分 config 定义在 common .rpy（如 automatic_images）不在 config.py——查默认值先 grep 全 SDK。
