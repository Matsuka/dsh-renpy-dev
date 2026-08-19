# DSH Ren'Py 开发工作台（dsh-renpy-dev）v1.1.0

> 一次对 DSH 核心思想的验证：agent preset + skills + web 插件三形态深度融合，自举构建的 Ren'Py 开发工作台。

在 DeepSeek Harness（DSH）内提供完整的 **Ren'Py 游戏开发工作台**：浏览器内编辑器（语法高亮含 **Python 块**、补全、查找替换、codicon 图标系统）、lint/运行/截图/自动化测试、保存历史与检查点回滚、工作区域锁定、写守卫、静态诊断与报错诊断面板、AI 学习注释、个性化设置（25 个颜色 token + 8 套预制配色）、15 个 Ren'Py 知识库（skill）+ 界面规范，以及可供 AI 直接调用的 13 个开发工具。

本仓库是**开源仓库版**（面向开发者/贡献者），含完整验证资产。普通使用者请用 **Releases** 里的发行版 zip（不含验证资产，更轻量）。

> 📦 文档导航：
> - **English version** → **`README.en.md`**
> - **部署流程**（完整版，含两种模式/参数/故障排查/升级卸载）→ 见 **`DEPLOY.md`**
> - **用户指南**（功能/操作/预期/回归表 + **个人经验回传给开发者的方法**）→ 见 **`GUIDE.md`**
> - **测试用户功能手册**（一站式：环境启动 + 逐功能详解 + 操作测试 + FAQ + 经验回传）→ 见 **`TESTER-GUIDE.md`**
> - **知识流水线**（15 个 skill 怎么生产出来的：提取→核验→引擎验证）→ 见 **`knowledge-pipeline.md`**
> - **贡献指南**（三层经验隔离 + 提交规范）→ 见 **`CONTRIBUTING.md`**
> - **术语表**（Ren'Py 中英术语对照）→ 见 **`glossary.md`**
> - 快速上手 → 见下文。

## 许可

[MIT License](LICENSE)。

---

## 一、项目说明

### 1.1 这是什么

**dsh-renpy-dev** 是一套装在 DeepSeek Harness（DSH）里的 **Ren'Py 游戏开发工作台**：把一个普通的 AI 编程对话界面，扩展成带完整开发工具链的浏览器面板，让"看代码 → 改代码 → 验证 → 运行"的整个 Ren'Py 开发循环在浏览器内闭环完成，AI 全程参与但每一步都可审计、可回滚。

核心形态是 **agent preset + skills + web 插件三形态深度融合**：

| 形态 | 作用 |
|---|---|
| **agent preset**（RenPy Dev） | 把 13 个开发工具（lint/index/scaffold/run/…）注册给 AI，AI 可自主调用 |
| **skills 知识库**（15 个 renpy-*） | AI 写 Ren'Py 代码时按需加载引擎事实，减少瞎编语法 |
| **web 插件**（renpy-dev-client） | 浏览器内完整工作台 UI + 39 个本地服务端点 |

这套工具本身也是**用 DSH 自己的架构自举构建**的——是对 DSH 核心思想（preset + skills + 插件三形态组合出专用开发环境）的一次完整验证。

### 1.2 设计理念

- **类 VSCode 工作台 + 类 Adobe 面板**：活动栏/侧栏/编辑器/面板四区布局；面板可停靠、拖拽、浮动、最大化、布局持久化。
- **引擎事实优先**：知识库全部经「源码核验 + lint 验证」生产（见 `knowledge-pipeline.md`），AI 的 Ren'Py 知识有据可依。
- **透明可审计**：AI 每步改动实时可见（修改面板 diff + gutter 标记）、每次保存自动备份、每轮对话自动检查点——任何一步都可回滚。
- **安全双保险**：**工作范围**（编辑与 AI 修改被锁定在区域内）+ **写守卫**（保存前四层结构校验），防止人和 AI 破坏脚本。
- **零侵入部署**：对 DSH 宿主的少量视觉调整（隐藏原生输入框、logo 品牌色）为运行时 CSS 注入，不改任何 DSH 安装文件。

### 1.3 架构（四层 + 共享核心）

