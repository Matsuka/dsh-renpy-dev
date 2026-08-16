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
    description: "整屏截图保存为 PNG（用于查看运行中的游戏画面；agent 可再用 read_image 工具查看该文件）。",
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
