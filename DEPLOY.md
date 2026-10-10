# DSH Ren'Py 开发工作台（dsh-renpy-dev）— 部署指南

> 本文档面向**部署者**（在目标机器上安装这套 DSH Ren'Py 开发工作台的人），
> 完整说明一键部署的流程、两种模式、参数、验证与故障排查。
> 使用者（测试者）的操作指南见 `GUIDE.md`；快速上手见 `README.md`。
> **English version** → `DEPLOY.en.md`。
> **版本 v1.2.0** —— 支持 **DSH 0.2.0-rc.2 及以上**（0.1.x 的目录式 preset 已被引擎废除，脚本会拒绝部署）。

---

## 1. 部署概览

`deploy.ps1` 把本发布包部署到目标机器的 DSH，一次完成 7 件事：

| # | 步骤 | 产物 |
|---|---|---|
| 1 | 检测 DSH 是否已安装 + **版本闸门**（0.1.x 直接拒绝） | 决定走哪种模式（见 §3） |
| 2 | 检测 / 指定 Ren'Py SDK | 记录 SDK 路径（不下载） |
| 3 | 复制 17 个 skill（16 个 renpy-* 知识库 + 界面规范） | `~/.dsh/skills/*.md` |
| 4 | 链接 dsh-renpy-dev-client 插件包 | `~/.dsh/profiles/node_modules/dsh-renpy-dev-client`（junction） |
| 5 | 建**包内** node_modules junction | `<发布包>\renpy-client\node_modules` → DSH 安装目录的 node_modules |
| 6 | 更新 web profile | `~/.dsh/profiles/web/package.json`（bundles + link） |
| 7 | 生成运行配置 | `~/.dsh/renpy.config.json` |

> **preset 不再单独部署**：0.2.0 废除了目录式 preset（`~/.dsh/.agent-presets/<id>/`），
> 「RenPy Dev」preset 现在是插件包 `renpy-client/cordis.patch.yml` 里的一行
> `name: '@deepseek-ai/dsh-agent-preset'`，随插件包一起生效（见 §5「关键细节」）。

部署完成后**重启 dsh** 即生效（host 侧插件需重启加载；client 侧刷新页面即可）。

---

## 2. 前置条件

| 项 | 要求 | 说明 |
|---|---|---|
| 操作系统 | Windows 10/11 | 脚本用 PowerShell 5.1+，默认随系统自带 |
| DSH | **0.2.0-rc.2 及以上** | 已安装或允许脚本安装；0.1.x 会被版本闸门拒绝（见 §3、§7） |
| Ren'Py SDK | **必须自备** | 约 340MB，脚本**不会自动下载**，只检测/提示 |
| Node.js + npm | 仅连 DSH 一起装时需要 | `npm install -g @deepseek-ai/dsh@0.2.0-rc.2` |

### Ren'Py SDK 获取（如果还没有）

- 官方下载页：https://www.renpy.org/latest.html
- 8.5.3 直链：https://www.renpy.org/dl/8.5.3/renpy-8.5.3-sdk.zip
- 解压后目录内应含 `renpy.py` 与 `renpy.exe`（脚本以此判断 SDK 有效）。

---

## 3. 部署模式

脚本根据目标机器是否已装 DSH 自动分流：

### 模式 A：已装 DSH（默认，只部署插件）

直接运行：

```powershell
cd <解压目录>
.\deploy.ps1
```

脚本检测到 DSH 后跳过安装，直接部署插件部分。

**版本闸门**：脚本会读取检测到的 DSH 安装目录里的 `package.json` 版本，**`0.1.*` 直接失败退出**并给出升级指引：

```powershell
npm install -g @deepseek-ai/dsh@0.2.0-rc.2
```

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

脚本先执行 `npm install -g @deepseek-ai/dsh`（当前最新即 **0.2.0-rc.2**），安装成功后继续部署插件；
随后同样要过 §3 模式 A 的版本闸门。
（需要 Node.js/npm 可用；全局安装可能需要管理员权限的终端。）

> 用 npx 方式使用 DSH 的用户不需要此模式——DSH 已可通过 npx 运行（如
> `npx @deepseek-ai/dsh`），脚本检测到 npx 缓存或 profiles 目录即可直接部署插件。

### 未装 DSH 且未加 -InstallDsh 时

脚本会提示并询问：手动装好 DSH 后继续（输入 `y`），或退出改用 `-InstallDsh` 重跑。

