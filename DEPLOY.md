# 部署流程说明（deploy.ps1 完整指南）

> 本文档面向**部署者**（在目标机器上安装这套 Ren'Py 开发模式的人），
> 完整说明一键部署的流程、两种模式、参数、验证与故障排查。
> 使用者（测试者）的操作指南见 `TESTING.md`；快速上手见 `README.md`。

---

## 1. 部署概览

`deploy.ps1` 把本发布包部署到目标机器的 DSH，一次完成 8 件事：

| # | 步骤 | 产物 |
|---|---|---|
| 1 | 检测 DSH 是否已安装 | 决定走哪种模式（见 §3） |
| 2 | 检测 / 指定 Ren'Py SDK | 记录 SDK 路径（不下载） |
| 3 | 复制 agent preset | `~/.dsh/.agent-presets/renpy/` |
| 4 | 复制 14 个 skill | `~/.dsh/skills/renpy-*.md` |
| 5 | 链接 dsh-renpy-dev-client 插件包 | `~/.dsh/profiles/node_modules/dsh-renpy-dev-client`（junction） |
| 6 | 更新 web profile | `~/.dsh/profiles/web/package.json`（bundles + link） |
| 7 | 建 preset 的 node_modules junction | 指向 DSH node_modules |
| 8 | 生成运行配置 | `~/.dsh/renpy.config.json` |

部署完成后**重启 dsh** 即生效（host 侧插件需重启加载；client 侧刷新页面即可）。

---

## 2. 前置条件

| 项 | 要求 | 说明 |
|---|---|---|
| 操作系统 | Windows 10/11 | 脚本用 PowerShell 5.1+，默认随系统自带 |
| DSH | 已安装 或 允许脚本安装 | 未装时脚本会引导（见 §3） |
| Ren'Py SDK | **必须自备** | 约 340MB，脚本**不会自动下载**，只检测/提示 |
| Node.js + npm | 仅连 DSH 一起装时需要 | `npm install -g @deepseek-ai/dsh` |

### Ren'Py SDK 获取（如果还没有）

- 官方下载页：https://www.renpy.org/latest.html
- 8.5.3 直链：https://www.renpy.org/dl/8.5.3/renpy-8.5.3-sdk.zip
- 解压后目录内应含 `renpy.py` 与 `renpy.exe`（脚本以此判断 SDK 有效）。

---

## 3. 两种部署模式

脚本根据目标机器是否已装 DSH 自动分流：

### 模式 A：已装 DSH（默认，只部署插件）

直接运行：

```powershell
cd <解压目录>
.\deploy.ps1
```

脚本检测到 DSH 后跳过安装，直接部署插件部分。

> **DSH 安装方式兼容**：脚本支持三种已装检测——
> ① npm 全局安装（`%APPDATA%\npm\node_modules\@deepseek-ai\dsh`）
> ② **npx 方式运行**（`%LOCALAPPDATA%\npm-cache\_npx\<hash>\node_modules\@deepseek-ai\dsh`，自动扫描 npx 缓存）
> ③ 已初始化过 DSH 数据目录（`~/.dsh/profiles` 存在）。
> 无论哪种方式，插件都挂载到 **`~/.dsh/profiles/node_modules/`**（dsh-app-boot 的 bundle
> 双锚点解析第二锚点，与 dsh 安装位置无关），因此 npx 缓存 hash 变化也不影响。

### 模式 B：连 DSH 一起装（-InstallDsh）

```powershell
.\deploy.ps1 -InstallDsh
```

脚本先执行 `npm install -g @deepseek-ai/dsh`，安装成功后继续部署插件。
（需要 Node.js/npm 可用；全局安装可能需要管理员权限的终端。）

> 用 npx 方式使用 DSH 的用户不需要此模式——DSH 已可通过 npx 运行（如
> `npx @deepseek-ai/dsh`），脚本检测到 npx 缓存或 profiles 目录即可直接部署插件。

### 未装 DSH 且未加 -InstallDsh 时

脚本会提示并询问：手动装好 DSH 后继续（输入 `y`），或退出改用 `-InstallDsh` 重跑。

---

## 4. 参数说明

| 参数 | 默认 | 说明 |
|---|---|---|
| `-SdkPath <路径>` | 自动检测 | 直接指定 SDK 目录（含 renpy.py）。不传则按常见位置检测：发布包内 `renpy-8.5.3-sdk`、发布包上级、`~`、`D:\`；都找不到则交互式询问 |
| `-InstallDsh` | 关 | 连 DSH 一起通过 npm 全局安装 |
| `-DshHome <路径>` | `$env:DSH_HOME` 或 `~/.dsh` | 覆盖 DSH 数据目录（一般不需要，测试/多实例时用） |

示例：

```powershell
.\deploy.ps1 -SdkPath D:\renpy-8.5.3-sdk          # 指定 SDK
.\deploy.ps1 -SdkPath D:\renpy-8.5.3-sdk -InstallDsh  # 指定 SDK + 连 DSH 一起装
```

---

## 5. 部署过程（逐步说明）

脚本输出以 `==>` 分步，`✓` 为成功，`!` 为提示，`x` 为失败中止。

```
==> 检测环境
    DSH 数据目录: C:\Users\<你>\.dsh        ← DSH 数据目录
==> 检测 Ren'Py SDK
    SDK: D:\renpy-8.5.3-sdk                  ← 检测到/你输入的 SDK
==> 部署 agent preset
    preset 已部署（agent.cordis.yml / preset.yml / plugins/）
==> 部署 renpy-* skills
    已复制 14 个 skill