```
┌─────────────────────────────────────────────────────────────┐
│ 界面层  renpy-client/lib/client.js  浏览器面板（编辑器/面板/设置）│
├─────────────────────────────────────────────────────────────┤
│ 宿主层  renpy-client/lib/host.js    39 个 /renpy-dev/* 端点  │
├─────────────────────────────────────────────────────────────┤
│ 共享核心 renpy-core.js              纯函数（诊断/守卫/解析/合并）│
├─────────────────────────────────────────────────────────────┤
│ 知识层  skills/renpy-*.md           15 个知识库 + 界面规范    │
├─────────────────────────────────────────────────────────────┤
│ 工具层  agent-presets/renpy/        13 个 AI 工具 + 索引器    │
└─────────────────────────────────────────────────────────────┘
```

**工作原理速览**：

| 机制 | 说明 |
|---|---|
| 编辑器 | textarea + 语法高亮 overlay（RPY 语句 + **Python 块**四级配色），lint 错误下划线、括号配对、补全、查找替换 |
| 调试桥接 | 运行游戏时自动注入 `_debug_bridge.rpy` → 指令文件（跳转/截图/点击/推进）与回报文件（label/变量/截图轮询）双向通信 |
| 持久化 | 个性化设置分层（全局 + 项目）、面板布局 localStorage、备份/检查点在 DSH 用户目录（不写项目目录） |
| 状态轮询 | 游戏运行状态 2s 轮询（驱动运行/停止合一按钮）、调试面板 2s 轮询（变量/画面/路线图进度） |

### 1.4 功能全景

| 类别 | 功能 |
|---|---|
| **编辑** | 语法高亮（RPY + Python 块）、补全、查找替换、括号配对、多标签页、未保存提示、外部修改同步、行号模式/参考线 |
| **验证** | lint 检查（引擎级）、自动化测试 rpytest、静态诊断（引用完整性五类扫描） |
| **运行调试** | 运行/停止合一、整屏截图、路线图（状态机 + 跳转）、实时画面（点击/推进/回滚）、运行时变量监控、报错诊断（traceback 结构化 + 根因定位） |
| **协作** | 侧栏对话（Markdown/思考展开/编辑重发）、轨迹跳转、学习注释（AI 逐行讲解）、检查点时间线 |
| **安全** | 工作范围锁定、写守卫（四层校验）、保存历史与检查点回滚 |
| **定制** | 个性化设置（49 项：字体/缩进/显示/亮暗/界面语言 + **25 个颜色 token** + 8 套预制配色 + 全局/项目分层）、GUI 主题可视化定制（gui.rpy） |
| **知识** | 15 个 Ren'Py 知识库 + 语句 ⇄ Python 等价对照 |

### 1.5 知识库（skill）清单

> AI 写 Ren'Py 代码时**按需加载**对应 skill；全部经「源码核验 + lint 验证」生产（见 `knowledge-pipeline.md`）。

| skill | 说明（加载时机） |
|---|---|
| `renpy-core` | 核心语句语法速查、语句与 Python 等价互转、缩进与顺序约定。写 .rpy 时必读 |
| `renpy-text` | 对白与文本：say 变体、Character 定义、`[var]` 插值、`{b}{size}{color}` 标签、转义换行 |
| `renpy-atl` | ATL 动画与变换：transform 定义、插值、on/parallel/choice/repeat、位置缩放旋转 |
| `renpy-transitions` | 转场效果：with dissolve/fade/move、Dissolve/Fade/CropMove/PushMove、按层 Dict 转场 |
| `renpy-screen` | screen 语言：布局、控件、样式前缀、action、show/hide/call screen、use 嵌套 |
| `renpy-gui` | GUI 主题定制：gui.init 分辨率、gui.* 颜色/字体/字号、style 覆盖层级 |
| `renpy-api` | Python 层 API：renpy.* 函数、persistent、renpy.music/sound、store 变量 |
| `renpy-l10n` | 本地化/翻译：translate 语句、字符串 old/new、extract/merge 工作流 |
| `renpy-save` | 存档系统：FileSave/Load/Page/Slot、自动存档、回滚 + Gallery/Music Room/Achievement |
| `renpy-layeredimage` | 分层立绘：layeredimage 语句、attribute/group、表情差分、auto 属性 |
| `renpy-sprites` | 特殊显示对象：SpriteManager 粒子（飘雪/落叶）、Drag & Drop、Movie 视频 |
| `renpy-route` | 路线/分支设计：设计文档↔状态机↔代码双向转换、route-map.json、可达性分析 |
| `renpy-test` | 自动化测试：testsuite/testcase、run/advance/click、until、enabled/xfail |
| `renpy-build` | 构建发布配置：build.rpy 的 classify/archive/package、平台标签 |
| `renpy-practices` | 最佳实践总览：文件/角色/标签组织、资源管理、跨域坑清单 |
| `workbench-ui` | 工作台界面样式设计规范（含 codicon 图标系统命名约定；维护界面时参考） |