### 模式 C：官方桌面端（Electron App）

DSH 官方桌面端（[deepseek.com/download](https://www.deepseek.com/download/)，包名 `@deepseek-ai/dsh-desktop`）
是 Electron 外壳 + **自带 dsh 运行时**（不依赖系统的 Node/npm/pnpm），与 npm 全局或 npx 的 dsh
**共用同一个 `~/.dsh`**，但它用**自己的 profile**：`~/.dsh/profiles/desktop/`（首次启动由 App 自动创建）。
**`deploy.ps1` 不会碰它**——脚本只部署 `web` profile。

> 该 profile 由 Electron 应用**独占管理**，命令行会被明确拒绝：
> `dsh --profile desktop --dump-config` → `error: profile "desktop" is managed exclusively by the Electron application`

要让工作台出现在桌面端，手动把 bundle 加进桌面端的 profile 清单，然后**完全退出并重启桌面端**：

```powershell
# 1) 插件包 junction 是共享的：deploy.ps1 已建在 ~/.dsh/profiles/node_modules/dsh-renpy-dev-client，无需重复建
# 2) 编辑 ~/.dsh/profiles/desktop/package.json：加一项依赖 + 一个 bundle 选择
```

```json
{
  "dependencies": {
    "dsh-renpy-dev-client": "link:C:/Users/<你>/.dsh/profiles/node_modules/dsh-renpy-dev-client"
  },
  "dsh": { "profile": { "bundles": [
    "@deepseek-ai/dsh-base",
    "@deepseek-ai/dsh-web-app",
    "dsh-renpy-dev-client"
  ] } }
}
```

3. 退出桌面端：Windows 上**关窗口只是隐藏到托盘**，必须托盘图标右键 → **Quit DeepSeek Harness**，再重新打开。
4. 判定宿主插件是否加载：`http://127.0.0.1:<端口>/renpy-dev/info` 返回 **200**。端口见桌面端启动日志里的
   `dsh web: http://127.0.0.1:<端口>/?token=…` 行（App 用系统分配的端口，**不固定 3080**）。

> `skills/`、`renpy.config.json`、会话与凭据都在共享的 `~/.dsh` 下，桌面端自动可见，**无需重复配置**；
> 但 **`web` 与 `desktop` 的 profile 是两套**：一端配过不代表另一端也配过。

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
    DSH 安装位置: ...\npm\node_modules\@deepseek-ai\dsh
==> 检查 DSH 版本
    DSH 版本: 0.2.0-rc.2                    ← 0.1.x 在此失败退出
==> 检测 Ren'Py SDK
    SDK: D:\renpy-8.5.3-sdk                  ← 检测到/你输入的 SDK
==> 部署 skills
    已复制 17 个 skill（16 知识库 + 界面规范）
==> 链接 renpy-client 包
    renpy-client -> <发布包>\renpy-client      ← junction 建立
==> 创建包内 node_modules junction（供工具插件解析 @deepseek-ai/dsh-tools）
    工具依赖目录: ...\node_modules            ← 含 @deepseek-ai/dsh-tools 的那个
    renpy-client\node_modules -> ...\node_modules
==> 更新 web profile
    web profile: ...\profiles\web\package.json
==> 生成 renpy.config.json
    写入 ...\renpy.config.json
==> 部署完成
```

**关键细节**：

- **preset 如何生效**：`renpy-client/cordis.patch.yml` 里插入两行——`renpy-dev`（宿主插件 `lib/host.js`，注册约 39 个 `/renpy-dev/*` 端点）与 `preset-renpy`（`name: '@deepseek-ai/dsh-agent-preset'`，「RenPy Dev」preset）。只要 `dsh-renpy-dev-client` 出现在 web profile 的 `dsh.profile.bundles` 里，这个 patch 就会在 profile 组合时被应用，**不再需要单独的 preset 目录**。
- **不再有 SDK 路径占位符**：0.1.x 的 `agent.cordis.yml.template` + `{{SDK_PATH}}` 替换已废除；13 个工具插件（包导出子路径 `dsh-renpy-dev-client/tools` → `lib/renpy-host.mjs`）自己读 `~/.dsh/renpy.config.json`（优先级：插件 config → `renpy.config.json` → `RENPY_*` 环境变量）。
- **包内 node_modules junction 是必需的**：工具插件在模块顶层 import 裸说明符 `@deepseek-ai/dsh-tools`，而插件包的真实路径在发布包目录（其上层没有 node_modules），所以脚本把 `<发布包>\renpy-client\node_modules` 链接到 DSH 安装目录里那个**真正含 `@deepseek-ai/dsh-tools`** 的 node_modules（自动兼容 `npm install -g` 的嵌套布局与 `npm install --prefix` / npx 的提升布局，并会解析 junction 的真实目标）。
- `dsh-renpy-dev-client` 用 **junction**（`mklink /J`）链接到 `~/.dsh/profiles/node_modules`——不是复制，以后升级发布包时原位置替换即可，无需重新链接。
- `renpy.config.json` 是运行时路径配置（sdkPath / userDir / indexerPath / skillRoot），插件启动时读取；其中 `indexerPath` 指向 `<发布包>\renpy-client\lib\indexer.py`。
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

完整功能测试见 `GUIDE.md` 第 4-5 节。

### 引擎级验证证据（DSH 0.2.0-rc.2 实测）

- 宿主插件：`/renpy-dev/info` 返回 200；`/renpy-dev/lint` 对真实项目跑 Ren'Py 8.5.3 lint，退出码 0。
- 客户端 bundle：已注册进启动图（`plugins/??dsh-renpy-dev-client/client.js&rev=…`，返回 200），该行携带 `inject: ["@deepseek-ai/dsh-client-ui-renderer"]`。
- 13 个 `renpy_*` 工具全部注册成功；`renpy_run` 返回 `onExpiry: 'none'`（前台调用为 `'kill'`）。

### 测试者个人经验文件（部署后自动生效）

部署完成后，测试者可自行创建 `~/.dsh/skills/renpy-practices-personal.md` 记录个人踩坑与习惯
（本项目按**三层经验隔离**设计：L1 引擎事实 / L2 通用原则 进开源包，L3 个人经验留在个人文件）。
该文件会被模型自动加载参考，无需任何配置。如何把积累的经验回传给开发者
（整理模板 / 三种提交方式 / 开发者处理流程）见 `GUIDE.md` 第 9 节。

---

## 7. 故障排查

| 现象 | 原因与处理 |
|---|---|
| `x 缺少 DSH，无法链接插件包` | 目标机没有 DSH（npm 全局 / npx 缓存 / profiles 目录均未检测到）。用 `-InstallDsh` 重跑，或先手动安装/运行一次 DSH（npx 方式运行过就会初始化 profiles 目录） |
| `x 路径不是有效的 Ren'Py SDK` | `-SdkPath` 或输入路径里没有 `renpy.py`。检查解压是否完整、路径是否正确 |
| `x 创建 junction 失败` | 目标目录被占用或权限不足。以管理员身份重开 PowerShell 再跑；确认 `~/.dsh/profiles\node_modules\dsh-renpy-dev-client` 未被其他程序占用 |
| 重启后 preset 列表里没有「RenPy Dev」 | 0.2.0 已无 preset 目录：确认 `dsh-renpy-dev-client` 在 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 中（即 `renpy-client/cordis.patch.yml` 被应用），并用 `dsh --profile web --dump-config` 确认组合树里出现 `preset-renpy` |
| preset 出现，但 13 个 `renpy_*` 工具缺失 / 报 `@deepseek-ai/dsh-tools` 找不到 | 包内 `node_modules` junction 缺失，或指向了不含 `dsh-tools` 的 node_modules；重跑 `deploy.ps1`（见 §5「关键细节」） |
| `deploy.ps1` 报「本发布包要求 DSH 0.2.0 及以上」 | 目标机 DSH 是 0.1.x：先 `npm install -g @deepseek-ai/dsh@0.2.0-rc.2` 升级，再重跑脚本 |
| 面板里 Ren'Py 页签不存在 | web profile 未生效：检查 `profiles/web/package.json` 的 bundles 是否含 `dsh-renpy-dev-client`，且 `~/.dsh/profiles/node_modules/dsh-renpy-dev-client` 存在；确认重启过 dsh |
| 加载项目报 SDK 相关错误 | 检查 `~/.dsh/renpy.config.json` 的 `sdkPath` 是否指向有效 SDK；或设置环境变量 `RENPY_SDK_PATH` 后重启 |
| 编辑器改动不生效 / 看不到新功能 | client 侧改动刷新页面即可；host 侧改动必须重启 dsh |
| 面板加载后没有 skill | `~/.dsh/skills/` 下应有 `*.md`（17 个 skill：16 个 renpy-* 知识库 + workbench-ui）；缺则重跑 deploy.ps1 |
| 设置里「RenPy Dev」卡片是红色 **「加载失败」**、**点不动** | 这是 **preset 定义级**挂载失败，不是插件没装。0.2.0 的注册表审计会把「某行从未启动 / 激活时抛错 / 服务泄漏到根 realm」整条定义判为 broken，而 broken 卡片按设计是 `aria-disabled`（不能选为默认值）。**诊断原文**：鼠标悬停在红色徽标上会浮出。**根因（已修）**：`renpy-client/lib/renpy-host.mjs` 的 `apply(ctx, config)` 缺默认参数，而 preset 行 `renpy-dev-host` 没有 `config:`，加载器传的是 `undefined` → 第 47 行 `config.routeGeneratorPath` 抛 `Cannot read properties of undefined (reading 'routeGeneratorPath')`。用新发布包覆盖后**重启 dsh** 生效（挂载失败是终局的：不重启不会重新挂载） |
| 桌面端里没有「Ren'Py」页签 / 没有「RenPy Dev」 | 桌面端用的是**它自己的 `desktop` profile**，而 `deploy.ps1` 只写 `web` profile → 按 §3 模式 C 手动加入 bundle 并重启桌面端。判定：`http://127.0.0.1:<端口>/renpy-dev/info` 返回 200（端口见桌面端启动日志的 `dsh web:` 行） |
| `dsh --profile desktop …` 报 `managed exclusively by the Electron application` | 正常行为：`desktop` profile 由桌面端独占，命令行不可管理。改它的组合请编辑 `~/.dsh/profiles/desktop/package.json` 后重启桌面端 |

> ⚠️ **DSH 版本必须匹配**：本发布包里的插件文件是 **0.2.0 格式**（宿主侧调用 `ctx.shell.execute`、preset 走 bundle patch 行）。
> 如果把插件包 junction 进 **0.1.x** 的 DSH，工作台会直接失效（既没有 `ctx.shell.execute`，也没有 preset 行）。
> **务必先把 DSH 升到 0.2.0-rc.2，再重启 dsh。**

---

## 8. 升级 / 卸载

### 升级

1. 确认 DSH 已是 **0.2.0-rc.2 及以上**（0.1.x 先 `npm install -g @deepseek-ai/dsh@0.2.0-rc.2`）。
2. 用新发布包**覆盖**原解压目录（保留目录名）。
3. 重新运行 `.\deploy.ps1`（幂等，会自动重建两个 junction 并刷新配置）。
4. 重启 dsh。

### 卸载

手动移除以下项：

```
~/.dsh/skills/*.md                          # 17 个 skill（可选）
~/.dsh/profiles/node_modules/dsh-renpy-dev-client    # 插件包 junction
<发布包>\renpy-client\node_modules          # 包内 node_modules junction（随发布包一起删即可）
~/.dsh/renpy.config.json                     # 运行配置（可选）
```

> `~/.dsh/.agent-presets/renpy/` 是 **0.1.x 遗留项**：0.2.0 已废除目录式 preset，该目录不再被读取，可安全删除。

并在 `~/.dsh/profiles/web/package.json` 中删除 `dependencies.dsh-renpy-dev-client` 和 `dsh.profile.bundles` 里的 `"dsh-renpy-dev-client"` 两项，然后重启 dsh。

桌面端同理：在 `~/.dsh/profiles/desktop/package.json` 中删除同样的两项，然后重启桌面端。

---

## 9. 运行时路径优先级（无需改代码）

插件解析路径的顺序：

1. 插件 `config`（0.2.0 下来自 `renpy-client/cordis.patch.yml` 里各行的 `config`；0.1.x 的 `agent.cordis.yml` 已废除）
2. `~/.dsh/renpy.config.json`（deploy 脚本生成）
3. 环境变量：`RENPY_SDK_PATH` / `RENPY_USERDIR` / `RENPY_INDEXERPATH` / `RENPY_SKILLROOT`
4. 默认推导（如 userDir = `<sdk>/../.renpy-user`）

换机 / 换 SDK 后重跑 `deploy.ps1` 即可，配置自动更新，不需要改任何代码。