==> 链接 dsh-renpy-dev-client 包
    dsh-renpy-dev-client -> <发布包>\renpy-client    ← junction 建立
==> 更新 web profile
    web profile: ...\profiles\web\package.json
==> 创建 preset node_modules junction
    preset node_modules -> DSH node_modules
==> 生成 renpy.config.json
    写入 ...\renpy.config.json
==> 部署完成
```

**关键细节**：

- `agent.cordis.yml` 由模板 `agent.cordis.yml.template` 生成，`{{SDK_PATH}}` 替换为实际 SDK 路径（正斜杠形式，YAML 安全）。
- `dsh-renpy-dev-client` 用 **junction**（`mklink /J`）链接到 DSH 的 node_modules——不是复制，以后升级发布包时原位置替换即可，无需重新链接。
- `renpy.config.json` 是运行时路径配置（sdkPath / userDir / indexerPath / skillRoot），插件启动时读取。
- 每次运行脚本都是**幂等**的：已存在的 junction/文件会被重建/覆盖，可安全重复执行。

---

## 6. 部署后验证

1. **重启 dsh**（完全退出进程后重新启动）。
2. 新建会话，preset 选择「**RenPy Dev**」。
3. 打开「**Ren'Py**」页签。
4. 顶部输入一个 Ren'Py 项目路径（含 `game/` 的目录）→ **⟳ 加载**。
   - 没有现成项目？两种快速方式：
     - 在对话里让 AI 执行 `renpy_scaffold` 生成新项目；
     - 让 AI 打开 SDK 自带示例：`<SDK路径>\the_question`。
5. 冒烟三项：
   - 文件树出现 → 点开 `.rpy` → 编辑器打开；
   - 改一行 → `Ctrl+S` → **⚠ 检查** → lint 无错；
   - **▶ 运行** → 游戏窗口弹出 → **📷 截图** → **■ 停止**。

完整功能测试见 `TESTING.md` 第 4-5 节。

### 测试者个人经验文件（部署后自动生效）

部署完成后，测试者可自行创建 `~/.dsh/skills/renpy-practices-personal.md` 记录个人踩坑与习惯
（本项目按**三层经验隔离**设计：L1 引擎事实 / L2 通用原则 进开源包，L3 个人经验留在个人文件）。
该文件会被模型自动加载参考，无需任何配置。如何把积累的经验回传给开发者
（整理模板 / 三种提交方式 / 开发者处理流程）见 `TESTING.md` 第 9 节。

---

## 7. 故障排查

| 现象 | 原因与处理 |
|---|---|
| `x 缺少 DSH，无法链接插件包` | 目标机没有 DSH（npm 全局 / npx 缓存 / profiles 目录均未检测到）。用 `-InstallDsh` 重跑，或先手动安装/运行一次 DSH（npx 方式运行过就会初始化 profiles 目录） |
| `x 路径不是有效的 Ren'Py SDK` | `-SdkPath` 或输入路径里没有 `renpy.py`。检查解压是否完整、路径是否正确 |
| `x 创建 junction 失败` | 目标目录被占用或权限不足。以管理员身份重开 PowerShell 再跑；确认 `~/.dsh/profiles\node_modules\dsh-renpy-dev-client` 未被其他程序占用 |
| 重启后 preset 列表里没有「RenPy Dev」 | 检查 `~/.dsh/.agent-presets/renpy/` 是否存在且含 `agent.cordis.yml`；确认 dsh 完全退出后重启 |
| 面板里 Ren'Py 页签不存在 | web profile 未生效：检查 `profiles/web/package.json` 的 bundles 是否含 `dsh-renpy-dev-client`，且 `~/.dsh/profiles/node_modules/dsh-renpy-dev-client` 存在；确认重启过 dsh |
| 加载项目报 SDK 相关错误 | 检查 `~/.dsh/renpy.config.json` 的 `sdkPath` 是否指向有效 SDK；或设置环境变量 `RENPY_SDK_PATH` 后重启 |
| 编辑器改动不生效 / 看不到新功能 | client 侧改动刷新页面即可；host 侧改动必须重启 dsh |
| 面板加载后没有 skill | `~/.dsh/skills/` 下应有 `renpy-*.md`（14 个）；缺则重跑 deploy.ps1 |

---

## 8. 升级 / 卸载

### 升级

1. 用新发布包**覆盖**原解压目录（保留目录名）。
2. 重新运行 `.\deploy.ps1`（幂等，会自动重建 junction 并刷新配置）。
3. 重启 dsh。

### 卸载

手动移除以下项：

```
~/.dsh/.agent-presets/renpy/                 # preset
~/.dsh/skills/renpy-*.md                     # 14 个 skill（可选）
~/.dsh/profiles/node_modules/dsh-renpy-dev-client    # 插件包 junction
~/.dsh/renpy.config.json                     # 运行配置（可选）
```

并在 `~/.dsh/profiles/web/package.json` 中删除 `dependencies.dsh-renpy-dev-client` 和 `dsh.profile.bundles` 里的 `"dsh-renpy-dev-client"` 两项，然后重启 dsh。

---

## 9. 运行时路径优先级（无需改代码）

插件解析路径的顺序：

1. 插件 `config`（agent.cordis.yml / cordis.patch.yml 中的 config）
2. `~/.dsh/renpy.config.json`（deploy 脚本生成）
3. 环境变量：`RENPY_SDK_PATH` / `RENPY_USERDIR` / `RENPY_INDEXERPATH` / `RENPY_SKILLROOT`
4. 默认推导（如 userDir = `<sdk>/../.renpy-user`）

换机 / 换 SDK 后重跑 `deploy.ps1` 即可，配置自动更新，不需要改任何代码。