### 1.6 Agent 工具清单

> preset「RenPy Dev」注册给 AI 的 **13 个开发工具**（AI 在对话中可自主调用；工作台按钮与这些工具同源）。

| 工具 | 说明 |
|---|---|
| `renpy_scaffold` | 创建新 Ren'Py 项目（目录结构 + gui 模板生成） |
| `renpy_lint` | 对项目运行官方 lint，返回退出码与完整输出 |
| `renpy_index` | 生成/刷新项目结构索引（labels/defines/screens/transforms，含 file:line） |
| `renpy_find` | 静态诊断（引用完整性秒级扫描，无需运行引擎） |
| `renpy_guard` | 写守卫校验（缩进/保留名/重复 label/括号配对四层） |
| `renpy_read_error` | 结构化读取报错落盘文件（traceback.txt/log.txt/errors.txt） |
| `renpy_route_generate` | 把 route-map.json 状态机生成为 .rpy 代码骨架 |
| `renpy_run` | 启动游戏（真实窗口；自动停旧进程；注入调试桥接） |
| `renpy_stop` | 停止正在运行的游戏进程 |
| `renpy_status` | 查询游戏进程状态 + 最近输出 |
| `renpy_test` | 运行 rpytest 自动化测试（headless） |
| `renpy_compile` | 强制重编译脚本（.rpy → .rpyc） |
| `renpy_screenshot` | 整屏截图保存为 PNG（供人类和 AI 查看游戏画面） |

---

## 二、文档目录

> 全部文档一览。测试用户只需 **`TESTER-GUIDE.md`**（一站式）；开发者/贡献者读其余。

| 文档 | 读者 | 内容 |
|---|---|---|
| **`README.md`** | 所有人 | 本文件：项目说明、文档目录、快速部署、验证、目录结构、运行时配置、部署与 DSH 原生元素 |
| **`GUIDE.md`** / `GUIDE.en.md` | 使用者 | 用户指南：功能操作/预期/回归表 + 经验回传（面向使用者的精简版） |
| **`TESTER-GUIDE.md`** / `TESTER-GUIDE.en.md` | **测试用户** | **一站式功能手册**：环境启动 + 逐功能详解（用途/入口/行为/边界）+ 操作测试 + 23 条回归清单 + FAQ + 经验回传 |单 + FAQ + 经验回传 |
| **`DEPLOY.md`** / `DEPLOY.en.md` | 部署者 | 部署流程完整指南：两种模式/参数/故障排查/升级卸载 |
| **`CONTRIBUTING.md`** | 贡献者 | 三层经验隔离 + 提交规范 |
| **`knowledge-pipeline.md`** | 知识生产者 | 15 个 skill 怎么生产出来：提取→核验→引擎验证 |
| **`glossary.md`** | 翻译/学习者 | Ren'Py 中英术语对照表 |
| **`skills/renpy-*.md`**（15 个） | AI（按需加载） | Ren'Py 知识库：api/atl/build/core/gui/l10n/layeredimage/practices/route/save/screen/sprites/test/text/transitions |
| **`skills/workbench-ui.md`** | 界面维护者 | 工作台界面样式设计规范（含 codicon 图标系统命名约定） |
| **`.research/`** | 开发者（内部） | 调研档案：生态调研/编辑器配置调研/路线图 schema 等 |

> 各文档随版本持续更新；英文版见对应 `.en.md`。

---

## 三、快速部署（给使用者）

### 前置要求

| 项 | 要求 |
|---|---|
| Windows | 10/11（PowerShell 5.1+） |
| DSH | 已安装——**npm 全局安装 或 npx 方式运行均可**（未安装时脚本可引导，见下） |
| Ren'Py SDK | 需要自行准备（约 340MB，脚本**不自动下载**） |
| Node.js / npm | 安装 DSH 时需要 |

> 完整部署流程、两种模式（已装 DSH / 连 DSH 一起装）、参数与故障排查见 **`DEPLOY.md`**。

