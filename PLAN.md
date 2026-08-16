# Ren'Py 开发模式（DSH）实施计划

> 目标：为 DSH 制作 Ren'Py 游戏开发模式 —— 整合 SDK 能力（项目创建/打开/运行测试/打包），
> 参照官方 VSCode 扩展（renpy/vscode-language-renpy）定制编辑器，并提供基于官方文档与仓库的速查能力。
> 交付形态：**正式 agent preset**（长期复用），而非会话内临时插件。

## 0. 重开会话恢复清单（新会话先读这里）

本 PLAN 是完整的会话记忆落盘（§1-§22 决策/功能/验证）。重开后按序恢复：

1. **读本 PLAN**（重点：§1 已确认决策、§22 开源定位与经验隔离、§21a-§21r 功能记录）
2. **技能库**：`~/.dsh/skills/renpy-*.md` 8 个（core/text/atl/screen/api/l10n/practices/layeredimage）已就绪，模型按 description 自动加载
3. **代码**：`renpy-client/lib/client.js`（编辑器 UI，模块级纯函数可单测）、`lib/host.js`（/renpy-api 路由，**改动需重启 dsh**）
4. **测试资产**：`.preset-staging/`（单测脚本 + 提取/验证脚本 + demo-script 验证项目 + 资产备份）
5. **关键环境事实**：client.js 刷新即生效；host.js 需重启；sandbox 写 skills 目录需 danger-full-access；demo-script 缓存损坏时清 game/cache
6. **已知边界**：conversation.session 绝不重注册（面板级方案是结论）；编辑器三批已完成；skill 集群 8/8 + layeredimage

---

## 1. 已确认决策

| 决策点 | 选择 |
|---|---|
| 交付形态 | 正式插件 + agent preset（`${DSH_HOME}/.agent-presets/renpy/`） |
| 编辑器形态 | **内建可编辑编辑器**（浏览器内直接编辑文件）；主候选 CodeMirror 6，加载方案 P0/P3 spike 验证 |
| 打包范围 | 仅 PC 三平台（Windows / macOS / Linux） |
| 运行预览 | 真实打开游戏窗口（与 SDK launcher 一致），agent 反馈走 Ren'Py 截图机制 |
| SDK | 本地 `renpy-8.5.3-sdk`（工作区内），锁定 8.5.x |

## 2. 环境与关键技术事实（已实测验证）

- SDK 位于 `D:\Users\windows\Documents\renpy for dsh\renpy-8.5.3-sdk`，含 `renpy.exe`、
  `lib/py3-windows-x86_64/python.exe`（无头运行入口）、`doc/`（完整官方文档镜像）、
  `launcher/`（launcher 项目源码）、`the_question/`、`tutorial/`（示例项目）。
- **沙箱内无头运行已验证可行**：子进程被 DSH 沙箱禁止写 `%APPDATA%`（Ren'Py 默认把
  token/存档放在 `%APPDATA%\RenPy`），但把 `APPDATA` 环境变量重定向到工作区 +
  `--savedir` 参数后，`lint` 完整跑通（exit=0），token/persistent 全部落进工作区，**无需提权**。
- CLI 命令全集（`renpy.py <basedir> <command>`）：`run`（默认，真实窗口）、`lint`、
  `compile`、`test`（自动化测试，`uses_display=True`）、`translate`、`extract_strings`、
  `merge_strings`、`dialogue`、`add_from`、`rmpersistent`、`quit`、`generate_gui`（模板 GUI 生成）。
- 重定向目录约定：`<workspace>/.renpy-user`（`RENPY_PATH_TO_SAVES` 环境变量，`renpy.py` 173 行官方支持，
  saves/tokens/persistent/backups 全部落进该目录；比 APPDATA+`--savedir` 更干净）。
- **编辑器加载 spike 已验证（P0）**：客户端支持 `document/window/fetch` 与**动态 `import()`**；
  从 esm.sh 加载 CodeMirror 6（EditorState）成功 → 编辑器加载策略 = 客户端 `import()` CDN
  （后续可加自托管：webServer 路由 + 同源 `import()`，离线可用）。
  客户端禁用 `setTimeout` 等浏览器定时器全局，需用 `ctx.timer` 服务。
- 沙箱执行要点：工具内跑 Ren'Py 必须**按会话解析 `sandboxPolicy`**（`sandboxPolicy.resolve({session})`）
  再传入 shell 请求，否则执行器默认策略以主目录为工作区根，与 ACL 临时根冲突被拒。
- 预设插件文件改动后，进程内需递增模块 URL 查询串（`?2`→`?3`）绕过模块缓存，服务重启后自动干净。
- 编辑器无现成库：DSH 客户端未打包 Monaco/CodeMirror/Prism/Shiki；文件内容以纯文本工具卡片展示。
- **正式 web profile 客户端包安装模式（P3b 已踩坑总结）**：
  ① 包内 `package.json` 需声明 `dsh.bundle.patch`（`"./cordis.patch.yml"`，照 dsh-base 格式）
     + `dsh.client`（inject/platform:web）+ `exports["./client"]` 指向 bundle；
  ② patch 行用 `- insert:` + `name: '<包名>'`（让包本身成为 loader 条目，客户端扫描器才能发现）；
  ③ profile 的 `package.json` 必须把包声明为 `link:` 依赖（如 vsc 的 dsh-tool-vsc-bridge），
     并 `pnpm install` 装进 profile 的 `node_modules`——否则 loader 以 profile 目录为基准解析失败；
  ④ 写 profile 配置文件禁用 `Set-Content -Encoding UTF8`（会加 BOM，Node JSON.parse 崩溃），
     用 `utf8NoBOM` 或 write 工具；报错排查看 `%APPDATA%\dsh_desktop\server.log`；
  ⑤ 插件集变更（新 dsh.client 包）需重启 dsh 生效；bundle 服务路径 `/plugins/<id>/client.js`。
- **打包没有 CLI 命令**：`distribute` 由 launcher 内部实现（`launcher/game/distribute.rpy`），
  需复用其 `renpy build` API 或封装 launcher 逻辑 → P2 spike（已搁置）。
- `--json-dump` 导出的是构建元数据（build/test/error），**不是**脚本 AST；
  项目模型需另建（见 4.3）。
- 项目模板在 `launcher/game/gui7/`（GUI 模板）+ `generate_gui` 命令；脚手架可用
  "复制模板项目 + generate_gui" 实现。
- 编辑器无现成库：DSH 客户端未打包 Monaco/CodeMirror/Prism/Shiki；文件内容以纯文本工具卡片展示。

## 3. 总体架构

### 3.1 交付物清单（正式 preset `renpy`）

```
${DSH_HOME}/.agent-presets/renpy/
├── preset.yml            # 名称/描述（picker 显示）
├── agent.cordis.yml      # 插件行组合（见 3.2）
└── skills/
    └── renpy-dev/SKILL.md  # 速查技能（语法/CLI/工程约定/翻译流程）
```

插件代码以本地 npm 包形式挂载到 profile（`dsh.profile.bundles` 或 node_modules 依赖，
P0 spike 用 `standingKeyFor` 验证挂载方式）。

### 3.2 插件行组合（agent.cordis.yml 草案）

- `renpy-host`：Host 服务提供者（发布 `renpy` 域服务）→ 与所有消费行同组 + `isolate: { renpy: true }`
- `renpy-client`：Client UI（conversation.view 页签 + 面板）
- `tool-renpy-*`：agent 工具行（消费 `renpy` 服务，不进 realm）
- `skill-renpy-dev`：速查技能行
- 其余行从 `standard` 复制（fs/shell/jobs 等宿主能力保留在 preset 外）

### 3.3 四层能力

```
Host 服务（renpy 域）
  renpy.sdk        SDK 定位/版本检测/APPDATA 重定向环境装配
  renpy.project    项目模型：.rpy 索引（labels/screens/characters/images/翻译）+ 文件监控
  renpy.runner     lint / compile / test / run / translate 沙箱化执行器（输出捕获 + exit code）
  renpy.packager   打包封装（P2 spike 后定）
  renpy.docs       doc 索引与检索（本地 doc/ HTML）

Agent 工具
  renpy_lint / renpy_compile / renpy_run / renpy_test / renpy_scaffold /
  renpy_build / renpy_query_docs / renpy_index / renpy_translate

Client UI（conversation.view 新页签 "Ren'Py"）
  项目树 → **可编辑代码编辑器**（CodeMirror 6：.rpy 语法高亮/行号/查找/多文件标签页）→
  lint 结果面板（错误可跳转定位）→ 运行控制台 + 截图 → 打包面板 → 速查面板
  编辑保存经 host.call → Host fs 写盘；与 agent 编辑并发时做版本冲突提示

Skill + 系统提示段
  renpy-dev 速查（P0 先交付核心语法 + CLI 用法）
```

## 4. 分阶段任务

### P0 —— 骨架与 lint 反馈闭环（0.5–1 天）✅ 已完成
- ✅ 挂载方式：相对路径行（`./plugins/renpy-host.mjs`）+ 预设目录内插件文件 + node_modules junction
- ✅ 编辑器加载 spike：**动态 `import()` 加载 CodeMirror 6 可行**（esm.sh），客户端有 document/window/fetch
- ✅ Host 插件：SDK 装配、`RENPY_PATH_TO_SAVES` 重定向、按会话解析 `sandboxPolicy` 的 runner
- ✅ 工具：`renpy_lint`（端到端 exit=0 验证）
- 备注：预设文件改动后递增 `?N` 破模块缓存；客户端禁用 setTimeout（用 ctx.timer）

### P1 —— 项目模型与项目生命周期（1–2 天）✅ 已完成
- ✅ 项目模型：`plugins/indexer.py`（一次 renpy 运行，自定义命令 dump_index）
      产出 labels（namemap.values()，绕开 8.5.3 dump.py 的 label 恒空 bug）+
      defines/screens/transforms（复用启动时 dump() 的 reflect.json）
- ✅ `renpy_scaffold`：`generate_gui <target> --start --template=<sdk>/gui` 无头生成
      gui.rpy/options.rpy/screens.rpy/script.rpy + 图片模板
- ✅ `renpy_index`：索引 JSON 存 `<userDir>/index/<project>.json`，返回摘要（labels 全量 + 计数）
- ✅ 文件打开/编辑：复用现有 fs/read/write/edit 工具，索引用 renpy_index 刷新
- 验收：the_question 索引 labels=6/defines=156/screens=22；脚手架生成完整可运行项目

### P2 —— 运行/测试反馈环（1–2 天）✅ 已完成（打包按用户要求搁置）
- ✅ `renpy_run`：真实游戏窗口（与 SDK 一致），后台进程管理（start/kill/status/readOutput 增量输出）
- ✅ `renpy_stop` / `renpy_status`：进程生命周期
- ✅ `renpy_test`：自动化测试（rpytest，headless，exit=0）
- ✅ `renpy_compile`：强制重编译（exit=0）
- ✅ `renpy_screenshot`：整屏截图存 `<userDir>/screenshots/*.png`（沙箱内 Add-Type+CopyFromScreen 可用），
      agent 可用 read_image 查看 → 形成"run → 截图 → 修改 → 再 run"反馈环
- ⏸️ **打包**：用户决定搁置。已确认 CLI 路径可用：
      `renpy.py <sdk>/launcher distribute <project> --destination <dir> [--package pc|mac|linux]`
      （launcher 注册的 headless 命令，TextReporter 输出），后续需要时直接接入 `renpy_build`
- 验收：compile/test/run 生命周期 + 截图全部端到端验证通过

### P3 —— 内建编辑器 + 开发视图（3–4 天）
- [ ] conversation.view 注册 "Ren'Py" 页签：项目树 + 多文件标签页
- [ ] **CodeMirror 6 嵌入**（按 P0 spike 结论）：.rpy 语法高亮（自写 Lezer/StreamLanguage 模式，
      参照官方扩展 grammar）、行号、查找替换、折叠
- [ ] 文件操作闭环：打开/编辑/保存经 host.call → Host fs 写盘；磁盘变更检测与刷新；
      与 agent 编辑的冲突提示
- [ ] lint 面板：错误/警告列表，点击跳转到编辑器对应行
- [ ] 运行控制台 + 截图展示、速查面板
- [ ] 主题适配（Theme tokens 亮/暗）
- [ ] 验收：浏览器内"编辑 → 保存 → lint → 跳转修错 → run"完整闭环

