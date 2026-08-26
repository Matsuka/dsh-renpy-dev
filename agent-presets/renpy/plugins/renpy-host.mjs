// Ren'Py 开发模式 — Host 插件（P0-P1，v5）
// 职责：提供 renpy 服务（SDK 信息 / lint 运行器 / 项目索引 / 项目脚手架）
//       + 注册工具 renpy_lint / renpy_index / renpy_scaffold。
// 关键机制：
//  - 子进程被沙箱禁止写 %APPDATA%，因此运行 Ren'Py 时设置 RENPY_PATH_TO_SAVES
//    环境变量（renpy.py path_to_saves 支持），使 saves/tokens/persistent/backups
//    全部重定向到 userDir（默认 <sdkPath>/../.renpy-user，位于工作区内）。
//  - 沙箱策略按会话解析（照 dsh-tool-pwsh）：ctx.sandboxPolicy.resolve({session})，
//    再传给 shell 请求；不传会触发执行器默认策略的 ACL 临时根冲突。
//  - 项目索引：一次 renpy 运行（自定义命令 dump_index，见 plugins/indexer.py）
//    产出 labels/defines/screens/transforms 索引 JSON。
//
// 注意：本文件是预设目录内的相对模块（agent.cordis.yml 中 name: './plugins/renpy-host.mjs'），
// 预设目录下需存在 node_modules junction 指向 harness 的 node_modules，
// 使裸说明符（@deepseek-ai/dsh-tools、node:url）可解析。

import { defineTool } from "@deepseek-ai/dsh-tools"
import { fileURLToPath } from "node:url"

export const name = "renpy-host"

export const inject = ["shell", "tools", "sandboxPolicy", "fs"]