### 部署步骤

1. **解压**本发布包到目标机器任意目录（如 `D:\dsh-renpy-dev`）。
2. 打开 PowerShell，进入该目录：

```powershell
cd D:\dsh-renpy-dev
.\deploy.ps1
```

3. 脚本会依次：
   - 检测 DSH（未装则询问：手动安装后继续 / 用 `-InstallDsh` 自动装）
   - 检测 Ren'Py SDK（在常见位置找；找不到则提示你输入路径，**不自动下载**）
   - 复制 preset、15 个 skill（+ 界面规范）、链接 dsh-renpy-dev-client 插件包
   - 更新 web profile 并生成配置文件
4. **重启 dsh**（完全退出后重新启动）。

### 常用参数

```powershell
.\deploy.ps1 -SdkPath D:\renpy-8.5.3-sdk   # 直接指定 SDK 目录
.\deploy.ps1 -InstallDsh                    # 目标机连 DSH 一起安装（npm 全局）
.\deploy.ps1 -DshHome D:\custom\.dsh        # 自定义 DSH 数据目录（一般不用）
```

### Ren'Py SDK 下载（如果还没有）

- 官方下载页：https://www.renpy.org/latest.html
- 8.5.3 直链：https://www.renpy.org/dl/8.5.3/renpy-8.5.3-sdk.zip
- 解压后目录内应含 `renpy.py` 与 `renpy.exe`。

---

## 四、部署后验证

1. 重启 dsh，**新建会话**，preset 选择「**RenPy Dev**」。
2. 在会话页签中找到「**Ren'Py**」页签并打开。
3. 顶部输入项目路径（含 `game/` 的 Ren'Py 项目根目录）→ 点 **⟳ 加载**。
   - 没有项目？用对话框让 AI 执行 `renpy_scaffold` 生成一个，或让 AI 打开 SDK 自带示例（`<SDK>\the_question`）。
4. 快速冒烟：
   - 左侧出现文件树 → 点开一个 `.rpy` → 编辑器打开
   - 改一行 → `Ctrl+S` 保存 → 顶栏 **⚠ 检查** → lint 通过
   - 顶栏 **▶ 运行游戏** → 游戏窗口弹出 → **📷 截图** → 再点同一按钮（变 **■ 停止**）停止

详细测试清单见 `GUIDE.md`。

---

## 五、目录结构

```
dsh-renpy-dev/
├── deploy.ps1                        # 一键部署脚本（入口）
├── README.md                         # 本文件（项目说明 + 文档目录 + 快速上手）
├── DEPLOY.md                         # 部署流程完整指南（两种模式/参数/排查/升级卸载）
├── GUIDE.md                        # 用户指南（功能/操作/预期/回归表）
├── TESTER-GUIDE.md                   # 测试用户功能手册（一站式：功能详解 + 测试 + FAQ）
├── knowledge-pipeline.md             # 知识生产方法论（提取→核验→引擎验证）
├── glossary.md                       # 中英术语对照表（翻译/本地化基准）
├── CONTRIBUTING.md                   # 贡献指南（三层经验隔离 + 提交规范）
├── LICENSE                           # MIT License
├── NOTICE                            # 第三方许可声明（Ren'Py / DSH）
├── agent-presets/
│   └── renpy/
│       ├── preset.yml                # preset 名称/描述
│       ├── agent.cordis.yml.template # 插件组合（部署时替换 {{SDK_PATH}}）
│       └── plugins/
│           ├── renpy-host.mjs        # 13 个 agent 工具（lint/index/scaffold/run/...）
│           └── indexer.py            # 项目索引器（引擎 dump）
├── skills/
│   ├── renpy-*.md                    # 15 个 Ren'Py 知识库 + workbench-ui 界面规范（按需加载）
│   └── workbench-ui.md               # 工作台界面样式设计规范（含图标系统）
├── verification/                     # 验证资产（仓库版独有）
│   ├── scripts/                      # 提取/验证脚本（extract-*.js、verify-text.py）
│   ├── extracts/                     # 结构化提取产物（*-extract.json）
│   ├── projects/                     # 17 个引擎验证项目 + eq-test
│   └── tests/                        # 21 个单测（node --check + 全量回归）
└── renpy-client/                     # web 插件包（编辑器 UI + /renpy-dev 服务）
    ├── package.json
    ├── cordis.patch.yml
    └── lib/
        ├── host.js                   # 39 个 /renpy-dev/* 端点（需重启 dsh）
        ├── renpy-core.js             # 共享纯函数模块（lineDiff/hasOpenToolCall/诊断/守卫）
        └── client.js                 # Ren'Py 面板 UI（刷新即生效；含 codicon 图标系统）
```

