# Ren'Py 开发模式（dsh-renpy-dev）v1.0.0

> 让 AI 写对 Ren'Py——14 个经引擎验证的知识库驱动的完整 DSH 开发环境。

在 DeepSeek Harness（DSH）内提供完整的 **Ren'Py 游戏开发工作台**：浏览器内编辑器（语法高亮/补全/查找替换）、lint/运行/截图/自动化测试、保存历史与检查点回滚、工作区域锁定、AI 学习注释、14 个 Ren'Py 知识库（skill），以及可供 AI 直接调用的 9 个开发工具。

本仓库是**开源仓库版**（面向开发者/贡献者），含完整验证资产。普通使用者请用 **Releases** 里的发行版 zip（不含验证资产，更轻量）。

> 📦 文档导航：
> - **English version** → **`README.en.md`**
> - **部署流程**（完整版，含两种模式/参数/故障排查/升级卸载）→ 见 **`DEPLOY.md`**
> - **用户指南**（功能/操作/预期/回归表 + **个人经验回传给开发者的方法**）→ 见 **`GUIDE.md`**
> - **知识流水线**（14 个 skill 怎么生产出来的：提取→核验→引擎验证）→ 见 **`docs/knowledge-pipeline.md`**
> - **贡献指南**（三层经验隔离 + 提交规范）→ 见 **`CONTRIBUTING.md`**
> - **术语表**（Ren'Py 中英术语对照）→ 见 **`docs/glossary.md`**
> - 快速上手 → 见下文。

## 许可

[MIT License](LICENSE)。

---

## 一、快速部署（给使用者）

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
   - 复制 preset、14 个 skill、链接 dsh-renpy-dev-client 插件包
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

## 二、部署后验证

1. 重启 dsh，**新建会话**，preset 选择「**RenPy Dev**」。
2. 在会话页签中找到「**Ren'Py**」页签并打开。
3. 顶部输入项目路径（含 `game/` 的 Ren'Py 项目根目录）→ 点 **⟳ 加载**。
   - 没有项目？用对话框让 AI 执行 `renpy_scaffold` 生成一个，或让 AI 打开 SDK 自带示例（`<SDK>\the_question`）。
4. 快速冒烟：
   - 左侧出现文件树 → 点开一个 `.rpy` → 编辑器打开
   - 改一行 → `Ctrl+S` 保存 → 顶栏 **⚠ 检查** → lint 通过
   - 顶栏 **▶ 运行** → 游戏窗口弹出 → **📷 截图** → **■ 停止**

详细测试清单见 `GUIDE.md`。

---

## 三、目录结构

```
dsh-renpy-dev/
├── deploy.ps1                        # 一键部署脚本（入口）
├── README.md                         # 本文件（快速上手）
├── DEPLOY.md                         # 部署流程完整指南（两种模式/参数/排查/升级卸载）
├── GUIDE.md                        # 用户指南（功能/操作/预期/回归表）
├── CONTRIBUTING.md                   # 贡献指南（三层经验隔离 + 提交规范）
├── LICENSE                           # MIT License
├── NOTICE                            # 第三方许可声明（Ren'Py / DSH）
├── agent-presets/
│   └── renpy/
│       ├── preset.yml                # preset 名称/描述
│       ├── agent.cordis.yml.template # 插件组合（部署时替换 {{SDK_PATH}}）
│       └── plugins/
│           ├── renpy-host.mjs        # 9 个 agent 工具（lint/index/scaffold/run/...）
│           └── indexer.py            # 项目索引器（引擎 dump）
├── skills/
│   └── renpy-*.md                    # 14 个 Ren'Py 知识库（按需加载）
├── docs/
│   ├── knowledge-pipeline.md         # 知识生产方法论（提取→核验→引擎验证）
│   └── glossary.md                   # 中英术语对照表（翻译/本地化基准）
├── verification/                     # 验证资产（仓库版独有）
│   ├── scripts/                      # 提取/验证脚本（extract-*.js、verify-text.py）
│   ├── extracts/                     # 结构化提取产物（*-extract.json）
│   ├── projects/                     # 17 个引擎验证项目 + eq-test
│   └── tests/                        # 15 个单测（274 断言）
└── renpy-client/                     # web 插件包（编辑器 UI + /renpy-dev 服务）
    ├── package.json
    ├── cordis.patch.yml
    └── lib/
        ├── host.js                   # 30 个 /renpy-dev/* 端点（需重启 dsh）
        ├── renpy-core.js             # 共享纯函数模块（lineDiff/hasOpenToolCall）
        └── client.js                 # Ren'Py 面板 UI（刷新即生效）
```

> 目录树中的 `dsh-renpy-dev/` 即本仓库根（解压发布包后即为该目录名，部署时 `cd` 进入即可）。

### 部署产物（脚本写入目标机器）

| 位置 | 内容 |
|---|---|
| `~/.dsh/.agent-presets/renpy/` | agent preset（含生成的 agent.cordis.yml） |
| `~/.dsh/skills/renpy-*.md` | 14 个 skill |
| `~/.dsh/profiles/node_modules/dsh-renpy-dev-client` | 插件包 junction（指向发布包；DSH 安装方式无关） |
| `~/.dsh/profiles/web/package.json` | web profile（bundles + link 依赖） |
| `~/.dsh/renpy.config.json` | SDK/索引器/skill 路径配置（运行时读取） |

> 插件统一挂到 `~/.dsh/profiles/node_modules/`（dsh bundle 双锚点解析的第二锚点），
> 无论 DSH 是 npm 全局安装还是 npx 方式运行都能加载。
> 删除部署：移除以上位置的 renpy 相关项 + profiles/web/package.json 里的 dsh-renpy-dev-client 行即可。

---

## 四、运行时路径配置

部署脚本生成 `~/.dsh/renpy.config.json`，插件运行时按以下优先级解析路径（无需改代码）：

1. 插件 `config`（agent.cordis.yml / cordis.patch.yml 里的 config）
2. `~/.dsh/renpy.config.json`
3. 环境变量 `RENPY_SDK_PATH` / `RENPY_USERDIR` / `RENPY_INDEXERPATH` / `RENPY_SKILLROOT`
4. 默认推导（userDir = `<sdk>/../.renpy-user` 等）

重装/换机后只要重跑 `deploy.ps1`，配置自动更新。

---

## 五、版本说明

- 面向 **Ren'Py 8.5.x**（本地 SDK 锁定 8.5.3）。
- 打包（distribute）暂不支持：SDK 打包在 launcher 内部，本插件只覆盖 build.rpy 配置知识（`renpy-build` skill）。
- 变更记录与实现细节见各版本 **Releases** 说明；贡献方式见 `CONTRIBUTING.md`。