export function apply(ctx, config) {
  const sdkPath = config.sdkPath || process.env.RENPY_SDK_PATH
  if (!sdkPath) {
    throw new Error("renpy-host: config.sdkPath is required (agent.cordis.yml -> renpy -> renpy-host config); deploy 脚本会写入实际 SDK 路径，或设置 RENPY_SDK_PATH 环境变量")
  }

  const python = sdkPath + "\\lib\\py3-windows-x86_64\\python.exe"
  const renpyPy = sdkPath + "\\renpy.py"
  const userDir = config.userDir || sdkPath + "\\..\\.renpy-user"
  const indexerPath = fileURLToPath(new URL("./indexer.py", import.meta.url))
  // route-map.json → .rpy 生成器（设计文档闭环；SDK 通常位于工作区根下，故路径可推断）
  const generatorPath = config.routeGeneratorPath || sdkPath + "\\..\\verification\\scripts\\generate-route-code.js"

  // PowerShell 单引号引用：路径含空格/引号时安全。
  const q = (p) => "'" + String(p).replace(/'/g, "''") + "'"

  const basename = (p) => String(p).split(/[\\/]/).pop() || "project"

  /** 解析本调用所属会话的沙箱策略（与 dsh-tool-pwsh 相同的做法）。 */
  const resolvePolicy = (exec) => {
    try {
      const req = exec && exec.agent && exec.agent.session ? { session: exec.agent.session } : {}
      return ctx.sandboxPolicy.resolve(req)
    } catch (e) {
      console.error("renpy-host: sandboxPolicy.resolve failed:", (e && e.message) || String(e))
      return undefined
    }
  }

  /** 运行一次 Ren'Py CLI（pwsh 语法；本机 shell 执行为 pwsh）。 */
  const runRenpy = async (projectPath, args, opts = {}, exec) => {
    const cmd = "& " + q(python) + " " + q(renpyPy) + " " + q(projectPath) + " " + args.join(" ")
    const policy = resolvePolicy(exec)
    const spec = ctx.shell.resolve({
      command: cmd,
      workdir: sdkPath,
      env: { RENPY_PATH_TO_SAVES: userDir },
      timeoutMs: opts.timeoutMs || 180000,
      stdoutMaxBytes: opts.stdoutMaxBytes || 4 * 1024 * 1024,
      ...(policy !== undefined ? { sandboxPolicy: policy } : {}),
    })
    return ctx.shell.run(spec)
  }

  /** SDK 信息。 */
  const sdkInfo = () => ({
    sdkPath,
    python,
    userDir,
  })

  /** 运行 `renpy.py <project> lint`，返回结构化结果。 */
  const lint = async (projectPath, opts = {}, exec) => {
    const result = await runRenpy(projectPath, ["lint"], opts, exec)
    return {
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stdout: result.stdout.text,
      stderr: result.stderr.text,
      stdoutTruncated: result.stdout.truncated,
    }
  }

  /** 生成项目索引（一次 renpy 运行），返回结构化结果 + 索引文件路径。 */
  const indexProject = async (projectPath, opts = {}, exec) => {
    const outFile = (opts.outFile) || userDir + "\\index\\" + basename(projectPath) + ".json"
    const cmd = "& " + q(python) + " " + q(indexerPath) + " " + q(sdkPath) + " " + q(projectPath) + " " + q(outFile) + " " + q(userDir)
    const policy = resolvePolicy(exec)
    const spec = ctx.shell.resolve({
      command: cmd,
      workdir: sdkPath,
      env: { RENPY_PATH_TO_SAVES: userDir },
      timeoutMs: opts.timeoutMs || 180000,
      stdoutMaxBytes: opts.stdoutMaxBytes || 4 * 1024 * 1024,
      ...(policy !== undefined ? { sandboxPolicy: policy } : {}),
    })
    const result = await ctx.shell.run(spec)
    const base = {
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stderr: result.stderr.text,
      indexFile: outFile,
    }
    if (result.exitCode !== 0) {
      return { ...base, error: result.stdout.text || "indexer failed" }
    }
    try {
      const target = await ctx.fs.resolve(outFile)
      const text = await ctx.fs.readText(target)
      const index = JSON.parse(text)
      const labels = index.labels || {}
      const screens = index.screens || {}
      const names = (list) => Object.keys(list).sort()
      return {
        ...base,
        counts: {
          labels: Object.keys(labels).length,
          defines: Object.keys(index.defines || {}).length,
          screens: Object.keys(screens).length,
          transforms: Object.keys(index.transforms || {}).length,
        },
        labels: names(labels).slice(0, 300).map((k) => ({ name: k, file: labels[k][0], line: labels[k][1] })),
        screens: names(screens),
        definesPreview: names(index.defines || {}).slice(0, 50),
        transforms: names(index.transforms || {}),
      }
    } catch (e) {
      return { ...base, error: "index read failed: " + ((e && e.message) || String(e)) }
    }
  }

  /** 创建新项目：mkdir + project.json + generate_gui（SDK gui 模板，一次运行）。 */
  const scaffoldProject = async (targetDir, opts = {}, exec) => {
    const name = opts.name || basename(targetDir)
    const width = opts.width || 1280
    const height = opts.height || 720
    const accent = opts.accent || "#00b8c3"
    const gameDir = targetDir + "\\game"
    const mk = "New-Item -ItemType Directory -Force -Path " + q(gameDir) + " | Out-Null; Set-Content -Path " + q(targetDir + "\\project.json") + " -Value " + JSON.stringify(JSON.stringify({ name: name, packages: ["pc", "mac", "linux"] })) + " -Encoding UTF8; "
    const gen = "& " + q(python) + " " + q(renpyPy) + " " + q(sdkPath + "\\launcher") + " generate_gui " + q(targetDir) + " --start --template=" + q(sdkPath + "\\gui") + " --width " + String(width) + " --height " + String(height) + " --accent " + q(accent)
    const policy = resolvePolicy(exec)
    const spec = ctx.shell.resolve({
      command: mk + gen,
      workdir: sdkPath,
      env: { RENPY_PATH_TO_SAVES: userDir },
      timeoutMs: opts.timeoutMs || 240000,
      stdoutMaxBytes: opts.stdoutMaxBytes || 4 * 1024 * 1024,
      ...(policy !== undefined ? { sandboxPolicy: policy } : {}),
    })
    const result = await ctx.shell.run(spec)
    const base = {
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stdout: result.stdout.text,
      stderr: result.stderr.text,
      targetDir,
      gameDir,
    }
    if (result.exitCode !== 0) {
      return { ...base, error: "scaffold failed (see stdout)" }
    }
    try {
      const target = await ctx.fs.resolve(gameDir)
      const entries = await ctx.fs.listDir(target)
      return { ...base, files: entries.map((e) => e.name) }
    } catch (e) {
      return { ...base, files: [] }
    }
  }

  // ── P2：运行/测试/编译 ──────────────────────────────────────────────────

  // 正在运行的游戏进程（按项目路径追踪）。组合卸载时 shell 会终止所有后台进程。
  const running = new Map()

  /** 启动游戏（真实窗口）。若该项目已在运行，先停掉旧的。 */
  const runGame = async (projectPath, opts = {}, exec) => {
    const existing = running.get(projectPath)
    if (existing) {
      try { existing.proc.kill() } catch (e) { /* ignore */ }
      running.delete(projectPath)
    }
    const args = ["run"]
    if (opts.warp) args.push("--warp=" + String(opts.warp))
    const cmd = "& " + q(python) + " " + q(renpyPy) + " " + q(projectPath) + " " + args.join(" ")
    const policy = resolvePolicy(exec)
    const spec = ctx.shell.resolve({
      command: cmd,
      workdir: sdkPath,
      env: { RENPY_PATH_TO_SAVES: userDir },
      stdoutMaxBytes: opts.stdoutMaxBytes || 4 * 1024 * 1024,
      ...(policy !== undefined ? { sandboxPolicy: policy } : {}),
    })
    const proc = ctx.shell.start(spec)
    running.set(projectPath, { proc, startedAt: Date.now() })
    return { started: true, projectPath, status: proc.status, note: "游戏窗口应已打开；用 renpy_status 查看状态，renpy_stop 停止。" }
  }

  /** 停止正在运行的游戏。 */
  const stopGame = async (projectPath) => {
    const existing = running.get(projectPath)
    if (!existing) return { stopped: false, projectPath, note: "该项目没有正在运行的进程" }
    const killed = existing.proc.kill()
    running.delete(projectPath)
    return { stopped: true, projectPath, killed }
  }

  /** 查询运行状态 + 增量输出。 */
  const statusGame = (projectPath) => {
    const existing = running.get(projectPath)
    if (!existing) return { running: false, projectPath, output: "" }
    let delta = ""
    try {
      const read = existing.proc.readOutput()
      delta = read.delta || ""
    } catch (e) { /* ignore */ }
    const done = existing.proc.status !== "running"
    if (done) running.delete(projectPath)
    return {
      running: !done,
      projectPath,
      status: existing.proc.status,
      exitCode: existing.proc.exitCode,
      startedAt: existing.startedAt,
      output: delta,
    }
  }

  /** 运行自动化测试（headless，rpytest）。 */
  const testProject = async (projectPath, opts = {}, exec) => {
    const result = await runRenpy(projectPath, ["test"], opts, exec)
    return {
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stdout: result.stdout.text,
      stderr: result.stderr.text,
    }
  }

  /** 强制重编译 .rpy → .rpyc。 */
  const compileProject = async (projectPath, opts = {}, exec) => {
    const result = await runRenpy(projectPath, ["compile"], opts, exec)
    return {
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stdout: result.stdout.text,
      stderr: result.stderr.text,
    }
  }

  /** 整屏截图存 PNG（游戏窗口反馈用；agent 可用 read_image 查看）。 */
  const screenshot = async (opts = {}, exec) => {
    const dir = userDir + "\\screenshots"
    const file = dir + "\\game-" + Date.now() + ".png"
    const cmd =
      "New-Item -ItemType Directory -Force -Path " + q(dir) + " | Out-Null; " +
      "Add-Type -AssemblyName System.Drawing; " +
      "Add-Type -AssemblyName System.Windows.Forms; " +
      "$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; " +
      "$bmp=New-Object System.Drawing.Bitmap($b.Width,$b.Height); " +
      "$g=[System.Drawing.Graphics]::FromImage($bmp); " +
      "$g.CopyFromScreen($b.X,$b.Y,0,0,(New-Object System.Drawing.Size($b.Width,$b.Height))); " +
      "$bmp.Save(" + q(file) + ",[System.Drawing.Imaging.ImageFormat]::Png); " +
      "$g.Dispose(); $bmp.Dispose()"
    const policy = resolvePolicy(exec)
    const spec = ctx.shell.resolve({
      command: cmd,
      workdir: sdkPath,
      env: { RENPY_PATH_TO_SAVES: userDir },
      timeoutMs: opts.timeoutMs || 30000,
      ...(policy !== undefined ? { sandboxPolicy: policy } : {}),
    })
    const result = await ctx.shell.run(spec)
    return {
      exitCode: result.exitCode,
      file,
      stderr: result.stderr.text,
      note: "截图已保存；agent 可用 read_image 工具查看该 PNG。",
    }
  }

  // 发布 renpy 服务（供同 realm 内其他行消费；isolate 组内）。
  ctx.provide("renpy", { sdkInfo, lint, indexProject, scaffoldProject, runGame, stopGame, statusGame, testProject, compileProject, screenshot })

  // 注册 renpy_lint 工具（tools 为宿主注册表，按 scope 自动清理）。
  ctx.tools.register(defineTool({
    name: "renpy_lint",
    description: "对 Ren'Py 项目运行官方 lint（renpy.py <project> lint），返回退出码与完整输出。lint 发现脚本错误、未定义引用等问题时退出码非零。",
    parameters: {
      projectPath: {
        type: "string",
        required: true,
        description: "Ren'Py 项目目录的绝对路径（含 game/ 的目录）。",
      },
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render(_args, value) {
        const v = value || {}
        const head = "renpy_lint exit=" + String(v.exitCode) + (v.timedOut ? " (timed out)" : "")
        const body = String(v.stdout || "") + (v.stderr ? "\n[stderr]\n" + String(v.stderr) : "")
        return [{ type: "text", text: head + (body ? "\n\n" + body : "") }]
      },
    },
    async execute(args, exec) {
      return lint(args.projectPath, {}, exec)
    },
  }))

  // 注册 renpy_index 工具。
  ctx.tools.register(defineTool({
    name: "renpy_index",
    description: "生成/刷新 Ren'Py 项目的结构索引（labels/defines/screens/transforms，含 file:line 定位），并返回索引摘要。索引 JSON 保存在 userDir/index/ 下供编辑器视图使用。",
    parameters: {
      projectPath: {
        type: "string",
        required: true,
        description: "Ren'Py 项目目录的绝对路径（含 game/ 的目录）。",
      },
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render(_args, value) {
        const v = value || {}
        const c = v.counts || {}
        const head = "renpy_index exit=" + String(v.exitCode) + " labels=" + String(c.labels) + " defines=" + String(c.defines) + " screens=" + String(c.screens) + " transforms=" + String(c.transforms)
        const labels = (v.labels || []).map((l) => l.name + " @" + l.file + ":" + l.line).join("\n")
        return [{ type: "text", text: head + (labels ? "\n\nlabels:\n" + labels : "") + (v.error ? "\nerror: " + String(v.error) : "") }]
      },
    },
    async execute(args, exec) {
      return indexProject(args.projectPath, {}, exec)
    },
  }))

  // renpy-core.js 的报错解析纯函数（与 web profile 的 host.js 共用同一实现）。
  // 加载：优先 config.corePath 覆盖，其次开发树相对路径；发布包部署时若结构不同，
  // 需在 renpy.config.json / 插件 config 提供 corePath（与 generatorPath 同模式）。
  const loadErrorParsers = async () => {
    const candidates = [
      config && config.corePath,
      new URL("../../../renpy-client/lib/renpy-core.js", import.meta.url).href,
    ].filter(Boolean)
    for (const c of candidates) {
      try {
        const mod = await import(c)
        if (mod && mod.parseTraceback) return mod
      } catch (e) { /* 尝试下一个候选 */ }
    }
    return null
  }

  // 注册 renpy_find 工具（静态诊断：引用完整性扫描，秒级快速通道）。
  ctx.tools.register(defineTool({
    name: "renpy_find",
    description: "对 Ren'Py 项目做静态诊断（引用完整性扫描，秒级返回，无需运行引擎）。" +
      "诊断种类：invalid_jump（jump/call 指向不存在的 label，error）、undefined_screen（show/call screen、use 指向不存在的 screen，error）、" +
      "undefined_character（say 用了未定义的 Character，warn）、missing_asset（show/scene 图像、play 音频、{font=} 指向不存在的文件，warn）、" +
      "unreachable_label（从 start 不可达的 label，info）。动态特性（jump/call expression、renpy.jump()、show expression）无法静态确认，不报告。" +
      "每个条目含 kind/level/file/line/target/msg，可直接定位修改；与 renpy_lint 配合：lint 是权威（引擎解析），本扫描是快速初检。",
    parameters: {
      projectPath: { type: "string", required: true, description: "Ren'Py 项目目录的绝对路径（含 game/ 的目录）" },
      kind: { type: "string", description: "只返回指定诊断种类（invalid_jump/undefined_screen/undefined_character/missing_asset/unreachable_label），省略返回全部" },
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render(_args, value) {
        const v = value || {}
        const head = "renpy_find files=" + String(v.files) + " items=" + String((v.items || []).length)
        if (v.error) return [{ type: "text", text: head + "\nerror: " + String(v.error) }]
        const groups = {}
        for (const it of v.items || []) (groups[it.kind] = groups[it.kind] || []).push(it)
        const parts = [head]
        for (const kind of Object.keys(groups)) {
          const g = groups[kind]
          parts.push("[" + kind + "] " + g.length + " 条")
          for (const it of g) parts.push("  " + it.file + ":" + it.line + "  " + (it.target ? it.target + " — " : "") + it.msg)
        }
        return [{ type: "text", text: parts.join("\n") }]
      },
    },
    async execute(args, exec) {
      const proj = String(args.projectPath || "").replace(/[\\/]+$/, "")
      if (!proj) return { ok: false, error: "missing projectPath" }
      const core = await loadErrorParsers()
      if (!core || !core.findDiagnostics) return { ok: false, error: "renpy-core.js 加载失败（诊断器不可用）；请在插件 config 提供 corePath" }
      // 递归收集 game/ 下 .rpy
      const rpyFiles = []
      const walkRpy = async (dir, prefix) => {
        let entries = []
        try { entries = await ctx.fs.listDir(await ctx.fs.resolve(dir)) } catch (e) { return }
        for (const e of entries) {
          if (e.type === "directory") { await walkRpy(dir + "/" + e.name, prefix + e.name + "/"); continue }
          if (!e.name.endsWith(".rpy")) continue
          try {
            const bytes = await ctx.fs.readBytes(await ctx.fs.resolve(dir + "/" + e.name), undefined, 4 * 1024 * 1024)
            rpyFiles.push({ rel: prefix + e.name, content: Buffer.from(bytes).toString("utf8") })
          } catch (err) { /* ignore */ }
        }
      }
      await walkRpy(proj + "/game", "")
      // 资源列表（图片/音频/字体，相对 game/）
      const assets = { images: [], audio: [], fonts: [] }
      const walkAssets = async (dir, prefix) => {
        let entries = []
        try { entries = await ctx.fs.listDir(await ctx.fs.resolve(dir)) } catch (e) { return }
        for (const e of entries) {
          if (e.type === "directory") { await walkAssets(dir + "/" + e.name, prefix + e.name + "/"); continue }
          const ext = /\.([^.]+)$/.exec(e.name)
          const x = ext ? "." + ext[1].toLowerCase() : ""
          const rel = prefix + e.name
          if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"].includes(x)) assets.images.push(rel)
          else if ([".ogg", ".opus", ".mp3", ".wav", ".m4a", ".flac"].includes(x)) assets.audio.push(rel)
          else if ([".ttf", ".otf", ".woff", ".woff2"].includes(x)) assets.fonts.push(rel)
        }
      }
      await walkAssets(proj + "/game", "")
      const diag = core.findDiagnostics(rpyFiles, assets)
      const items = args.kind ? (diag.items || []).filter((it) => it.kind === args.kind) : diag.items
      return { project: proj, files: rpyFiles.length, items, counts: diag.counts }
    },
  }))

  // 注册 renpy_guard 工具（写守卫：写入前强制校验缩进/保留名/标签唯一/对白转义）。
  ctx.tools.register(defineTool({
    name: "renpy_guard",
    description: "对将要写入的 .rpy 内容做写守卫校验（四层：indent 缩进混用与 label 块未缩进 / reserved 保留字作 label 或变量名 / " +
      "label_dup 文件内重名与跨文件冲突 / dialogue 对白花括号与插值方括号不配对）。返回 {ok, errors:[{line,kind,msg}]}。" +
      "只报确定错误（动态特性不判），ok=false 时先修正再写入。可选 projectPath：提供后校验跨文件 label 冲突（排除本文件自身）。",
    parameters: {
      content: { type: "string", required: true, description: "将要写入的 .rpy 文件内容（完整文本）" },
      projectPath: { type: "string", description: "Ren'Py 项目目录绝对路径（可选；提供后查跨文件 label 冲突）" },
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render(_args, value) {
        const v = value || {}
        if (v.error) return [{ type: "text", text: "renpy_guard error: " + String(v.error) }]
        if (v.ok) return [{ type: "text", text: "renpy_guard ok — 守卫通过（0 问题）" }]
        const parts = ["renpy_guard FAIL — " + (v.errors || []).length + " 个问题，先修正再写入："]
        for (const e of v.errors || []) parts.push("  L" + e.line + " [" + e.kind + "] " + e.msg)
        return [{ type: "text", text: parts.join("\n") }]
      },
    },
    async execute(args, exec) {
      const core = await loadErrorParsers()
      if (!core || !core.guardRpy) return { ok: false, error: "renpy-core.js 加载失败（守卫不可用）；请在插件 config 提供 corePath" }
      let labels = []
      const proj = String(args.projectPath || "").replace(/[\\/]+$/, "")
      if (proj) {
        const fsRead = async (p) => {
          try {
            const bytes = await ctx.fs.readBytes(await ctx.fs.resolve(p), undefined, 4 * 1024 * 1024)
            return Buffer.from(bytes).toString("utf8")
          } catch (e) { return null }
        }
        const walk = async (dir, prefix, out) => {
          let entries = []
          try { entries = await ctx.fs.listDir(await ctx.fs.resolve(dir)) } catch (e) { return }
          for (const e of entries) {
            if (e.type === "directory") { await walk(dir + "/" + e.name, prefix + e.name + "/", out); continue }
            if (!e.name.endsWith(".rpy")) continue
            const content = await fsRead(dir + "/" + e.name)
            if (!content) continue
            for (const line of content.split(/\r?\n/)) {
              const m = /^label\s+([A-Za-z_]\w*)/.exec(line.trim())
              if (m) out.push(m[1])
            }
          }
        }
        await walk(proj + "/game", "", labels)
      }
      const r = core.guardRpy(String(args.content || ""), { labels })
      return { ok: r.ok, errors: r.errors }
    },
  }))

  ctx.tools.register(defineTool({
    name: "renpy_read_error",
    description: "结构化读取 Ren'Py 项目的报错落盘文件（项目根目录的 traceback.txt / log.txt / errors.txt，" +
      "游戏崩溃或 lint 失败时引擎自动生成）。返回：traceback（异常类型/消息/完整栈帧/根因帧=最深的 game/ 脚本帧/运行位置）、" +
      "log（头部+条目+内嵌错误）、errors（lint 错误列表，file/line 可直接定位跳转）。文件不存在时对应字段为 null（files 标记哪些存在）。" +
      "修 bug 先调本工具拿根因摘要，再配合 renpy_read 读源码定位。",
    parameters: {
      projectPath: { type: "string", required: true, description: "Ren'Py 项目目录的绝对路径（含 game/ 的目录）" },
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render(_args, value) {
        const v = value || {}
        const have = ["traceback", "log", "errors"].filter((k) => v.files && v.files[k])
        const head = "renpy_read_error files=" + (have.join("+") || "none")
        const parts = [head]
        if (v.traceback) {
          const t = v.traceback
          parts.push("异常: " + (t.exception ? t.exception.type + ": " + t.exception.message : "—") +
            "\n根因帧: " + (t.rootFrame ? t.rootFrame.file + ":" + t.rootFrame.line : "—") +
            (t.whileRunning ? "\n运行位置: " + t.whileRunning.file + ":" + t.whileRunning.line : "") +
            "\n栈帧: " + (t.frames || []).map((f) => f.file + ":" + f.line).join(" → "))
        }
        if (v.errors && (v.errors.errors || []).length) {
          parts.push("lint 错误 " + v.errors.errors.length + " 条:\n" + v.errors.errors.map((e) => e.file + ":" + e.line + " " + e.message).join("\n"))
        }
        if (v.log && (v.log.errors || []).length) {
          parts.push("log 内嵌错误 " + v.log.errors.length + " 段: " + v.log.errors.map((e) => e.kind + ": " + e.message).join(" | "))
        }
        return [{ type: "text", text: parts.join("\n\n") }]
      },
    },
    async execute(args, exec) {
      const proj = String(args.projectPath || "").replace(/[\\/]+$/, "")
      if (!proj) return { ok: false, error: "missing projectPath" }
      const core = await loadErrorParsers()
      if (!core) return { ok: false, error: "renpy-core.js 加载失败（报错解析器不可用）；请在插件 config 提供 corePath" }
      const fsRead = async (name) => {
        try {
          const resolved = await ctx.fs.resolve(proj + "/" + name)
          const bytes = await ctx.fs.readBytes(resolved, undefined, 8 * 1024 * 1024)
          return Buffer.from(bytes).toString("utf8")
        } catch (e) { return null }
      }
      const [tb, lg, er] = await Promise.all([fsRead("traceback.txt"), fsRead("log.txt"), fsRead("errors.txt")])
      return {
        project: proj,
        files: { traceback: !!tb, log: !!lg, errors: !!er },
        traceback: tb ? core.parseTraceback(tb) : null,
        log: lg ? core.parseLog(lg) : null,
        errors: er ? core.parseErrors(er) : null,
      }
    },
  }))

  // 注册 renpy_route_generate 工具（设计文档闭环的生成环节：route-map.json → .rpy 骨架）。
  ctx.tools.register(defineTool({
    name: "renpy_route_generate",
    description: "把 route-map.json（状态机结构，schema 见 .research/route-map-schema.md）生成为 .rpy 代码骨架。" +
      "设计文档→代码闭环：先用 renpy-route skill 规范把设计文档整理为 route-map.json（states/transitions/variables/meta），" +
      "写入文件后调用本工具生成 .rpy，随后用 renpy_lint 验证。生成器映射：menu→菜单、conditional→if-elif-else/离散 match、" +
      "jump/call→语句、ending→return、entryActions→$ 赋值、default/define→变量声明；meta.pending 与缺失目标标注为 # TODO。",
    parameters: {
      jsonPath: { type: "string", required: true, description: "route-map.json 的绝对路径" },
      outPath: { type: "string", description: "输出 .rpy 的绝对路径（默认 jsonPath 同目录的 <名>_generated.rpy）" },
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render(_args, value) {
        const v = value || {}
        const head = "renpy_route_generate exit=" + String(v.exitCode) + " → " + String(v.outPath || "")
        const body = String(v.stdout || "") + (v.stderr ? "\n[stderr]\n" + String(v.stderr) : "")
        return [{ type: "text", text: head + (body ? "\n\n" + body : "") }]
      },
    },
    async execute(args, exec) {
      const out = args.outPath || String(args.jsonPath).replace(/\.json$/i, "") + "_generated.rpy"
      const cmd = "node " + q(generatorPath) + " " + q(args.jsonPath) + " " + q(out)
      const policy = resolvePolicy(exec)
      const spec = ctx.shell.resolve({
        command: cmd,
        workdir: sdkPath,
        env: { RENPY_PATH_TO_SAVES: userDir },
        timeoutMs: 30000,
        ...(policy !== undefined ? { sandboxPolicy: policy } : {}),
      })
      const result = await ctx.shell.run(spec)
      return { exitCode: result.exitCode, outPath: out, stdout: result.stdout.text, stderr: result.stderr.text }
    },
  }))

  // 注册 renpy_scaffold 工具。
  ctx.tools.register(defineTool({
    name: "renpy_scaffold",
    description: "创建一个新的 Ren'Py 项目：生成目录结构、project.json，并用 SDK 的 gui 模板生成 options/gui/screens/script（generate_gui --start）。",
    parameters: {
      targetDir: {
        type: "string",
        required: true,
        description: "新项目目录的绝对路径（不存在则创建）。",
      },
      name: {
        type: "string",
        description: "项目显示名（默认取目录名）。",
      },
      width: {
        type: "number",
        description: "GUI 初始宽度（默认 1280）。",
      },
      height: {
        type: "number",
        description: "GUI 初始高度（默认 720）。",
      },
      accent: {
        type: "string",
        description: "GUI 主题强调色（默认 #00b8c3）。",
      },
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render(_args, value) {
        const v = value || {}
        const head = "renpy_scaffold exit=" + String(v.exitCode) + " -> " + String(v.gameDir || "")
        const files = (v.files || []).join(", ")
        return [{ type: "text", text: head + (files ? "\nfiles: " + files : "") + (v.error ? "\nerror: " + String(v.error) : "") }]
      },
    },
    async execute(args, exec) {
      return scaffoldProject(args.targetDir, args, exec)
    },
  }))

  // ── P2 工具注册 ──────────────────────────────────────────────────────────

  ctx.tools.register(defineTool({
    name: "renpy_run",
    description: "启动 Ren'Py 游戏（真实窗口，与 SDK 一致）。若该项目已在运行则先停止旧进程。返回后游戏在后台持续运行；用 renpy_status 查状态、renpy_stop 停止。",
    parameters: {
      projectPath: { type: "string", required: true, description: "项目目录绝对路径（含 game/）。" },
      warp: { type: "string", description: "可选：--warp 快进参数（如 3.0 或标签名）。" },
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render(_args, value) {
        const v = value || {}
        return [{ type: "text", text: "renpy_run " + (v.started ? "已启动" : "失败") + " " + String(v.projectPath || "") + (v.note ? "\n" + String(v.note) : "") }]
      },
    },
    async execute(args, exec) {
      return runGame(args.projectPath, args, exec)
    },
  }))

  ctx.tools.register(defineTool({
    name: "renpy_stop",
    description: "停止正在运行的 Ren'Py 游戏进程（按项目路径）。",
    parameters: {
      projectPath: { type: "string", required: true, description: "项目目录绝对路径。" },
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render(_args, value) {
        const v = value || {}
        return [{ type: "text", text: "renpy_stop " + (v.stopped ? "已停止" : "无运行进程") + " " + String(v.projectPath || "") }]
      },
    },
    async execute(args) {
      return stopGame(args.projectPath)
    },
  }))

  ctx.tools.register(defineTool({
    name: "renpy_status",
    description: "查询 Ren'Py 游戏进程状态（运行中/已退出/退出码）+ 最近输出（增量，消费式）。",
    parameters: {
      projectPath: { type: "string", required: true, description: "项目目录绝对路径。" },
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render(_args, value) {
        const v = value || {}
        const head = "renpy_status " + (v.running ? "运行中" : "未运行") + " status=" + String(v.status || "") + " exitCode=" + String(v.exitCode === null || v.exitCode === undefined ? "" : v.exitCode)
        return [{ type: "text", text: head + (v.output ? "\n" + String(v.output) : "") }]
      },
    },
    async execute(args) {
      return statusGame(args.projectPath)
    },
  }))

  ctx.tools.register(defineTool({
    name: "renpy_test",
    description: "运行 Ren'Py 自动化测试（rpytest，headless），返回退出码与测试输出。",
    parameters: {
      projectPath: { type: "string", required: true, description: "项目目录绝对路径。" },
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render(_args, value) {
        const v = value || {}
        const head = "renpy_test exit=" + String(v.exitCode) + (v.timedOut ? " (timed out)" : "")
        return [{ type: "text", text: head + (v.stdout ? "\n" + String(v.stdout) : "") + (v.stderr ? "\n[stderr]\n" + String(v.stderr) : "") }]
      },
    },
    async execute(args, exec) {
      return testProject(args.projectPath, {}, exec)
    },
  }))

  ctx.tools.register(defineTool({
    name: "renpy_compile",
    description: "强制重编译 Ren'Py 脚本（.rpy → .rpyc），返回退出码与输出。",
    parameters: {
      projectPath: { type: "string", required: true, description: "项目目录绝对路径。" },
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render(_args, value) {
        const v = value || {}
        const head = "renpy_compile exit=" + String(v.exitCode) + (v.timedOut ? " (timed out)" : "")
        return [{ type: "text", text: head + (v.stdout ? "\n" + String(v.stdout) : "") + (v.stderr ? "\n[stderr]\n" + String(v.stderr) : "") }]
      },
    },
    async execute(args, exec) {
      return compileProject(args.projectPath, {}, exec)
    },
  }))

  ctx.tools.register(defineTool({
    name: "renpy_screenshot",
    description: "整屏截图保存为 PNG（画面验证用：默认优先给用户看/让用户确认；用户要求你检查画面且模型支持读图时，再用 read_image 查看该文件）。",
    parameters: {},
    output: {
      schema: { type: "object", additionalProperties: true },
      render(_args, value) {
        const v = value || {}
        return [{ type: "text", text: "renpy_screenshot exit=" + String(v.exitCode) + "\nfile: " + String(v.file || "") + (v.stderr ? "\n[stderr]\n" + String(v.stderr) : "") }]
      },
    },
    async execute(args, exec) {
      return screenshot(args, exec)
    },
  }))
}