> 目录树中的 `dsh-renpy-dev/` 即本仓库根（解压发布包后即为该目录名，部署时 `cd` 进入即可）。

### 部署产物（脚本写入目标机器）

| 位置 | 内容 |
|---|---|
| `~/.dsh/.agent-presets/renpy/` | agent preset（含生成的 agent.cordis.yml） |
| `~/.dsh/skills/renpy-*.md` | 15 个知识库 skill + workbench-ui 界面规范 |
| `~/.dsh/profiles/node_modules/dsh-renpy-dev-client` | 插件包 junction（指向发布包；DSH 安装方式无关） |
| `~/.dsh/profiles/web/package.json` | web profile（bundles + link 依赖） |
| `~/.dsh/renpy.config.json` | SDK/索引器/skill 路径配置（运行时读取） |

> 插件统一挂到 `~/.dsh/profiles/node_modules/`（dsh bundle 双锚点解析的第二锚点），
> 无论 DSH 是 npm 全局安装还是 npx 方式运行都能加载。
> 删除部署：移除以上位置的 renpy 相关项 + profiles/web/package.json 里的 dsh-renpy-dev-client 行即可。

---

## 六、运行时路径配置

部署脚本生成 `~/.dsh/renpy.config.json`，插件运行时按以下优先级解析路径（无需改代码）：

1. 插件 `config`（agent.cordis.yml / cordis.patch.yml 里的 config）
2. `~/.dsh/renpy.config.json`
3. 环境变量 `RENPY_SDK_PATH` / `RENPY_USERDIR` / `RENPY_INDEXERPATH` / `RENPY_SKILLROOT`
4. 默认推导（userDir = `<sdk>/../.renpy-user` 等）

重装/换机后只要重跑 `deploy.ps1`，配置自动更新。

---

## 七、部署与 DSH 原生元素（v1.1 起）

本插件会对 **DSH 宿主界面做少量运行时视觉调整**：

| 调整 | 实现 | 依赖 |
|---|---|---|
| 隐藏 DSH 原生对话输入框（面板自带输入区，避免双输入框） | 面板挂载时向 `document.head` 注入 `<style>`，卸载时移除 | `[data-composer-seat]` 属性 |
| 固定 DSH 侧栏 logo（鱼形/品牌字标）为 Ren'Py 品牌色 `#00b8c3`，不随主题配色变化 | 同上，CSS 覆盖 `fill: currentColor` 继承链 | DSH 侧栏 CSS Module 类名语义后缀（`logoRow`/`railFish`/`panelIcon`） |

**对部署流程的影响：无额外步骤。**

- 以上均为**运行时注入**，不修改任何 DSH 安装文件（卸载面板/关闭页面即还原）；deploy.ps1 流程、插件 junction 链接、重启 dsh 生效的规则**完全不变**。
- ⚠️ **唯一注意**：注入的 CSS 依赖 DSH 的 DOM 结构（类名后缀）。**升级 DSH 后请回归验证**两项注入是否仍生效（输入框不重复出现、侧栏 logo 为品牌色）；若失效，面板内对应代码位置（client.js 的注入 effect）需按新类名调整。
- **skills 部署范围**（v1.1 起）：`deploy.ps1` 复制 `skills\*.md`（15 个 `renpy-*` 知识库 + `workbench-ui` 界面规范）；旧版本只复制 `renpy-*.md`。
- **升级部署**：已有部署机重新解压发布包（或更新 `renpy-client/lib/` 与 `skills/`）→ 重跑 `deploy.ps1`（覆盖 preset/skills/链接）→ **完全退出并重启 dsh**。

---

## 八、版本说明

- 面向 **Ren'Py 8.5.x**（本地 SDK 锁定 8.5.3）。
- 打包（distribute）暂不支持：SDK 打包在 launcher 内部，本插件只覆盖 build.rpy 配置知识（`renpy-build` skill）。
- 变更记录与实现细节见各版本 **Releases** 说明；贡献方式见 `CONTRIBUTING.md`。