### P4 —— 编辑器深度定制 + 翻译 + 速查扩充（持续）
- [ ] 对照官方扩展 [vscode-language-renpy](https://github.com/renpy/vscode-language-renpy)
      的 package.json/grammar 精确化功能矩阵：高亮规则、snippets、大纲、
      label/character/image 跳转与重命名（编辑器内实现跳转/大纲）
- [ ] 翻译流程：extract_strings / translate / merge_strings 工作流
- [ ] 速查扩充：doc 检索工具 + 面板；官方仓库 sphinx rst 对照

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| 打包无 CLI 命令（最大不确定点） | P2 提前 spike：直接调用 renpy build API；备选封装 launcher distribute 逻辑 |
| 游戏窗口 agent 不可见 | 截图机制（config.screenshot_directory + _screenshot）；窗口留给用户观看 |
| 项目模型索引精度 | 优先复用 Ren'Py 自身 script 加载导出；自写解析只做增量 |
| 客户端无打包器/无编辑器库 | P0 编辑器加载 spike 先行；三条路径（动态 import / script 注入 / webServer 静态自托管）取可行者；备选自建轻量编辑器 |
| 沙箱/审批 | APPDATA 重定向已规避 lint 提权；打包/窗口操作如需提权走审批流 |
| 版本差异（7.x/8.x、_ren.py 新格式） | 锁定 8.5.3；检测项目 script_version |
| preset 挂载失败 | standingKeyFor 校验；服务发布遵循 isolate realm 规则 |
| DSH_HOME 写入越界 | copy() 免提权；后续写入走一次沙箱提权审批 |

## 6. 参考资源

- 官方 VSCode 扩展：https://github.com/renpy/vscode-language-renpy
- 官方引擎仓库：https://github.com/renpy/renpy
- 官方文档（本地镜像）：`renpy-8.5.3-sdk/doc/`（在线：https://renpy.org/doc/html/）
- Ren'Py CLI：https://renpy.org/doc/html/cli.html
- 社区插件清单（确认无编辑器插件）：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
- 插件注册表基建：https://github.com/vlln/plugin-registry

## 7. 备注

- 测试产物 `.renpy-user/`（token/存档/dump）位于工作区，作为重定向目录复用。
- 本计划由 DSH 会话内调研与实测支撑；P0 spike 可能修正挂载方式细节。


## 8. 侧栏美化（2026-08-14）

- RenpyPanel 内建侧栏对话/轨迹 UI 原生风格化：头像圆标（助手 AI）、角色名+首次看到时间戳、非对称圆角气泡（用户 accent 色调/助手中性色）、连续同角色消息收紧间距、胶囊页签带计数、轨迹卡片化（状态 ✓/● + 等宽名称+参数）、圆角输入框（聚焦描边+圆形发送钮）。
- host feed 增加 id 字段（消息稳定 id，chat 条目用 m.id，trail 用 m.id:blockIndex）；客户端按 id 记录首次看到时间 → 显示 HH:MM。
- 智能自动滚动：贴底或有新条目才滚底，上翻阅读不打扰。
- 冒烟测试 .preset-staging/smoke-sidebar.js：注入模拟 chat/trail 数据，renderToString 验证对话/轨迹/隐藏侧栏三分支全部通过。
- ⚠️ host.js 改动（feed id + 之前的空气泡 trim 过滤）需重启 dsh 生效；时间戳在重启前不显示（客户端优雅降级，无 id 则不显示时间）。

## 9. 滚动分离 + 全界面 DSH 原生风格（2026-08-14，client-only）

- 滚动分离：外层去掉 `minHeight:520`，改 `minHeight:0`；colL/colR/侧栏全部补 `minHeight:0` + 收缩控制，colR 加 `overflow:hidden`，侧栏加 `flexShrink:0`。文件列表、编辑器（textarea 独立滚动）、lint 面板、日志、侧栏对话各自独立滚动，不再整页一起滚。
- 原生 DSH token 化：新增 LAYER2/TXT3/GHOST(button-ghost-active-fill)/HOVER(interactive-bg-hover)/BUBBLE(specific-bubble 原生气泡浅蓝)/INPUTBG(specific-input-major)/CODEBLK(markdown-code-block)/SUCCESS/ERRCOL/BUSCOL。
- 应用点：按钮改 ghost 风格（运行按钮品牌蓝主按钮）、项目输入框 INPUTBG、文件树/导航项 hover 高亮 + 激活 GHOST、分区标题 TXT3 小字、tabBar LAYER 背景 + GHOST 激活、lint 错误 ERRCOL、日志 CODEBLK 背景、用户气泡 BUBBLE（原生气泡色）/助手 LAYER2+边框、助手头像 ACCENT、轨迹状态 SUCCESS/BUSCOL、composer INPUTBG + 聚焦 ACCENT 描边。
- 冒烟测试通过（对话/轨迹/隐藏侧栏三分支，含 hover 相关 props）。刷新客户端即生效；host.js 未动，无需重启（上轮 feed 改动仍需重启才生效）。

## 10. 滚动修复（根因确认）+ DSH 字号风格（2026-08-14，client-only）

- **根因**：宿主 active 阶段 conversation.view 的包裹容器 `.wSkVaW_viewArea` 是 `flex:1 0 auto; min-height:auto`（高度由内容决定，外层 scrollBody 统一滚动）。RenpyPanel 外层用 `height:100%` + `flex-basis:auto` 时，100% 在"高度由内容决定"的父容器中退化为 auto → 面板被内容撑开 → 整面板随 scrollBody 一起滚。
- **修复**：外层改 `flex:1 1 0`（flex-basis **0**，不依赖父容器确定高度）+ `overflow:hidden` 裁剪内容 → 面板不撑开 viewArea → 宿主不滚动，内部区域各自滚动。
- **headless Edge 真实布局验证**（.preset-staging/layout-test.html 复刻宿主结构）：旧方案 scrollBody 703>551（整页滚）、编辑器/侧栏/文件树 clientH==scrollH（都不滚）；新方案 scrollBody 551==551（宿主不滚），编辑器 754>256、日志 300>140、侧栏 480>328、文件树 504>430（全部独立滚动）。✓
- **字号适配 DSH**：根容器 `--dsw-font-family` + 13px（DSH 正文）；按钮/tab/列表/项目输入框 13px；气泡 13px/line-height 20px（DSH 正文行高）；分区标题 12px 500；次要（时间/状态/提示）11px；编辑器/日志/轨迹代码改 `--ds-font-family-code`。保留 VS Code 暗色编辑区。
- ⚠️ 需要 danger-full-access 启动 headless Edge 做布局验证（沙箱默认拦截进程启动）。

## 11. 文件/资源分区 + 资源文件夹树（2026-08-14，client-only）

- 左侧去掉"文件/资源"切换标签，改为上下两个独立滚动区（各 50%，flex:1 1 50% + minHeight:0 + overflow:auto）：上 = 文件列表 + 导航（跳转索引）；下 = 资源文件夹树。
- 资源树：`buildAssetTree` 把 host 的扁平 rel（含分类前缀，如 audio/bgm/theme.ogg）剥掉第一段构建 `{dirs, files}` 树；分类根（图片/音频/视频/字体/其他）默认展开、子目录默认折叠，▾/▸ 切换；目录行显示子文件计数，叶子行显示文件名 + 大小；图片/音频叶子点击预览（沿用 previewImg/previewAudio）；展开状态持久化到 panelState.expanded。
- 修复了 buildAssetTree 未剥分类前缀导致的 `audio/audio/bgm` 双层目录 bug。
- 验证：冒烟测试注入带子目录 assets（图片4/音频2/字体1），断言分类/子目录/展开后叶子全部渲染；headless Edge 布局验证 filePane 360>215、assetPane 552>215 独立滚动、colL 430==430 外层不滚、宿主 scrollBody 551==551 不滚。✓
- client-only，刷新客户端生效，无需重启。

## 12. 保存历史 + 回滚（2026-08-14，方案 A：落盘历史）

- **host（需重启 dsh 生效）**：`write-file` 写入前把旧版本备份到 `userDir/backups/<projectKey>/<rel>/<Date.now()>.bak`（writeText 自动递归建目录；备份失败不阻断保存）；新增 3 个 API：
  - POST `history` {project, rel} → {versions: [{time, size}]}（按时间倒序）
  - POST `history-read` {project, rel, time} → {content}（版本内容预览）
  - POST `restore` {project, rel, time} → 写回 game/rel（带会话沙箱策略）
- **client**：工具栏加"历史"按钮（有活动文件时可用）→ 弹层：左侧版本列表（时间+大小+恢复按钮）、右侧内容预览；恢复成功后强制重读文件刷新 tab 并防抖重索引。外层容器加 position:relative 承载遮罩。
- **测试**：host 全链路单测 .preset-staging/host-history-test.js（mock fs + 模拟 HTTP）：保存→备份→列表→预览→多版本→恢复→空列表 10/10 通过；冒烟测试历史弹层渲染分支全部通过。
- ⚠️ host.js 改动需重启 dsh；备份无自动清理（每文件版本会持续累积，可手动清 userDir/backups）。

## 13. 检查点 + 修改面板（类 VSCode Copilot，2026-08-14）

- **host**：检查点 = game/ 文本快照基线（`.renpy-user/checkpoints/<projectKey>/<id>/baseline/<rel>`，文本扩展名白名单、递归、排除 .rpyc）；行级 diff 用公共前后缀 + LCS（Uint32 DP，>250 万格 fallback 全量替换）；5 个 API：
  - `checkpoint-create` {project} → 快照 → {id, files}
  - `checkpoint-list` {project} → [{id, files}]（倒序）
  - `checkpoint-diff` {project, id} → {files: [{rel, added, removed, hunks, lineTypes}], summary}（含新建=全增、删除=全删）
  - `checkpoint-accept` {project, id, rel?} → 当前内容写入基线（个别/全部）
  - `checkpoint-revert` {project, id, rel?} → 基线写回文件（个别/全部）
  - lineDiff 提升为模块级导出（可单测）
- **client**：工具栏「检查点」（新建基线）+「修改 (N)」（改动数徽标，无改动置灰）按钮；修改面板弹层：检查点下拉切换（**diff/gutter 随检查点变化**）、统计（N 文件 +A -B）、文件卡片（+N -M、个别 通过/撤回）、展开 hunk 列表（L 起始行、点击跳转编辑器）、全部通过/全部撤回；面板打开时 3s 轮询 diff（agent 修改实时反映）；编辑器 gutter 修改标记**与行号同行渲染**（绿=新增 蓝=修改 红=删除，随滚动天然对齐——避免 absolute 层不随滚动错位）。
- **测试**：host 单测 .preset-staging/host-checkpoint-test.js（lineDiff 8 项 + 创建/列表/diff/新建/个别接受/个别撤回/全部撤回 20/20）；冒烟测试检查点面板 + gutter 标记渲染分支全部通过。
- ⚠️ host.js 改动需重启 dsh 生效；检查点快照无自动清理。

## 13b. 实测验证 + 发现并修复两个真实 bug（2026-08-14）

- **真实端到端实测**（the_question 项目 + 运行中 dsh 真实 HTTP）：checkpoint-create 快照 53 文件 → write-file 追加 → diff `+2 行 @L254`、lineTypes 标记正确 → revert 后文件**逐字节恢复**、diff 归零 → accept 后基线推进、文件保留修改、diff 归零 → 最终恢复原文。全链路 ✓
- **BUG 1（重要）**：`readBody` 用 `data += c` 字符串拼接 Buffer，中文多字节字符跨 chunk 边界被拆坏成乱码（英文不受影响，PowerShell 分块请求触发；浏览器小请求单 chunk 可能不触发，但大文件保存同样会中招）→ 修复为 `Buffer.concat(chunks).toString('utf8')` + 兼容字符串 chunk 防御。**此修复需重启 dsh 才生效（实测运行中进程仍是旧版）**。
- **BUG 2**：`checkpoint-list` 的 files 计数只数 baseline 第一层（显示 7，实际 53）→ 改为递归统计。
- 实测留下的检查点 `1786721893586` 保留在 `.renpy-user/checkpoints/`（用户面板可见，已 accept 归零 diff）。
- host 单测全部保持通过（checkpoint 20/20 + history 10/10）。

## 13c. 检查点改为自动建立 + 单一保留（2026-08-14）

- **需求**：检查点只在"每次对话或手动修改后"建立，且只保留最近一个（通过后即新基线，不堆积）。
- **host**：`cpCreate` 固定单一 `latest` 检查点（创建前 `Remove-Item` 清旧目录再快照）；`cpList` 只返回 latest（不存在返回 []）；修复重构引入的 `countTree` NaN bug（async 无返回值 + `+=` → undefined）。
- **client**：去掉手动「检查点」按钮、面板下拉和「新建检查点」按钮；自动触发两路（均防抖 1.5s）：
  - 手动保存（saveFile 成功）→ 自动建检查点（基线 = 保存后状态）
  - 对话结束（feed 轮询检测最后一条消息连续 3 次约 9s 未变）→ 自动建检查点（该回合修改并入基线）
- 修改面板标题改「修改（相对上次对话/保存）」，无基线时提示"发一条消息或保存一次后自动建立"。
- 测试：host 20/20 + history 10/10 保持通过；冒烟检查点面板分支更新后全部通过。
- ⚠️ 需重启 dsh 生效（host 改动）。

## 13d. 持久检查点（每个对话一个，对话界面体现，2026-08-14）

- **需求**：所有对话都需要隐藏的持久检查点用于恢复，并体现在对话界面。
- **host**：`cpCreate` 改回多检查点（id=时间戳，**全部持久保留不清理**）；`cpList` 返回全部（倒序，递归计数）。
- **client**：
  - 对话页签消息流末尾新增**检查点时间线**区块："📌 持久检查点（N）— 每次对话/保存自动建立" + 最近 3 个（时间+文件数），点击打开修改面板；feed 轮询每 3s 同步 cpList。
  - 修改面板恢复**检查点下拉**（pickCp 切换，diff/gutter 随所选检查点变化）→ 查看/恢复任意历史检查点。
  - autoCp（对话结束/手动保存触发，防抖 1.5s）创建后插入 cpList 头部并选中。
- 清理了实测遗留检查点（.renpy-user/checkpoints 清空，用户从干净状态开始）。
- 测试：host 20/20 + history 10/10 保持；冒烟新增对话页签时间线条断言全部通过。
- ⚠️ 需重启 dsh 生效（host 改动）。

## 14. 编辑器增强（P0 全套 + 下划线 + snippets + 保存回退，2026-08-14，client-only）

- **快捷键**：Ctrl+S 保存、Ctrl+F 查找/替换、Ctrl+/ 注释切换、Ctrl+Space 补全、Esc/Enter/↑↓ 补全导航。
- **查找/替换**：查找栏（Ctrl+F 展开）：匹配计数 n/m、↑↓ 导航（Enter/Shift+Enter）、替换单个/全部；编辑器 overlay 黄色高亮所有匹配（当前匹配加深），随滚动同步。
- **代码补全**：输入字母/`_`/`.` 自动弹出（Ctrl+Space 手动）；数据源 = 官方语句表（STMT_WORDS/STMT_PHRASES）+ 索引符号（标签/人物/转场/变量）+ 角色 + 资源（图片/音频）+ **代码片段 snippets**（menu/if/while/label/define/image/scene/show/play/character/transform/python/文本标签 17 个模板）；面板带类型徽标（K 语句/S 片段/A 资源/R 引用），Enter/Tab 插入并定位光标。
- **注释切换**：Ctrl+/ 对选区整行批量加/去 `#`（保留缩进）。
- **错误下划线**：lint 错误对应行在编辑器内显示红色下划线（无需打开 lint 面板），与查找高亮共用 overlay。
- **保存后回退**：saveFile 前记录快照，工具栏出现「回退保存前」按钮（撤销保存以来的编辑）。
- 验证：冒烟新增 4 项断言全过；headless Edge 真实运行时验证（Ctrl+F 开查找栏、输入触发补全面板、Ctrl+/ 无崩溃）全过。
- client-only，刷新客户端生效，无需重启。

## 14b. 修复查找高亮位置偏移（2026-08-14，client-only）

- **根因 1（横向）**：高亮 left 用硬编码字符宽 7.8px 估算；实测 Consolas/SF Mono 13px 字符宽约 **7.215px**，长行累积偏移明显（这就是"歪"）。
- **根因 2（滚动）**：overlay 内匹配块 absolute 定位不随滚动容器 scrollTop 移动（absolute 子元素不受 scroll 影响），滚动后错位。
- **修复**：① canvas `measureText` 实测代码字体字符宽（pre 挂载后 getComputedStyle 取实际字体），CJK/全角按双宽累加；② overlay 改为 **transform 平移层**——匹配块按内容坐标定位，滚动时整体 `translate(-scrollLeft, -scrollTop)` 反向平移跟随 textarea；lint 下划线同层处理。
- **headless Edge 验证**：dump 确认 40 个匹配块全部渲染，`left: 54.505 = 4 + 7×7.215`（"line 1 " 后 label）、行 10+ `61.72 = 4 + 8×7.215`、行高 19.5 递增——像素级正确。（测试页查询 0 是虚拟时间下 React 未 commit 的时序假象，dump 权威。）
- client-only，刷新客户端生效。

## 14c. 修复补全不触发（2026-08-14，client-only）

- **根因**：补全在 `keydown` 里 `setTimeout(0)` 后读 `content`（React state）——刚输入的字符还没 commit，读到旧值导致 prefix 为空/错位 → "有时不触发"。
- **修复**：触发移到 `onChange`，用**确定的新文本**（`scheduleCompletions(v)`，setTimeout 防抖合并，替代 rAF——后台/无头环境也可靠）；删除/粘贴/光标移动后也会刷新/关闭补全；Ctrl+Space 改为 `openCompletionsWith(undefined, true)`——**空前缀也显示全部**（原实现空前缀直接拒绝）。
- **headless Edge 验证**：输入 "m" 触发补全 ✓、输入 "me" 细化更新 ✓（有打开文件场景）。
- client-only，刷新客户端生效。

## 15. 未保存修改提示条（2026-08-14，client-only）

- 文件被修改（dirty）时，**编辑器下侧**（lint 面板上方）显示提示条：`📝 未保存修改 +N 行 -M 行 [保存] [撤回修改]`。
- 行数统计用**客户端行级 diff**（lineDiff 与 host 同源实现，模块级复制），对比 savedSnap（上次保存内容）与当前内容；从未保存过的文件显示"（新文件）"。
- 「保存」= saveFile；「撤回修改」= revertUnsaved（恢复到上次保存内容并清 dirty，取代原工具栏"回退保存前"按钮——已移除，功能集中到提示条）。
- 验证：冒烟测试注入 dirty tab + savedSnap（a/b/c → a/X/c/d），断言 `+2 行 -1 行` 计算正确、保存/撤回按钮渲染 ✓。
- client-only，刷新客户端生效。

## 16. 架构演进原则：所有功能最终成为 DSH 工具（2026-08-14，方向确认，暂不实施）

- **目标（用户确认）**：做出来的每个 Ren'Py 开发能力，最终都注册为 DSH 工具（agent 可直接对话调用），UI 面板与工具共享同一能力层与状态。
- **现状**：能力集中在 `renpy-client/lib/host.js`（web profile 插件，/renpy-api 路由：读写/备份/历史/检查点/diff/assets/feed）；preset 的 `renpy-host.mjs` 已有 9 个工具但**与 host.js 两份实现重复**（lint/index/run/…）；检查点与备份目录（.renpy-user）天然共享。
- **已铺路**：① 能力已在 server 侧集中（API 即能力接口）；② 共享存储（backups/checkpoints）使 UI 操作与未来工具操作同一状态；③ lineDiff 已是可复用纯函数。
- **未来工具化清单**：renpy_history / renpy_restore / renpy_checkpoint(create|diff|accept|revert) / renpy_assets / renpy_write(带备份) / renpy_editor_info 等；架构微调点为把 host.js 能力函数抽为公共模块（renpy-core），preset 工具与 client host 路由共用，消除重复。
- **暂缓原因**：先用 UI 验证功能价值与稳定性，工具化属封装层工作，待功能定型后一次性补齐。

## 17. Ren'Py 知识增强：skill 集群制作（2026-08-14，方向确认，暂不实施）

- **问题根源（用户洞察）**：Ren'Py 过于小众，模型训练语料中相关技能几乎缺失（语法/API/ATL/最佳实践均为盲区），裸模型直接写必然幻觉出错。
- **目标**：根据**官方文档（SDK doc/，Sphinx HTML 数百篇）+ 引擎源码（parser.py、renpy/common 等）**，制作**有系统的 skill 集群**，让模型在写 Ren'Py 时按需加载**长度合理、内容精确**的上下文辅助。
- **与工具验证闭环的关系**：skill 提供"少走弯路的起点"（知识），`renpy_lint`/编译/试运行提供"真实反馈校准"（验证）——两者配合，模型实际 Ren'Py 能力显著高于裸模型。
- **skill 集群划分草案**（按主题组织，各自独立、可按需加载）：
  1. `renpy-core`：核心语法速查——语句（say/menu/if/while/label/define/default/image/scene/show/play…）、缩进规则、字符串与引号、注释
  2. `renpy-text`：文本标签（{b}{i}{size}{color}{font}…）、字符串插值（[var]）、转义与换行、say/centered/right 变体
  3. `renpy-atl`：ATL 变换——transform/on/animate/parallel/choice/block、位置属性（xalign/rotate/zoom…）、动画循环
  4. `renpy-screen`：screen 语言——screen/layout/hbox/vbox/text/button/imagebutton、显示与隐藏（show screen/call screen）
  5. `renpy-api`：常用 API——Character、renpy.*（say/notify/url/…）、ui.*、持久化（persistent）、存档/读档钩子
  6. `renpy-l10n`：本地化/翻译工作流——translate 语句、提取（extract_strings）、合并（merge_strings）、语言切换
  7. `renpy-practices`：最佳实践与常见坑——角色/标签/变量组织、图片路径与缓存、ATL 常见错误、7.x/8.x 差异、性能注意
  8. `renpy-ref`：文档索引——每个主题映射到 SDK doc 对应页（atl.html、text.html、screens.html…），供深挖
- **内容规范（长度合理、内容精确）**：
  - 每条知识点短小（速查条目，非长篇教程），单 skill 控制载入 token 规模
  - 内容从**官方文档原文 + 引擎源码逐条核验**（不靠模型记忆），标注来源文档页
  - 配套**最小可运行示例**（可 lint/编译通过），避免错误示范
- **制作流程**：从 SDK doc HTML 提炼 → 与源码（parser.py @statement 表、renpy/common 注册语句）交叉核验 → 示例进 scaffold 项目验证 → 沉淀为 preset 挂载的 skill 文件。
- **暂缓**：先完成社区测试验证功能价值，再按测试反馈定制 skill 内容优先级。

## 18. 工作区域系统（2026-08-14）

- **需求（用户定义）**：指定会话工作区域 → 锁定编辑器特定范围 → 对话自动施加限定，让 agent 知道当前工作区域（Ren'Py 顺序执行，改代码须聚焦正确的执行片段）。
- **host（需重启生效）**：`workspace-set/get/clear` API，存 `userDir/workspace/<projectKey>.json`；设置/解除时 **`session.append('user/message', msg, {surfaceOp:'append'})` 注入模型可见面**（source=plugin, form=instructions），文本含文件/行范围/"Ren'Py 脚本按顺序执行，修改限定在区域内"说明。
- **client**：工具栏「🔒 锁定」（编辑器选中范围/光标行 → 工作区域）+「解除锁定」；编辑器下侧工作区条（`🔒 工作区域 file Lx-y — 区域外只读，已通知 agent` + 解除）；overlay 绿色区域标记（transform 层，随滚动对齐）；**区域外编辑拦截**（onChange 按光标行判断，越界拒绝并恢复旧内容）。
- **锁定判定**：`wsChangeInRange` 模块级纯函数，按**编辑光标所在行** ∈ 区域允许（区域内插入/追加产生的行位移随之扩展；纯文本 diff 无法定位"在行尾插入"类操作，故用光标）。
- **测试**：host 单测 11/11（存取/注入 surfaceOp/form/文本/解除）；wsChangeInRange 单测 10/10（区域内/外/首部/末尾/插入/追加边界）；冒烟工作区条/按钮断言全过。
- ⚠️ host.js 改动需重启 dsh 生效。

## 18b. 提高工作区域思考权重 + 越界主动询问（2026-08-14）

- 注入文本升级为 **【工作区域｜高优先级约束】**：明确"必须遵守的高优先级指示""Ren'Py 顺序执行、越界破坏执行上下文""用户需求需要改区域外时先说明并征得同意，不要擅自越界"；解除文本改【工作区域｜已解除】"以新的为准"。
- **preset persona 增加常驻「工作区域规则」**（高优先级）：出现【工作区域】标记即硬性约束、修改限定在区域内、越界先征得同意、解除后以新指示为准——模型对所有工作区域指示有准备，权重提升。
- 测试：host 单测更新为 13/13（新增"高优先级""征得同意"断言）。
- ⚠️ host.js 改动需重启 dsh；preset persona 改动需重启 dsh 后新会话生效。

## 18c. 编辑器与对话解绑 + 不污染 Ren'Py 项目（2026-08-14）

- **约束（用户确认）**：工作区域文件不写入 Ren'Py 项目目录（AGENTS.md / .dsh/ 都不碰），项目零痕迹。
- **方案**：工作区域仍存项目外 `.renpy-user/workspace/<projectKey>.json`；**跨会话注入由客户端负责**——任何会话打开 renpy 面板加载项目时，若项目有工作区域且该会话未注入过（localStorage 按 会话+项目+版本 去重），自动调 `workspace-inject` 注入到当前会话。
- **host**：新增 `workspace-inject` API（读项目工作区域 → append 到指定会话，不写文件不改存储；无工作区域返回 injected=false 幂等）。
- **效果**：换会话/新开会话 → 加载项目即自动获得工作区域（解绑"设置时的会话"）；工作区域更新 → 版本变 → 重新注入。
- **测试**：host 单测扩展至 18/18（inject 到指定会话/内容/不改存储/清除后幂等）；冒烟回归全过。
- ⚠️ host.js 改动需重启 dsh 生效。

## 18d. 延迟注入：新会话不主动发初始信息，首条对话时注入（2026-08-14）

- **需求（用户确认）**：新建会话不自动发送工作区域信息（对话干净、可先手动用编辑器）；**发送第一条对话时**自动注入工作区域约束。
- **改动（client-only）**：加载项目 effect 只恢复 wsLock UI + 计算"待注入"（pendingWsInjectRef：项目有工作区域且 localStorage 版本不匹配）；不再自动调 workspace-inject。`sendMsg`（面板 composer）发送时若 pending → 先 `workspace-inject`（成功后记 localStorage 版本）→ 再发送用户消息；注入失败不阻塞发送。
- **局限**：触发点绑定 renpy 面板 composer；用 DSH 原生输入框发消息不触发注入（工作区域约束只对面板发送的对话生效）。
- 冒烟回归全过；host 无需改动（workspace-inject 已就绪）。

## 18e. 注入兜底：无论消息从哪发都注入（2026-08-14，client-only）

- **需求**：上一版的局限不可接受——用户用 DSH 原生输入框（面板外）发消息时工作区域不注入，需要兜底。
- **兜底**：feed 轮询不再以侧栏开关为条件（面板存在、有 project 即每 3s 轮询）；轮询时若 pendingWsInjectRef 且会话出现**新的用户消息**（chat 中最后一条 user 消息变化，来自任何输入来源）→ 自动 workspace-inject 并记版本。与 sendMsg（composer 路径）双保险：composer 发送走快速注入，原生输入框发送走轮询兜底（最多 3s 延迟）。
- **修正**：`detectTurnEnd` 只对**最后一条 assistant** 计稳定——注入的工作区域消息（user 角色）不再误触发自动检查点。
- 冒烟回归全过。

## 19. 侧栏对话复刻原生机制 + 原生对话可行性结论（2026-08-14，client-only）

- **"能否用原生对话"最终结论（否，架构限制）**：① conversation.session 单 slot 系统已占 priority 0，shadow 注册可行但 renderSlot 只给声明 children 的 occupant 传 props、重复声明 conversation.view 抛错（两次实测坏客户端）；② 原生对话组件（ChatView/ConversationSession）需要应用注入的 context（renderSlot/useSession/useInput），slot occupant 拿不到；③ InputActions 只有 setDraft/submit，无 stop。
- **复刻的原生机制**：
  - **轻量 Markdown 渲染**（对齐 AssistantMarkdown）：助手消息渲染代码块（```，`--dsw-alias-markdown-code-block` 背景+代码字体）/行内代码/粗体/斜体/列表/引用/链接——先整体 esc 再插入白名单标签，防 XSS；用户消息保持纯文本。
  - **消息操作**（对齐 MessageIconActions）：hover 显示「⧉ 复制」（clipboard API + execCommand fallback）。
  - **时钟**（对齐原生时钟）：同日 HH:mm、跨日 M-D HH:mm（fmtClock 替代 fmtTime）。
- **无法复刻**：停止生成（面板无 stop 接口）、分支/fork（无会话 fork API）、运行时长/TTFT/吞吐（feed 无 turn 指标）。
- 验证：冒烟新增 markdown 粗体/行内代码断言；全部通过。
- client-only，刷新客户端生效。

## 19b. 思考标记（reasoning 显示，2026-08-14）

- **host feed**：提取 ContentBlock 的 `reasoning` 块（ReasoningBlock）→ chat 条目加 `r: 1/0`（有思考）+ `rText`（推理文本截断 600）。
- **client**：带思考的助手消息在气泡上方显示「🤔 思考 ▸」标签（点击展开/收起），展开显示斜体推理文本块（最大高 160 滚动）。
- **测试**：host feed 单测 6/6（reasoning 提取/rText/正文不含推理/用户无标记/工具调用 trail）；冒烟思考标签断言通过。
- ⚠️ host.js 改动需重启 dsh 生效；client 刷新即可。

## 19c. 去长消息截断 + 轨迹编辑列表与跳转（2026-08-14）

- **去截断**：host feed 移除 `text.slice(0, 400)`——助手/用户消息全文传输与显示（rText 仍截断 600 作推理预览）。
- **编辑操作列表**：host feed 的 trail 条目增强——编辑类工具（edit/write）解析 `kind`（edit/write）与 `file`（args 的 file_path/path），args 截断 80→300；客户端轨迹页签中编辑条目显示「✎ 文件名」（accent 色、可点击），其他工具保持原名。
- **编辑详情跳转编辑器（左侧）**：`jumpTrailEdit`——点击编辑条目 → 打开对应文件（openFile）+ 定位：edit 类解析 args 的 old_string，在文件内容中搜索其首行位置 → jumpToLine；write/找不到 → 跳到文件首行。
- **测试**：host feed 单测 7/7（新增 kind=edit 与 file 提取）；冒烟轨迹编辑条目 ✎/文件断言通过。
- ⚠️ host.js 改动需重启 dsh 生效；client 刷新即可。

## 19d. 编辑并重发 + 常见 agent 功能差距分析（2026-08-14）

- **编辑并重发**（client）：用户消息 hover 显示「✎ 编辑」→ `inputActions.setDraft(文本)`（同步到**原生 composer 草稿**）+ 填充面板输入框并聚焦 → 修改后 Enter 重发（原消息保留历史，作为新消息发出）。冒烟断言通过。
- **"能否加入原生对话"结论**：DSH 原生对话本身无"编辑历史消息"（会话日志 append-only 不可变）；本实现通过 setDraft 与原生 composer 联动（原生输入框也能看到并改）——已是贴近原生的能力，且不违反日志不可变。
- **常见 agent 缺失差距分析**：
  - 低成本可做：↑ 键编辑上一条（composer）、代码块一键复制（mdToHtml 重构为 React 元素树以绑事件）、消息反馈 👍👎（DSH 有 dsh-message-feedback 服务，需查接入 API）
  - 中成本：流式输出（host 流式 API + 增量渲染）
  - **架构不可行（面板无公共接口）**：停止生成（InputActions 仅 setDraft/submit）、重新生成（需 agent 回合重跑）、附件/图片上传（需附件服务 id）、模型选择器、token/上下文窗口（原生 token meter）
- 冒烟回归全过。

## 20. 编辑器类 VSCode 改造（布局骨架，2026-08-14，client-only）

- **目标**：面板重构为类 VSCode 布局与观感（功能 UI 全面优化）。
- **第一批（已完成）**：
  - **活动栏**（最左图标竖栏 42px）：📄 文件 / 🖼 资源 / ✎ 修改 三视图切换，激活高亮；侧栏从"上下分区"改为**单视图**（文件+导航 / 资源树 / 修改简表）。
  - **顶栏图标化**：文字按钮 → 紧凑图标按钮（⟳ ⚠ ▶ ■ 📷 💾 🎯 ✖ 🕘 ✎），悬停 title 提示，项目输入框保留；修改按钮带改动数徽标。
  - **状态栏**（底部）：文件名 | 行/列（光标追踪 onSelect/onKeyUp/onClick）| 保存态（● 未保存 / ✓）| .rpy。
- **验证**：冒烟全过；headless Edge 真实渲染：活动栏/状态栏/编辑器/视图切换（点击 🖼 → 资源视图）全部工作。
- **第二批（待做）**：编辑器内部增强——当前行高亮、缩进线、自动缩进（回车跟随）、括号匹配。
- client-only，刷新客户端生效。

## 20b. 素材预览改右下角浮窗（2026-08-14，client-only）

- 素材预览从编辑器区域底部（常驻占用）改为**右下角浮窗**（absolute，状态栏上方）：点击资源树图片/音频弹出 320px 卡片（路径 + 图片/音频播放器 + ✕ 关闭），不再占布局。
- **修坑**：状态栏/浮窗此前两次 edit 误插入 SessionLayout（实验性应用级布局函数，默认不渲染）导致 RenpyPanel 里没有——已还原 SessionLayout 并把两者正确插入 RenpyPanel return 末尾；同时修复一次 edit 误删 `function apply(ctx)` 声明。
- 验证：独立渲染脚本确认浮窗（关闭按钮/图片 URL）渲染；冒烟浮窗/路径/旧文本移除断言全过。
- client-only，刷新客户端生效。

## 20c. 素材预览浮窗可拖动（2026-08-14，client-only）

- 浮窗头部作为**拖动手柄**（cursor grab）：mousedown 记录起点（相对面板 rootRef 换算）→ document mousemove 实时更新 left/top → mouseup 结束；未拖动时保持右下角 right/bottom 定位，拖动后切换 left/top（floatPos state）。
- 验证：headless Edge 真实拖动测试（mousedown+mousemove → 浮窗 style 出现 left/top）通过；冒烟回归全过。
- client-only，刷新客户端生效。

## 20d. 浮窗初始位置修正（2026-08-14，client-only）

- **问题**：浮窗初始用 `right:14` 相对整个面板 → 落在对话侧栏上方（面板最右）。
- **修复**：首次显示时测量**编辑器区域（colR）**位置，初始定位到编辑器右下角（`x = clamp(colR.left+4, colR.right-334)`，窄区域贴左缘）；拖动后仍可自由移动。
- 验证：headless Edge 复验浮窗初始 x 从面板最右移至编辑器区域左缘（246 ≥ 编辑器左 242）✓。
- client-only，刷新客户端生效。

## 20e. 顶栏图标+文字 + 工作范围强调按钮（2026-08-14，client-only）

- **工作范围强调**：🎯 单独放大（大号图标 + "工作范围"文字 + 蓝色边框/底/阴影，置顶栏醒目位置）；锁定后出现"✖ 清除"按钮。
- **所有图标加简短文字**：加载/检查/运行/停止/截图/保存/历史/修改 全部改为"图标 + 文字"组合按钮（iconBtnText），顶栏允许换行。
- 验证：冒烟更新断言（🎯按钮/工作范围条/图标文字按钮）全过。
- client-only，刷新客户端生效。

## 20f. 左半侧栏观感升级（2026-08-14，client-only）

- **活动栏**：加**激活指示条**（左侧 2px accent 竖条，VSCode 式），图标 hover 圆角块。
- **视图头**：每个视图顶部固定标题栏（📄 文件 (N) / 🖼 资源 (N) / ✎ 修改 (N) + 右侧操作：刷新 ⟳、折叠全部、打开面板 ↗），内容区独立滚动。
- **文件树化**（资源管理器风格）：game/ 下 rpy 按目录构建 `buildFileTree` 树，📁 目录（可折叠，计数）/📄 文件（basename），缩进层级、激活高亮。
- **资源分类图标**：🖼 图片 / 🎵 音频 / 🎬 视频 / 🔤 字体 / 📦 其他。
- **导航类型图标**：🏷 标签 / 👤 人物 / 🔄 转场 / 📦 变量，行尾 @行号。
- 验证：冒烟重构为视图切换断言（files 视图文件树/导航、assets 视图资源树/展开叶子）全过。
- client-only，刷新客户端生效。

## 21. Ren'Py 语句↔Python 等价映射：混合流程构建（2026-08-14）

- **目标（用户）**：skill 的 renpy 特有层支持"Ren'Py 命令 ↔ Python 语句等效转换"——模型用 Python 心智理解/编写 Ren'Py；且**映射骨架不靠 AI 记忆，从源码程序化提取**。
- **混合流程（已验证三步全通）**：
  1. **无 AI 提取**（extract-ast-map.js）：扫 renpy/ast.py 语句类（25 个）→ 每类提取属性、statement_name 分发名、execute 体中 renpy.* 调用与内部函数 → `ast-statement-map.json`；再渲染成 `renpy-statement-map.md` 初稿（语句/类/属性/API 表）。
  2. **AI 解读 + 源码核验**（renpy-core-draft.md）：核心语句语义映射（say/label/jump/call/return/show/scene/hide/with/menu/python/define/default/image/transform/if/while），每条含 Ren'Py 语法 / Python 等价 / 语义 / 注意 / 源码依据；内部函数→公开 API 链核验（show_imspec→config.show→renpy.show）。
  3. **引擎验证**（eq-test 临时项目 lint）：Python 等价形式全部通过——`renpy.say(e/None,...)`、`renpy.scene()+renpy.show()`、`renpy.with_statement(fade)`、`renpy.menu([...])`、`renpy.jump()` 语义正确（lint exit=0）。
- **关键结论**：Ren'Py = Python 超集；Python 层模型本就会，skill 只补特有层（语句 DSL 语义 + 等价映射 + 约定）；映射骨架可脚本化（准确零幻觉），语义层需 AI 解读但逐条源码核验。
- **产物**：.preset-staging/ast-statement-map.json / renpy-statement-map.md / renpy-core-draft.md / eq-test（验证项目）。

## 21b. 编辑器集成：语句→Python 等价转换浮窗（2026-08-14，client-only）

- **工具栏「⇄ Python」按钮**：把光标所在 Ren'Py 语句实时转换为 Python 等价，右下角浮窗显示（Ren'Py 原文蓝 / Python 等价紫 / 💡 语义说明 / 行号 / ✕ 关闭）。
- **映射**：模块级 `renpyToPython(line)` 纯函数（源码核验，PLAN §21）——say（角色/旁白）、jump/call（含参数去括号）/return、scene/show(at)/hide、with、define/default/image、if/while/$、menu；无法识别返回 null（日志提示）。
- **测试**：renpyToPython 单测 15/15（含 call 带参、define、if、null 边界）；冒烟回归全过。
- client-only，刷新客户端生效。

## 21c. 「剧本 → 可运行代码」策略入 skill（2026-08-15，skill 更新）

- **背景（用户）**：用带**模糊演出指示**的 500 字剧本测试"直接写成可运行代码"——缺资源用占位符，策略沉淀为核心 skill。
- **已写入 renpy-core.md** 新节「从剧本到可运行代码（模糊演出指示消解）」：
  - **Solid 占位**：未提供的图像用 `Solid("#hex")` 色块 + TODO 标注，不凭空造素材。
  - **音频缺失注释**：音频缺失**不硬写** play 语句，注释说明待补（避免 lint/运行报错）。
  - **演出→语句映射**：模糊指示映射到 show/scene/with/transform 等具体语句。
  - **创作决策合理默认**：未指定角色名/转场时长等做合理默认并在交付说明中列出假设。
  - **lint 验证**：完成后 `renpy_lint` 验证 exit=0（demo-script 实测 11 对话块/1 menu/4 占位图像全过）。
- 验证：frontmatter 完整（name: renpy-core）、新节存在、94 行。
- 生效：skill 文件即时可读，新会话组合加载后模型按 description 触发。

## 21d. renpy-text skill 完成（2026-08-15，混合流程首战）

- **范围**（§17 草案）：文本标签、字符串插值、转义与换行、say/centered/right 变体。
- **① 程序化提取**：extract-text-docs.js 处理 Sphinx 8 的 `<section id>` + `<dl>` 定义列表结构（含 `<dt class>` 属性坑，首个版本 dl 全 0 → 修 `<dt[^>]*>`）→ text-doc-extract.json（text 18 节 / dialogue 9 节 / custom_text_tags 2 节）+ preview 渲染。
- **② AI 解读 + 源码核验**：
  - substitutions.py：`flags=frozenset("rstiqulc!")`、f-string 风格 parse、`[expr=]`→repr、convert 逐 flag（q 只加倍 `{`）、格式符透传 `format()`。
  - text.py：Text.parse 标签分发全表核验（b/i/u/s/plain/=style/font/size/color/alpha/k/cps/a/space/vspace/w/p/nw/fast/done/rt/rb/art/alt/noalt/vert/horiz/axis:/feature:/#忽略/未知标签报错）；自定义标签 `config.custom_text_tags` / `self_closing_custom_text_tags`。
  - ast.py Say.execute：who 快路径/表达式、`(args)`→renpy.exports.say、nointeract、with 转场。
  - character.py + 00library.rpy：adv/nvl/narrator/name_only/centered/vcentered/extend（extend=`_last_say_what+{fast}+新文本` 合并参数）。
  - lexer.py string()：`\{`→`{{`、`\[`→`[[`、`\%`→`%%`、`\n`、`\uXXXX`、其他原样、空白折叠、raw 不处理。
- **③ 引擎验证（verify-text.py，SDK 内置 py3.12 无头跑）**：`renpy.import_all()` + game.script 最小桩 → **83/83 全过**：插值（变量/表达式/格式/flags/递归/缺变量）、46 标签分词、8 自闭合、lexer 转义 11 项、tokenize `{{`/`{{tag}` 字面、自定义标签配对。
- **实测修正的文档误解**：`{{tag}}` 显示为 `{tag}}`（`{{`→`{`，`}}` 不折叠）→ 字面 `{tag}` 应写 `{{tag}`；`\}`/`\]` 只转单字符；`\ ` 额外空格实测是 `"a \ b"`→两个空格（`a\  b` 仍折叠）；`!q` 只加倍左花括号。
- **产物**：`~/.dsh/skills/renpy-text.md`（156 行，frontmatter name/description，三层管线/say 变体/Character/插值 flag 表/通用+对话标签表/转义实测表/窗口管理/最小示例，逐条标来源与核验）；技能目录已识别。
- **流程沉淀**：doc HTML（Sphinx 8 `<section>`+`<dl>`）提取脚本可复用于 renpy-atl/screen/api/l10n。

## 21e. 编辑器文本样式预览（2026-08-15，client-only，skill 知识驱动）

- **背景（用户）**：验证 renpy-text skill 知识能否直接支撑编辑器预览文本样式；**降级必须带提示**。
- **解析器**：模块级纯函数 `renpyTextPreview(line)`（renpy-text skill 知识实现）：
  - 语句识别：`角色 "…"` / `"旁白"`（支持 r 前缀与 `(args)` 尾巴）
  - ① lexer 层：空白折叠 + 转义（`\{`→`{{`、`\[`→`[[`、`\%`→`%%`、`\n`、`\uXXXX`，对齐 lexer.py）
  - ② 插值层：`[expr]` 括号/引号/嵌套方括号计数（对齐 substitutions.parse），`[[` 字面
  - ③ 标签层：成对标签样式栈（b/i/u/s/plain/size/color/alpha/font/k/a/rt/rb/art/alt/=style…）+ 自闭合（w/p/nw/fast/done/space/vspace/image/clear/#）→ 扁平样式树（{t,s,style}）
  - **降级 notes**：interp（运行时求值占位）/font/image/=style/ruby/cps/outlinecolor/vert/shader/feature/未知标签/不匹配关闭/无效颜色——每条都有黄色提示
- **引擎实测修正**：现代 Ren'Py `%` 不需要转义——`50%`→`50%`、`100%%`→`100%%`、`\%`→`%%`；doc 的"%% → %"是 old_substitutions 旧语法（ast.py 1885 仅旧配置下 menu caption 生效）
- **测试**：test-renpy-text-preview.js **46/46**（嵌套回溯/转义/raw/降级 kinds）；renpy2py 15/15 回归；冒烟新增预览分支全 true + 既有分支无回归。
- **UI**：工具栏「Aa 预览」按钮 → 浮窗（right:14 bottom:34 zIndex:55）：标题含角色/行号，预览块渲染样式树（基线字号 22×0.72 缩放），降级区黄色 ⚠ 列表，err 红色删除线标记，对话标签显示 ⏸/↷/⚡/✂ 控制标记。
- client-only，刷新客户端生效。

## 21f. 样式预览升级：所见即所得内联模式（2026-08-15，client-only）

- **需求（用户）**：点「Aa 预览」后，编辑器里 say 文本**直接显示为相应样式**（不再浮窗）。
- **方案**：toggle 内联预览模式——高亮 pre 层对 say 语句行走 `sayStyledHtml(trimmed)` 富文本渲染（renpyTextPreview 样式树 → 行内 span HTML），角色名/引号保留语法色，`with 转场` 等尾部原样。
- **行高不变原则**（关键技术约束）：pre 与 textarea 逐行对齐（lineHeight 1.5 × 13px = 19.5px），任何改变行高的样式会错位——因此**字号/字体用"底色标记 + 悬停 title"**（如黄底 title="字号 32"），粗/斜/下/删/色/透明/字距/超链接等行内安全样式真实渲染。
- **降级提示条**：预览模式时编辑器顶部横条——全文件 say 行解析汇总 notes 去重，黄色「⚠ 样式预览降级提示」+ 最多 6 条 + 计数；无降级则蓝色「✓ 样式预览模式」。插值紫色占位、对话标签 ⏸/↷/⚡/✂ 标记、未知标签红底删除线。
- **浮窗移除**：previewCurrentLine / textPrev / renderPrevNode / 浮窗 JSX 全部删除（入口由内联模式取代）。
- **验证**：语法 OK；冒烟内联分支（模式条/粗体/颜色/插值占位/等待标记/降级提示/角色名保色）全 true + 既有分支无回归；renpyTextPreview 46/46、renpy2py 15/15。
- client-only，刷新客户端生效。

## 21g. 字体管理（2026-08-15，client-only，{font} 预览的地基）

- **需求（用户）**：字体先做好管理，入口与导航 4 标签（标签/人物/转场/变量）**并列第 5 个「🔤 字体」**。
- **字体导航标签**：navKind 加 "fonts"；列表 = assets.font（🔤 + 文件名 + 大小，点击打开预览）；空态提示"放 .ttf/.otf 到 game/ 后点 ⟳ 加载"。
- **字体预览浮窗**：复用素材浮窗（floatPos 可拖），点字体项打开——FontFace 动态加载真实字体 → 三行示例文本（中英数字）以该字体渲染 + 引擎用法说明（{font=相对路径}）。
- **{font} 内联预览三态**（sayStyledHtml + fontMap + loadedFontsRef）：
  - 存在 + 已加载 → `font-family` 真实渲染（无标记）
  - 存在 + 加载中 → 蓝底标记 title"加载中…"（fontsNeeded useEffect 后台加载，完成 setFontTick 触发重渲染自动变真实字体）
  - 不存在 → 红底标记 title"字体文件不存在"
- **提示条联动**：previewNotes 里 font 类 note 按 fontMap 改写——命中则移除（真实渲染不再降级），未命中改"字体文件不存在于项目"。
- **测试资产**：Roboto-Light.ttf（SDK launcher 自带）复制到 demo-script/game/fonts/；text_style_test.rpy 加 L11 `{font=fonts/Roboto-Light.ttf}`；lint exit=0。
- **验证**：语法 OK；冒烟字体分支（第5标签/列表/浮窗示例文本/引擎用法/大小）+ {font} 三态断言全 true；46/46、15/15 回归。
- client-only，刷新客户端生效。

## 21h. 字号真实预览 + 打字动画预览（2026-08-15，client-only）

- **需求（用户）**：① {size} 大小能否真实预览；② 出字速度/间隔（{cps}/{w}/{p}）能否预览。
- **① 字号真实渲染——预览模式行高放大**：`LINE_H` 改为函数（预览 34px / 普通 19.5px），pre/textarea/gutter 三处 line-height 同步放大（ED_LH），gutter 行号/查找高亮/lint 线/工作区条全部改 `LINE_H()` 动态计算 → 字号真实渲染（0.75 缩放：引擎 22px 基线 → 预览 16.5px，{size=+10}→24px 等）不再黄底标记，也不与相邻行重叠。
- **② 打字动画预览**：`renpyTextPreview` 的 cps 进入样式树（{cps=40}→style.cps=40、{cps=*2}→20×2=40，note 改"预览模式下点击该行可播放"）；预览模式下**点击编辑器 say 行**（onEditorMouseUp 非 Ctrl）→ 右下角浮窗逐字播放：text 段按 cps（默认 20 字/秒）、pause 段按 {w=}/{p=} 秒数（无参数 0.5s）、interp/space/image 直接显示；▶ 重播、✕ 关闭、点击其他行切换；说明条列出标签语义。
- **播放器**：useEffect + setTimeout 链（text 段 1000/cps ms/字、pause 段秒数、其余 30ms），animProg {ni,ci} 驱动节点部分渲染（playNodeEl 复用样式映射 + 截断）。
- **TDZ 修复**：animData useMemo 误放 animLine 声明前（依赖数组立即求值报错）→ 移到 animLine 定义后。
- **验证**：单测 48/48（+cps 绝对/倍数进样式 2 条）；冒烟新增字号 font-size:24px、行高 34px、动画条（标题/速度40/重播/说明/完成态）全 true；15/15 回归。
- client-only，刷新客户端生效。

## 21i. 动画默认速度读取项目配置（2026-08-15，client-only）

- **需求（用户）**：预览的默认速度是否读取了项目配置？（此前硬编码 20 字/秒）
- **引擎源码核验**：`text_cps` 是**玩家偏好**（preferences.py，运行时设置，编辑器读不到）；项目可配置的默认速度是**样式属性** `slow_cps` / `slow_cps_multiplier`（00style.rpy 默认 None/1.0，text.py 760-763：slow_cps 数值→直接用，None/True→玩家偏好，再乘 multiplier）；Character 支持 `what_<样式属性>` 参数（tutorial: `what_slow_cps=20`）。
- **实现**：模块级纯函数 `parseTextCfg(files)` 扫描项目全部 .rpy（list-files→read-file，缓存按 project）：
  - `define X = Character(what_slow_cps=N, what_style="…", what_slow_cps_multiplier=N)` → 角色级
  - `style 名字: slow_cps N / slow_cps_multiplier N` 块（行首缩进匹配、排除注释行、到空行/下条语句/文件尾）
  - `globalCps = say_dialogue 的 slow_cps × multiplier`
- **优先级**：{cps=} 标签 > 角色 what_slow_cps > 角色 what_style 样式 > say_dialogue > 20（引擎无配置时依赖玩家偏好，预览取 20 并标注）。
- **动画条标题**显示速度 + 来源：「标签 {cps}」/「项目配置」/「默认 20」。
- **测试资产**：demo-script/game/text_speed_cfg.rpy 加 `style say_dialogue: slow_cps 30`（lint exit=0）→ 刷新后动画预览默认 30 字/秒。
- **验证**：parseTextCfg 单测 9/9（无配置/角色参数/样式块/multiplier 乘法/多文件合并/注释不误匹配）；冒烟 + 48/48 回归全过。
- client-only，刷新客户端生效。

## 21j. 外部修改自动同步（2026-08-15，client-only）

- **需求（用户）**：agent 改了磁盘文件，编辑器标签还是旧内容（"改哪去了/编辑器这样不行"）——标签是打开时快照，不感知磁盘变化。
- **实现**：`tabsRef` 镜像 + 5s 轮询（useEffect [project]，打开项目立即同步一次）：逐标签 read-file 比较磁盘 vs 标签内容：
  - 无未保存修改且不同 → 自动重载内容 + 日志「⟳ 已同步外部修改」
  - 有未保存修改 → **不覆盖**，提示「⚠ 外部修改冲突…保留本地；关闭标签重开可加载外部版本」（conflictRef 去重，只提示一次）
  - 冲突过的文件不再自动覆盖（防丢本地保存），关闭标签时清除冲突标记
- **验证**：语法 OK；冒烟 SMOKE PASS + 48/48 回归。
- client-only，刷新客户端生效。

## 21k. 编辑器第二批：当前行高亮/缩进线/自动缩进/括号匹配（2026-08-15，client-only）

- **需求（用户）**：处理 PLAN §20 编辑器待做四项。
- **① 当前行高亮**：overlay 层光标行整行浅背景（rgba(255,255,255,.035)），top/height 用 LINE_H()（预览模式自适应）。
- **② 缩进线**：`indentGuides` useMemo 按行缩进档位（4 空格一档，tab 展开 4）聚合 {x → first/last 行} → overlay 垂直虚线（rgba(255,255,255,.07)），x = 档位×CHAR_W。
- **③ 自动缩进（回车跟随）**：`nextIndent(line)` 纯函数——继承行首缩进，行尾 `:`（Ren'Py 块开）再 +4；onKeyDown Enter 分支（补全列表打开时除外）preventDefault + 插入 `\n` + 缩进 + 光标定位（选区替换兼容）。
- **④ 括号匹配**：`findMatchingBracket(text, pos)` 纯函数——pos 或 pos-1 是括号则同类型计数配对（开括号向后/闭括号向前，嵌套计数），返回 {open, close} 位置；trackCursor 里更新 bracketMatch state → bracketRects（textWidth 算列宽）→ overlay 两处金色块（rgba(229,192,123,.45)）。
- **TDZ 修复×2**：indentGuides 依赖数组引用后定义的 stylePreview → 移到 ED_LH 定义后（stylePreview 之后）。
- **验证**：test-editor-second.js **15/15**（括号配对/嵌套/光标偏移/未闭合/悬空 + 自动缩进继承/+4/注释行不算）；冒烟新增缩进线/当前行/括号高亮断言全 true；48/48、15/15、9/9 回归。
- client-only，刷新客户端生效。

## 21l. 编辑器括号增强：自动补全/右括号跳过/成对删除/匹配跳转（2026-08-15，client-only）

- **延续（用户"继续"）**：括号匹配的自然延伸。
- **① 自动补全**：输入 `(`/`[`/`{`（无选区）自动补配对右括号，光标落中间。
- **② 右括号跳过**：光标后已是配对右括号 → 直接跳过（不重复输入）。
- **③ 成对删除**：Backspace 删开括号时若紧跟配对闭括号 → 一次删一对。
- **④ 匹配跳转**：`bracketJumpTarget(bm, pos)` 纯函数（开括号处 → 闭括号+1，反之亦然）；Ctrl+Shift+\ 跳转（ta.setSelectionRange + trackCursor 刷新高亮 + 日志）。
- **验证**：test-editor-second.js **21/21**（+跳转 6 条：开/闭/偏移/悬空/无匹配）；冒烟 SMOKE PASS。
- client-only，刷新客户端生效。

## 21m. renpy-atl skill 完成（2026-08-15，混合流程第二战）

- **范围**（§17 草案 + 评估确认）：ATL 语句速查、transform 定义/使用、常用属性、内置 transform、warpers、坑、最小示例；matrixcolor/3D/Camera 明确暂不做。
- **① 程序化提取**：extract-atl-docs.js（复用 Sphinx 8 提取器）→ atl-doc-extract.json：transforms 31 节（全部 ATL 语句节）+ transform_properties 12 节 + transitions 8 节。
- **② 源码核验**：
  - atl.py：RawStatement 13 语句类 execute 语义（Parallel 各分支独立时间线 pause 取 min、Choice 加权随机 random.uniform、Repeat 循环 action、Transform 语句 → ATLTransform(parameters) → store 命名空间）
  - warpers 全表在 **000atl.rpy**（56 个 @renpy.atl_warper：linear/ease/easein/easeout + quad/cubic/quart/quint/expo/circ/back/elastic/bounce 三态，Robert Penner 公式）
  - transform_properties：定位/锚点/中心/缩放/旋转/像素/裁剪/极坐标/分层全表（含 fit 五值）
  - 表达式求值时机（transform 首次执行时）、on 不阻塞、repeat 卡后续等坑逐条核验
- **③ 引擎验证**：demo-script/game/atl_test.rpy 覆盖全部语句（transform 带参/插值+warp 自定义/parallel/choice/on/animation/contains/displayable 切换/function/time/event）→ **lint exit=0**。
- **产物**：`~/.dsh/skills/renpy-atl.md`（209 行，frontmatter 完整，技能目录已识别）；§17 集群进度 3/8（core/text/atl）。
- **流程复用**：提取/核验/lint 验证流水线第三次跑通，renpy-screen 直接套用。

## 21n. matrixcolor 研究（2026-08-15，评估时标注"暂不做"→ 用户要求研究）

- **来源**：matrixcolor.html（49KB，4 节）+ **00matrixcolor.rpy**（DSL 全定义）+ im.py（MatrixColor 图像类）+ matrix_functions.pxi（3D 矩阵，非颜色）。
- **核验结论**：
  - matrixcolor 是 transform 属性，值 = 手写 `Matrix([16 个数])`（4×4，预乘 alpha，通道可交叉）或 ColorMatrix 表达式。
  - 9+2 内置 ColorMatrix 全在 00matrixcolor.rpy（Brightness/Contrast/Saturation/Tint/Hue/Invert/Opacity/Colorize/Sepia/Identity/Spline），数学逐类核验（Saturation 的 desat NTSC 亮度权重、Tint 预乘 alpha 对角阵）。
  - 插值动画机制 = ColorMatrix.__call__(other, done)（done 0→1 渐变）；`*` 乘法组合（右侧先应用）。
- **引擎验证**：demo-script/game/matrixcolor_demo.rpy 覆盖手写矩阵/9 种类/插值动画/SplineMatrix/乘法组合 → **lint exit=0**。
- **沉淀**：renpy-atl.md 加「matrixcolor：颜色矩阵」节（259 行，frontmatter 完整，技能目录识别）；不新建独立 skill（避免碎片化，matrixcolor 本质是 transform 属性）。
- **演示**：matrixcolor_demo label 可运行（10 种效果 + 2 个动画逐个展示）。

## 21o. renpy-screen skill（分轮构建，2026-08-15 起）

- **背景（用户）**：screen 是最难主题，要求**拆分分轮慢慢做**（4 轮：①基础+布局 ②控件+样式 ③action ④控制语句+特殊 screen+坑）。
- **评估要点**：双语法混写（screen 语句 vs Python 表达式）、29 控件+300 action+样式体系、文档集群 655KB、sl2 编译器（slparser 33KB/slast 82KB）；裁剪：GUI 框架全套/冷门控件/optimization 不做。
- **① 基础+布局（完成）**：
  - 提取：screens.html（233KB，53 节）+ style.html → screen-extract.json（screens 53 节/style 6 节）
  - 核验：sl2 ScreenParser（keyword 默认 modal False/zorder 0/layer 'screens'/sensitive True 等）+ DisplayableParser 控件 + has 限制
  - **实测修正**：`has` 语句**不能放 screen 顶层**，必须在容器块内（button/frame/fixed/hbox/vbox/grid/side/window）——文档 use 示例缩进误导，lint 三次验证定位
  - 验证：screen_basic_test.rpy（screen 定义/参数/属性、fixed/hbox/vbox/grid/side、add/transform、use 带参、show/hide/call screen）→ lint exit=0
  - 沉淀：`~/.dsh/skills/renpy-screen.md`（第 1/4 轮：核心模型/screen 定义/显示调用/布局表/has 修正/use/最小示例），技能目录已识别
- **②③④ 待做**：控件+样式前缀、action 精选（00action_*.rpy 逐条核验）、控制语句+特殊 screen+坑。

## 21o-2. renpy-screen 第 2 轮：控件 + 样式（完成）

- **提取**：screens.html 控件节（text/button/textbutton/imagebutton 属性全表）+ style.html（style 语句子句：is 父/take/clear/variant/properties）。
- **核验**：slast.py style_prefix 处理（screen keyword pop）；按钮交互属性语义（action 兼定 sensitive/selected、alternate 右键、keysym 快捷键）；textbutton `text_` 前缀透传、`text_style` 默认 `<按钮样式>_text`。
- **验证**：screen_controls_test.rpy（text 属性/textbutton/button alternates+selected+sensitive/imagebutton 三态/style 语句继承/style_prefix）→ lint exit=0（17 screens）。
- **沉淀**：renpy-screen.md 追加「常用控件」+「样式体系」节（前缀 idle_/hover_/selected_/insensitive_ 单独强调，集群最易漏项）。

## 21o-3. renpy-screen 第 3 轮：action 精选 + 输入控件（完成）

- **提取**：screen_actions.html（17 节）action/dl 清单 93 个；bar/input/key/timer 控件节；bar-values（StaticValue/FieldValue/AnimatedValue 等）。
- **核验**：00action_*.rpy 六个文件；Control（Call/Jump/Return/Show/Hide/ToggleScreen/NullAction）、Data 变量族（Set/Increment/Toggle/Cycle × Variable/ScreenVariable/LocalVariable/Field/Dict）、Menu（ShowMenu/Quit/MainMenu/Start/Continue）、Other（Function/If/Confirm）。
- **实测修正**：`input` 的 `changed` 必须是 **Python 函数**（`def set_name(v): store._name = v`），不能给 action；`call screen` 是语句不是表达式，返回值在 **`_return`**。
- **验证**：screen_actions_test.rpy（5 种 bar 值/input/key 快捷键/timer 限时/16 种 action）→ lint exit=0。
- **沉淀**：renpy-screen.md 追加「action 精选」+「输入控件」节（bar 数值对象区分、input changed 回调、timer 限时选择）。

## 21o-4. renpy-screen 第 4 轮：控制语句 + 特殊 screen + 坑（完成，skill 收尾）

- **提取**：screens.html 控制语句节（default/for/if/on/python/showif）+ screen_special.html（13 节：say/choice/input/nvl/notify/main-menu/navigation/save/load/preferences/confirm）。
- **核验**：sl2 IfParser/ForParser/DefaultParser；特殊 screen 契约（say 的 id who/what/window 且 what 必须有——Ren'Py 靠它算自动前进/ctc；choice 的 items 对象字段 caption/action/chosen；input 的 prompt）。
- **验证**：screen_control_test.rpy（default+if 联动/for 生成按钮/python 块/on 事件/showif 倒计时/自定义 say/choice/input）→ **lint exit=0**。
- **沉淀**：renpy-screen.md 第 4 轮节（控制语句表 + 特殊 screen 覆盖 + **渲染模型坑 8 条**：每次交互重算/局部 vs 全局/action vs 直接赋值/on 不阻塞/call 返回值/样式前缀等）。
- **§21o 四轮全部完成**：renpy-screen.md 全量（核心模型/定义/显示调用/布局/控件/样式/action/输入控件/控制语句/特殊 screen/坑），lint 验证文件 4 个（screen_basic/controls/actions/control_test）；skill 集群进度 **5/8**。

## 21p. renpy-api skill（2026-08-15，集群 6/8）

- **背景（用户"回到原计划"）**：继续集群 → renpy-api（补保存/持久化/系统函数这块 vibe 高频）。
- **侦察**：renpy/exports 212 个 renpy.* 函数（displayexports 64 / menuexports / sayexports / mediaexports…）；persistent.py；audio/music.py（music 类 22 方法）；文档 persistent.html/save_load_rollback.html/audio.html。
- **核验**：renpy.music.play 签名（filenames/channel/loop/fadeout/fadein…）、music 实例经 00audio 绑定、persistent 类、exports 函数存在性（lint 实测验证）。
- **实测发现（重要）**：`init python: import renpy` **多余且有害**——写了它且函数体引用 `renpy.music` 会让 lint 在 00mixers 初始化时抛 `renpy.music` 属性缺失（清缓存不能解决，删掉即好）；另遇 game/cache 损坏导致 renpy 包初始化异常（清缓存恢复）——两坑均记录。
- **验证**：api_test.rpy（persistent 读写/renpy.notify/say/pause/restart_interaction/show/hide/call_screen/screenshot/random）→ **lint exit=0**。
- **沉淀**：`~/.dsh/skills/renpy-api.md`（75 行，核心概念/persistent/常用 renpy.* 表/音频/坑 7 条），技能目录已识别；集群 **6/8**（core/text/atl/screen/api）。剩余：renpy-l10n、renpy-practices。

## 21q. renpy-l10n skill（2026-08-15，集群 7/8）

- **背景**：用户先问"Ren'Py 翻译原理"→ 讲解查表覆盖模型 → 确认后开工。
- **原理核验（ast.py Translate.execute）**：源语句（language None）执行时 `lookup_translate(identifier)` 查表，命中跳转翻译块；**翻译块（language 非 None）不能直接运行**——完全印证"翻译=覆盖层、源文本永不被改"的查表模型。
- **提取**：translation.html（68KB/14 节：translation-units/translate-statement/strings/style-translations/extract-merge/default-language/actions）。
- **验证**：双语言 lint（l10n_test.rpy 源 + tl/japanese 翻译：显式 id 关联/插值保留/strings old/new/角色名 _() 标记）→ **lint exit=0**。
- **沉淀**：`~/.dsh/skills/renpy-l10n.md`（84 行：原理/translate 全族（语句/strings/image/style/screen）/语言优先级与切换/三文件工作流（extract→翻译→merge，标注 launcher 命令）/API/坑 6 条），技能目录已识别；集群 **7/8**。剩余：renpy-practices。

## 22. 开源定位与经验隔离（2026-08-15，项目愿景声明）

- **定位（用户）**：本项目预计以 **DSH 插件集合**形式作为**开源社区项目**持续迭代（agent preset + skills + 工具）。
- **影响**：skill 内容必须去个人化、可审阅、可积累；practices 是"框架"而非"成品"——用户在使用中自动积累个人版本。
- **经验三层隔离（每个 skill 适用，practices 最严格）**：
  - L1 引擎事实：语法/语义/API（lint 验证），核心维护者写
  - L2 通用原则：组织/命名/性能"道理"（不绑定具体项目），社区 PR + 审阅
  - L3 个人经验：具体项目/个人习惯，使用者自己写，**不进开源包**（私有文件 `~/.dsh/skills/renpy-practices-personal.md`）
- **经验优先级（冲突时谁说了算）**：`引擎事实(L1) > 通用原则(L2) > 个人经验(L3) > 模型常识`——防幻觉最终防线。
- **落地**：practices 顶部完整声明三层+优先级；其他 skill 顶部一行精简声明；PLAN 本节约 §22 作为项目愿景。

## 22b. renpy-practices skill 完成（2026-08-15，集群 8/8 收官）

- **背景（用户）**：不做 vibe 式生成，**一点一点逐轮讨论**；practices 作为开源框架，用户在使用中自动积累个人版本；个人印记强的部分不 vibe。
- **第 1 轮 组织规范（L2）**：文件组织取决于项目形态（线性分支剧情按章节 / 状态机按系统分组，label 全局唯一 L1 实测、define/default 分组）。
- **第 2 轮 资源管理**：核验出**自动索引精确规则**（00images.rpy + 实测双核验）——**只按文件名 basename 注册、目录不参与命名**；差分靠文件名含空格（`charas/eileen/eileen happy.png` → `eileen happy`）；`name@2x` 高清变体；缓存坑（game/cache 损坏致初始化异常）。
- **第 3 轮 跨域坑清单**：5 个 skill 坑**全收 33 条**（text 6 + atl 8 + screen 8 + api 7 + l10n 6 + 通用 3），按 skill 分组 + L1 标注。
- **第 4 轮 性能注意**：核验 config.py/im.py/core.py——图像缓存 `image_cache_size_mb=400`、`renpy.free_memory()`、按需重绘模型（redraw 触发）、screen 每帧重算别放重活、`RENPY_DEBUG_IMAGE_CACHE` 调试；**7.x/8.x 差异区按用户要求移除**（不做）。
- **框架**：三层隔离（L1/L2 进开源包、L3 个人私有文件）+ 优先级声明 + 贡献指南。
- **skill 集群 8/8 全部完成**：core/text/atl/screen/api/l10n/practices（7 个技能 + §22 愿景）。

## 21r. renpy-layeredimage skill（2026-08-15，引擎覆盖扩展）

- **背景**：用户确认"覆盖未完整"后选择 LayeredImage（与其差分组织方案直接相关）。
- **提取**：layeredimage.html（79KB/13 节：defining/always/attribute/group/when/pattern/selecting/proxy/advice/examples）+ 00layeredimage_ren.py（44KB，语句类核验）。
- **核验**：layeredimage 语句（zoom/at/image_format/attribute_function/offer_screen）、always/attribute（default/when/null/variant）/group（prefix/auto/multiple）、差分选择规则（default 生效、show 追加/替换、-移除、when 互斥链）、auto 组 pattern（`sprites/{image}.png` + 已定义 image）、LayeredImageProxy（接收差分属性 vs Transform 不接收）。
- **验证**：layeredimage_test.rpy（always/attribute default/group 差分/auto 组/when 互斥/image_format/variant/prefix）→ **lint exit=0**。
- **沉淀**：`~/.dsh/skills/renpy-layeredimage.md`（91 行：概念/语句表/差分规则/auto 取图/Proxy/坑 7 条），技能目录已识别；引擎覆盖再+1（与 practices 资源管理的差分组织闭环）。

## 21s. renpy-transitions skill（2026-08-15，引擎覆盖扩展 2）

- **背景**：用户确认"覆盖未完整"→ 按优先级继续：LayeredImage（完成）→ 转场 + 图像操作。
- **提取**：transitions.html（86KB/8 节）+ displaying_images.html（15 节，含 im 相关）。
- **核验**：预定义转场 19 个（dissolve/fade/move 家族/ease 家族/vpunch 等）、转场类（Dissolve/Fade/ImageDissolve/AlphaDissolve/CropMove/PushMove/ComposeTransition/Pixellate/Flash）、ATL 转场（old_widget/new_widget + events）、Dict 转场（按层）、Python 转场（条件）、自动转场（config.scene_show_hide_transition 等）；im.* 图像操作（im.py 类清单，**标注旧 API 倾向 Transform**）。
- **验证**：transitions_test.rpy（预定义 12 个/自定义类 6 个/ATL 转场 spin/Python 转场/Dict 转场/自动转场配置）→ **lint exit=0**。
- **沉淀**：`~/.dsh/skills/renpy-transitions.md`（~100 行：用法/预定义表/自定义类表/ATL 转场/Dict/Python/自动转场/im.* 旧 API 提示/坑 7 条），技能目录已识别；**引擎覆盖 +2**（layeredimage + transitions）。
- **补充**：PLAN §0 恢复清单已加（重开引导）；practices 资源管理已补 LayeredImage 差分建议。

## 21t. renpy-save + renpy-sprites skill（2026-08-15，引擎覆盖扩展 3-4）

- **renpy-save（四块）**：① 存档机制（API 9 + File action 族 17 + 槽位组织 + 自动存档/回滚）② Gallery ③ MusicRoom ④ Achievement——**核验修正 2 个真实 bug**（make_button 返回 Button displayable 非 action + 需先 button() 创建；MusicRoom 无 unlock 方法，实为 seen_audio 自动解锁/always_unlocked）。save_test + gallery_test lint exit=0。
- **renpy-sprites**：SnowBlossom 现成粒子（首选）/SpriteManager 自定义/Sprite 字段、Drag/DragGroup 类（**无 drag 语句**，draggable 只是 viewport 关键词）、Movie（movie_cutscene 过场/Movie displayable）。sprites_test lint exit=0。
- **覆盖进度**：已补 layeredimage/transitions/save/sprites/gui 五块；剩余：测试框架、3D、构建发布、config（config 建议进 practices 不建 skill）。

## 21u. renpy-gui skill + 编辑器 GUI 定制面板（2026-08-15，引擎覆盖扩展 5 + 重点功能）

- **背景（用户）**：GUI 定制是重点，**编辑器要做出对应功能**——按建议做"一个按钮打开的面板"（轻量可视化 + 补全）。
- **知识层**：renpy-gui skill（gui.init 分辨率 / gui.* 变量树（颜色 8/字体 4/字号 6）/背景图约定 / style 覆盖层级 / 坑 7 条）；gui_test.rpy lint exit=0。
- **编辑器功能（client-only）**：
  - 模块级纯函数：`parseGuiVars`（解析 gui.init + define gui.*）、`applyGuiChanges`（替换/追加写回）、`GUI_VARS` 清单——**单测 9/9**
  - 工具栏「🎨 GUI」按钮 → 面板（zIndex 58）：分辨率（gui.init）、7 个主题色（color input）、4 个字号、保存到 gui.rpy（写回 + 打开标签同步）、查看源码
  - 补全：buildCompletions 加 gui.* 变量（输入 `gui.` 触发）
- **验证**：test-gui 9/9；冒烟 GUI 面板分支 6 项全 true；48/21/9/15/9 全量回归。
- **说明**：无 gui.rpy 项目（如 demo-script）打开面板显示默认值，保存会创建 gui.rpy——GUI 定制对模板项目（gui/ 模板）最有用。

## 21v. renpy-test skill（2026-08-15，引擎覆盖扩展 6）

- **背景**：剩余覆盖第 6 项——自动化测试。
- **关键实测**：`python renpy.py <项目> test <suite>` **SDK 命令行直接可用**（rpytest 框架）——之前评估"可能要 launcher"是错的；demo-script 加 testsuite（2 用例：点弹窗关闭→菜单选项→推进到指定文本）**真实跑通**（2/2 PASSED，3.5s）——**行为级验证**（比 lint 强）。
- **沉淀**：`~/.dsh/skills/renpy-test.md`（testsuite/testcase 结构、enabled/only/xfail/parameter 属性、run/advance/click/click id/until 命令、键盘鼠标、Python 块、用途、坑 6 条），技能目录已识别。
- **覆盖进度**：已补 layeredimage/transitions/save/sprites/gui/test 六块；剩余：3D、构建发布、config（config 建议进 practices）。

## 21w. renpy-build skill + 编辑器 test 集成（2026-08-15，引擎覆盖扩展 7 + SDK 功能缺口）

- **探索（用户要求）**：构建发布 + 盘点之前 SDK 功能。
- **关键发现**：`distribute` 打包命令在 **launcher**（launcher/game/distribute.rpy），SDK 命令行无（arguments 只有 compile/lint/run/quit/rmpersistent）——**打包运行做不了，只能覆盖 build.rpy 配置知识**；host.js 已有 24 个 API 端点，**缺 test 端点**（自动化测试刚验证 SDK 支持）。
- **renpy-build skill**：build.name/directory_name/executable_name、classify（通配 + 平台标签 all/linux/mac/windows/android/archive/None）、archive（.rpa 分组）、package（发布包）、特殊文件/old-game/函数；**标注"打包运行在 launcher"**；build_test.rpy lint exit=0。
- **编辑器 test 集成**：host.js 加 `/renpy-api/test`（runTest：`renpy.py <proj> test [suite]` + rpytest 报告解析 passed/failed/status）+ 工具栏「🧪 测试」按钮 + 报告条（✓/✗ + 通过数 + 详情展开）。
- **验证**：语法 OK、冒烟 SMOKE PASS、48/21/9 回归全过。
- **说明**：host.js 改动需重启 dsh 生效；test 命令实测 SDK 直接可用（见 §21v）。

## 21x. 学习用途自动注释（2026-08-15，编辑器功能）

- **背景（用户）**：知识（13 skill）+ 工具齐了，可以做"学习用途的自动注释"。
- **实现（规则化，纯函数不依赖 LLM）**：模块级 `renpyLearnNotes(src)` 逐行生成教学解释——语句识别 22 类（label/say 角色+旁白/menu/menu 选项/jump/call/return/scene/show/hide/with/define/default/image/transform/screen/python/$/if/play/pause/window/layeredimage/translate/init）+ 注释/空行/缩进提示（"缩进 = 属于上方块"）。
- **UI**：工具栏「📖 学习」按钮 → 面板（zIndex 59）：行号 | 代码 | 解释 三列，点击行跳转编辑器，label 行蓝色高亮、注释绿色。
- **验证**：test-learn **15/15**（各语句识别/菜单选项/缩进提示/顶层 label 不误加）；冒烟学习面板 5 项全 true；48/21/9/15 全量回归。
- **顺手修正**：menu 选项 `"文本":` 原被误识别为旁白 → 新增菜单选项识别（在 say 前优先）。
- **§21x-2 文档跳转（用户要求"点击跳转对应文档"）**：renpyLearnNotes 每条输出带 `doc`（SDK 官方 doc 页）+ `skill`（对应技能·节）字段（26 类映射）；行末显示 `📄 label · renpy-core` 胶囊，点击 `openDocTab(page)` 打开 `doc:<page>` 特殊标签；host.js 新增 `readDoc(page)`（剥 script/style/标签 → 纯文本，截断 12000 字符）+ `/renpy-api/doc` GET 路由；面板标题提示"点击行可跳转"。
- **验证**：test-learn 扩展至 **31/31**（doc/skill 字段存在性 + blank 无字段）；全量回归 48/21/9/15/9/31 全绿；冒烟 SMOKE PASS。
- **§21x-3 内联化（用户要求"表现形式做进编辑器，复用文本样式预览那种感觉"）**：删除右下角浮窗面板，改为**学习模式**（📖 按钮 toggle）：行高放大（学习 40px / 与预览叠加 46px，pre/ta/gutter/LINE_H 同步），overlay 层每行代码下方渲染解释条（浅蓝底+左边条，注释绿/label 黄/语句蓝，ellipsis 截断，hover 看全文）；解释条可点击打开官方文档（📄 胶囊），overlay 容器 pointerEvents none 穿透、解释条 auto 可点（zIndex 1 在 textarea 之上）；编辑器顶部新增学习模式提示条（复用预览提示条风格）。
- **验证**：冒烟断言改为内联（提示条/解释 label/say/return/📄 胶囊/工具栏📖 全 true）；全量回归 48/21/9/15/9/31 全绿；SMOKE PASS。
- **注意**：host.js 改动（doc 路由）需重启 dsh 生效；client-only 部分（学习模式内联/renpyLearnNotes）刷新即生效。
- **§21x-4 真正的学习模式（用户要求"不用 ai 没参考意义，利用 skill 和 agent 配置"）**：
  - **架构**：规则层只负责"语句→skill 定位"（renpyLearnNotes 已有映射），**解释内容由 LLM 基于真实 skill 全文生成**：
    - host.js 新增 `readSkillFile(name)`（读 `C:/Users/hanso/.dsh/skills/<name>.md`，剥 frontmatter）+ `teachLine(req)`（读 skill 全文 → 组装教学 prompt → `ctx.llm.stream()` 用 agentDefaultModel 当前模型生成 → markdown）
    - 新端点 `/renpy-api/teach`（POST：code/line/skill/file/context）
    - client.js 新增 `openTeachTab(n)`：点击解释条 → 预占 `teach:<file>:<line>` 标签（⏳ AI 教学中）→ api 返回后填充 markdown
    - **teach:/doc: 标签只读渲染**：teach 用 mdToHtml（markdown），doc 用纯文本 pre；`isViewTab` 关闭 overlay/textarea，saveFile 拒绝
  - **教学 prompt**：以 skill 原文为知识源（L1 引擎事实，人工核验），要求"这段代码在做什么 → 逐点解释 → 常见坑 → 小练习"、标注 skill 来源、400 字内、中文、代码块用 ```rpy；skill 之外明说"超出覆盖建议查官方文档"（不臆造）
  - **交互**：行下解释条仍为规则概览；点击 → AI 深度教学标签（📄 胶囊保留显示对应官方文档页）
- **验证**：新 test-teach.js **43/43**（14 skill 文件存在非空 / clean 清洗 / DOC 映射→skill 文件闭环）；冒烟新增 teach 标签断言（markdown 粗体/列表/代码块 true，无 textarea/overlay true）；全量回归 48/21/9/15/9/31 全绿；SMOKE PASS。
- **注意**：host.js（teach 端点 + readSkillFile）需**重启 dsh** 生效；client-only 部分刷新即生效。llm 调用走 agentDefaultModel 当前模型（默认 deepseek-official/deepseek-v4-flash），需 API 可用。
- **§21x-5 学习模式改为"写入真正的注释"（用户要求：注释形式 + 工作区域限制 + 标记可清除 + 消耗确认）**：
  - **表现形式**：不再打开教学标签，而是把 AI 教学**写成真正的 `# 📖 学习: <skill>（L<行>）` 注释块**插入代码行上方（`# 讲解…` 每行，空行转 `#`）；lint 实测 exit=0 合法
  - **纯函数**（模块级，可单测）：`learnCommentLines(text,skill,line)`（文本→注释行）、`insertLearnComment(src,line,text,skill)`（插入块）、`findLearnBlock(src,line)`（检测行上方注释块区间，跳过中间普通注释，返回 1-based {start,end}）、`stripLearnComment(src,line)`（清除块）
  - **交互（toggle）**：点击解释条 → 已有注释块则**清除**（绿底显示"✓ 已注释"）；无块则**弹确认**（"写入 AI 学习注释？⚠ 消耗 token 资源"）→ 确认后调 teach → 写入；注释行（`#` 开头）不解释
  - **工作区域限制**：`learnInRange` 校验注释块覆盖行在 wsLock 范围内（插/删都校验，越界拒绝并提示）
  - **清除语义修正**：findLearnBlock 从目标行上方第一行（`line-2`）向上找标记，end 延伸到目标行前（块含标记+正文），strip 按块区间删除
- **验证**：新 test-learn-comment.js **20/20**（注释行生成/插入位置/块检测含普通注释场景/清除还原/循环插删）；冒烟新增"学习确认"断言（弹窗/消耗提示/确认/取消全 true）；全量回归 48/21/9/15/9/31/20/43 全绿；demo 项目带注释 lint exit=0。
- **注意**：host.js（teach 端点）需**重启 dsh** 生效；client-only 部分（注释插删/确认/工作区域）刷新即生效。
- **§21x-6 学习模式改为"批量 AI 注释"（用户明确："非 AI 解释残留要清除；无区域约束给整个文件加 AI 注释，有则限定范围"）**：
  - **移除非 AI 解释条**：删除 learnMode state、行下解释条渲染、learnMode 行高分支（LINE_H/ED_LH 恢复）；服务端 bundle 验证无 setLearnMode/toggleLearn 残留
  - **📖 按钮 = 批量生成**：`startTeach` 收集目标行（renpyLearnNotes 中非 comment/blank/other + 无既有注释块 + 范围内）→ 弹确认（显示范围：工作区域 Lx-y / 整个文件 + 行数 + 消耗提示）→ 确认调 `/renpy-api/teach-file`
  - **host.js `teachFile`**：逐行调 `teachOne`（读对应 skill 全文 + 单行 prompt → llm.stream），返回 [{line, skill, text, ok}]；`teach` 单行端点保留兼容
  - **范围规则**：无 wsLock 或 wsLock.file ≠ 当前文件 → 整文件；否则限定 startLine-endLine
  - **写入**：从下往上插入（行号降序避免偏移）；结果条显示"已写入 N 条（范围；失败 M 条）"+"🗑 清除全部"
  - **清除**：`clearLearnAll` 遍历 LEARN_MARK 行，区域内限定，从下往上 strip
- **验证**：新 test-learn-batch.js **8/8**（区域内目标收集/范围过滤/python 行映射 renpy-core/整文件>区域/已注释跳过/块区间/行数+2）；冒烟改"学习批量"（无解释条残留 true）+ "学习确认"批量弹窗 6 项全 true；全量回归 48/21/9/15/9/31/20/43/8 全绿；demo 项目 python 块内插入学习注释 lint exit=0。
- **注意**：host.js（teach-file 端点）需**重启 dsh** 生效；client-only 部分（批量收集/确认/清除）刷新即生效。当前会话工作区域 atl_test.rpy 8-15 → 点📖只注释该区域内行。
- **§21x-7 批量注释限流修复（用户实测"AI 教学失败: ?"）**：
  - **根因 1（键冲突）**：host teachFile 返回 `{ok: true, ..., ok: okN}` —— `ok` 键重复被 `ok: okN` 覆盖；全部失败时 `ok: 0`（`!0`=true）→ client 误判整体失败显示"AI 教学失败: ?"（error 为空）。修复：改 `okCount`，client 增强显示逐行错误首条。
  - **根因 2（连续调用限流）**：实测逐行调 llm 触发限流（3 连调用：超时/空响应/成功）。用户建议**单次调用** → teachFile 改为一次 llm 调用：收集去重 skill 全文（各截 4000）→ 单 prompt 列出所有行（L行号+代码块）→ 提示词要求输出 `{"行号": "注释"}` JSON → 解析（剥 ```json 围栏 → 严格 JSON → 失败则正则宽松回退"行号":"注释"）。
  - **单行端点** teachOne 保留兼容 `/renpy-api/teach`；批量 90s 超时保护。
- **验证**：新 test-teach-parse.js **9/9**（纯 JSON/围栏/杂散文字/多行/宽松回退/无 JSON null/引号转义/空对象）；全量回归 48/21/9/15/9/31/20/43/8/9 全绿。
- **注意**：host.js（单次调用版 teachFile）需**重启 dsh** 生效；重启后实测 3 行批量应一次调用成功无限流。
- client-only，刷新客户端生效。
- **§21x-8 对话功能 400 崩溃修复（用户实测"测试学习功能成功后对话功能报错，本轮运行失败"）**：
  - **现象**：学习功能（📖 批量注释）成功后，对话轮次连续失败：`An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'. (insufficient tool messages following tool_calls message)`，code INVALID_REQUEST status 400；turn 243 起整轮历史损坏，之后 turn 244-247 全部同错。
  - **根因**：agent 挂起工具调用（ask_user_question 等，assistant 已发 tool-call 块、tool/result 未落地）期间，用户操作工作区域按钮 → host `injectWorkspaceMsg` 无条件 `session.append('user/message', …)` → 注入的 user/message 插在 assistant(tool_calls) 与 tool(result) 之间，违反 OpenAI 消息配对协议 → API 400 拒绝，历史从此损坏。
  - **修复（host.js）**：新增 `hasOpenToolCall(session)` 从会话尾部向前找第一条 surface 消息：tool/result → 已闭合；assistant 带 tool-call 块 → 挂起；user/message（跳过本插件 source.form==='instructions' 的指令消息）→ 安全。`injectWorkspaceMsg` 检测到挂起时把消息放入 pending 队列（`flushPendingWs` 每 300ms 重试，10min 超时丢弃，会话失效即删），等 tool/result 落地后再 append，保证消息顺序合法。
  - **验证**：test-hasOpenToolCall.js **7/7**（真实会话事件回放：挂起中 true / bug 现场含指令消息仍 true / 工具结果落地后 false / 普通结尾 false）；node --check 通过。
  - **注意**：host.js 改动需**重启 dsh** 生效；旧会话 session-3b1f22fe 的历史已损坏不可恢复，需开新会话（当前新会话正常）。

- **§21x-9 架构整理：host 侧纯函数抽取 renpy-core（开源前可维护性第一步）**：
  - **背景（用户方向）**：开源前需要提升代码可维护性；评估确认 client.js 是浏览器 bundle（`window.__ModuleLoader__`，不支持相对 require），本轮只拆 host 侧（CJS 零风险），client 侧留待构建脚本内联方案。
  - **新增 `renpy-client/lib/renpy-core.js`**：共享纯函数模块（Node CJS，`module.exports`），含 `lineDiff`（检查点行级 diff）与 `hasOpenToolCall`（工具调用挂起检测，§21x-8 核心逻辑）。
  - **host.js 改造**：顶部 `require('./renpy-core')`；删除模块级 lineDiff 定义（46 行）与 apply 内 hasOpenToolCall 定义（30 行）；`module.exports.lineDiff` 自动指向 require 版本，对外 API 不变。
  - **测试改造**：test-hasOpenToolCall.js 从"内联复刻逻辑"改为 **require renpy-core 真实实现**（测试传 session 形状适配），从此测的是运行代码而非复刻品。
  - **可回溯**：拆分前基线 11 测试全绿（219 断言）→ 拆分后 11 测试全绿（219 断言）零变化；hasOpenToolCall 4 场景回放（挂起/指令跳过/闭合/用户消息）全过；纯搬移零逻辑改动。
  - **踩坑（覆盖同步）**：把工作区 host.js 同步到发布包时 `Copy-Item` 直接覆盖，**丢失了发布包已有的参数化**（renpy.config.json 读取）；已重建发布包 host.js = 参数化 + 拆分两者兼备，验证 apply 从 renpy.config.json 读 SDK 成功、无硬编码残留、renpy-core.js 双端 SHA256 一致。
  - **遗留**：client.js 侧 A 类 9 个纯函数（renpyToPython/lineDiff/buildFileTree 等）因 bundle 不支持相对 require 未拆，留待选项 1（构建脚本内联）或确认 ModuleLoader 支持后再做；host 能力函数（cpCreate/teachOne/runLint 等 14 个）依赖 apply 闭包，属未来 Service 化候选。
  - **产物**：`renpy-dsh-mode-v1.0.zip` 已重新打包（含 renpy-core.js，zip 内语法验证通过）。
