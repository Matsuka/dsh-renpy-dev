// Ren'Py 开发模式 — web profile 宿主侧插件（正式版）
// 职责：注册 /renpy-dev/* webServer 路由，供客户端面板 fetch 调用。
// 能力：项目信息/文件树/读写/lint/运行/停止/截图/索引 + 编辑器 CSS。
// 沙箱：按会话解析 sandboxPolicy（query 带 session id）。
'use strict'

const { lineDiff, hasOpenToolCall, layoutRouteMap, computeRouteMeta, parseTraceback, parseLog, parseErrors, findDiagnostics, guardRpy, mergeSettings } = require('./renpy-core')
const path = require('path')

const name = 'renpy-dev'

const inject = ['webServer', 'shell', 'sandboxPolicy', 'sessions', 'fs', 'timer']

function apply(ctx, config) {
  // ── 部署配置解析（优先级：插件 config > $DSH_HOME/renpy.config.json > 环境变量 > 默认推导）──
  // 发布包在目标机器上运行，禁止硬编码开发机路径；deploy.ps1 会生成
  // $DSH_HOME/renpy.config.json（含 sdkPath/userDir/indexerPath/skillRoot）。
  const dshHome = process.env.DSH_HOME || (process.env.USERPROFILE ? process.env.USERPROFILE + '/.dsh' : '')
  let deployCfg = null
  try {
    const fsMod = require('fs')
    const cfgPath = dshHome + '/renpy.config.json'
    if (fsMod.existsSync(cfgPath)) deployCfg = JSON.parse(fsMod.readFileSync(cfgPath, 'utf8'))
  } catch (e) { deployCfg = null }
  const cfg = (k, fallback) => {
    if (config && config[k]) return config[k]
    if (deployCfg && deployCfg[k]) return deployCfg[k]
    if (process.env['RENPY_' + k.toUpperCase()]) return process.env['RENPY_' + k.toUpperCase()]
    return fallback
  }
  const sdkPath = cfg('sdkPath', '')
  if (!sdkPath) {
    throw new Error('dsh-renpy-dev-client: 缺少 sdkPath。请运行发布包内的 deploy.ps1 配置 SDK 路径（写入 ' + dshHome + '/renpy.config.json），或设置 RENPY_SDK_PATH 环境变量，或在插件 config 中提供 sdkPath。')
  }
  const python = sdkPath + '/lib/py3-windows-x86_64/python.exe'
  const renpyPy = sdkPath + '/renpy.py'
  const launcher = sdkPath + '/launcher'
  const userDir = cfg('userDir', sdkPath + '/../.renpy-user')
  const defaultProject = cfg('defaultProject', '') // 工作台默认工程（无本地持久化值时使用）

  // 桥接脚本（注入项目 game/_debug_bridge.rpy）：
  //   - 指令：轮询项目 game/_route_cmd.json（action=warp 跳转 / action=screenshot 截图）
  //   - 回报：限频 0.5s 写 game/_route_status.json（label + file:line + vars 快照 + shot_at + 时间戳）
  const BRIDGE_RPY = `# dsh-renpy-dev 调试桥接（自动注入，勿删）
init python:
    import json, os, time
    _bridge_cmd = os.path.join(renpy.config.basedir, 'game', '_route_cmd.json')
    _bridge_status = os.path.join(renpy.config.basedir, 'game', '_route_status.json')
    _bridge_shot = os.path.join(renpy.config.basedir, 'game', '_shot.png')
    _bridge_label = None
    _bridge_last = 0.0
    _bridge_shot_at = 0
    _bridge_shot_err = None
    _bridge_vars_err = None
    _bridge_last_click = None
    # Ren'Py 引擎公开 store 全局（无 _ 前缀但属内部）：监控表噪音，过滤
    _bridge_store_noise = ('PY2', 'basestring', 'main_menu', 'mouse_visible', 'suppress_overlay', 'save_name', 'nvl_list', 'menu', 'renpy')
    def _bridge_on_label(name, abnormal):
        global _bridge_label
        _bridge_label = name
    def _bridge_collect_vars():
        # store 变量快照：过滤内部（_ 前缀 / dunder），基本类型直出，容器限深 3 层/50 项/字符串截断
        # 注意：必须 list() 快照遍历——store 字典可能在遍历中被脚本修改（dictionary changed size）
        global _bridge_vars_err
        def ser(v, depth):
            if depth > 3:
                return '…'
            if v is None or isinstance(v, (bool, int, float)):
                return v
            if isinstance(v, str):
                return v[:80] + ('…' if len(v) > 80 else '')
            if isinstance(v, (list, tuple)):
                return [ser(x, depth + 1) for x in v[:50]]
            if isinstance(v, dict):
                out = {}
                for i, (kk, vv) in enumerate(v.items()):
                    if i >= 50:
                        break
                    out[str(kk)[:40]] = ser(vv, depth + 1)
                return out
            return None
        try:
            out = {}
            for k, v in list(renpy.store.__dict__.items()):
                if k.startswith('_') or k in _bridge_store_noise:
                    continue
                sv = ser(v, 0)
                if sv is not None:
                    out[k] = sv
            _bridge_vars_err = None
            return out
        except Exception as e:
            _bridge_vars_err = repr(e)
            return {}
    def _bridge_take_shot():
        global _bridge_shot_at, _bridge_shot_err
        try:
            # 截图用游戏虚拟分辨率：画面窗口点击坐标可 1:1 映射回游戏
            data = renpy.screenshot_to_bytes((renpy.config.screen_width, renpy.config.screen_height))
            if data:
                tmp = _bridge_shot + '.tmp'
                with open(tmp, 'wb') as fh:
                    fh.write(data)
                os.replace(tmp, _bridge_shot)
                _bridge_shot_at = int(time.time() * 1000)
                _bridge_shot_err = None
            else:
                _bridge_shot_err = 'screenshot_to_bytes returned None'
        except Exception as e:
            _bridge_shot_err = repr(e)
    def _bridge_poll():
        global _bridge_last
        try:
            now = time.time()
            # ① 当前位置回报（限频 0.5s；含变量快照）
            try:
                if now - _bridge_last >= 0.5:
                    _bridge_last = now
                    try:
                        f, l = renpy.get_filename_line()
                        status = { 'label': _bridge_label, 'file': f.replace('\\\\', '/'), 'line': l, 'vars': _bridge_collect_vars(), 'vars_err': _bridge_vars_err, 'shot_at': _bridge_shot_at, 'shot_err': _bridge_shot_err, 'last_click': _bridge_last_click, 'at': int(now * 1000) }
                        tmp = _bridge_status + '.tmp'
                        with open(tmp, 'w', encoding='utf-8') as fh:
                            json.dump(status, fh)
                        os.replace(tmp, _bridge_status)
                    except Exception:
                        pass
            except Exception:
                pass
            # ② 指令处理——warp 不包 except（FullRestartException 必须穿行到主循环）
            if os.path.exists(_bridge_cmd):
                with open(_bridge_cmd, 'r', encoding='utf-8') as fh:
                    cmd = json.load(fh)
                os.remove(_bridge_cmd)
                if cmd.get('action') == 'warp' and cmd.get('spec'):
                    renpy.warp.warp_spec = cmd['spec']
                    renpy.exports.full_restart()
                elif cmd.get('action') == 'screenshot':
                    _bridge_take_shot()
                elif cmd.get('action') == 'dismiss':
                    renpy.queue_event('dismiss')
                elif cmd.get('action') == 'rollback':
                    renpy.queue_event('rollback')
                elif cmd.get('action') == 'click' and cmd.get('x') is not None and cmd.get('y') is not None:
                    # 注入 pygame 鼠标事件（Button 只认 pygame 类型事件；且需先移动鼠标获得焦点）：
                    # ① set_mouse_pos 移动鼠标到虚拟坐标（内部换算物理坐标，按钮聚焦）
                    # ② post MOUSEMOTION + MOUSEBUTTONDOWN + MOUSEBUTTONUP（pos 为物理坐标）
                    global _bridge_last_click
                    try:
                        renpy.set_mouse_pos(cmd['x'], cmd['y'])
                        pw, ph = renpy.get_physical_size()
                        sx = int(cmd['x'] * pw / renpy.config.screen_width)
                        sy = int(cmd['y'] * ph / renpy.config.screen_height)
                        renpy.pygame.event.post(renpy.pygame.event.Event(renpy.pygame.MOUSEMOTION, pos=(sx, sy), rel=(0, 0), buttons=(0, 0, 0)))
                        renpy.pygame.event.post(renpy.pygame.event.Event(renpy.pygame.MOUSEBUTTONDOWN, pos=(sx, sy), button=1))
                        renpy.pygame.event.post(renpy.pygame.event.Event(renpy.pygame.MOUSEBUTTONUP, pos=(sx, sy), button=1))
                        _bridge_last_click = { 'v': (cmd['x'], cmd['y']), 'p': (sx, sy), 'phys': (pw, ph), 'at': int(time.time() * 1000) }
                    except Exception as e:
                        _bridge_last_click = { 'err': repr(e), 'at': int(time.time() * 1000) }
                elif cmd.get('action') == 'nav':
                    # 菜单键盘导航（EVENTNAME 机制，headless 也可靠）：focus_up/down 移动 + button_select 确认
                    try:
                        if cmd.get('dir') in ('up', 'down', 'left', 'right'):
                            renpy.queue_event('focus_' + cmd['dir'])
                        if cmd.get('select'):
                            renpy.queue_event('button_select')
                    except Exception:
                        pass
        except renpy.game.FullRestartException:
            raise
        except Exception:
            pass
    config.label_callbacks.append(_bridge_on_label)
    config.periodic_callbacks.append(_bridge_poll)
`
  // 注入桥接：写 bridge 文件到项目 game/
  const injectBridge = async (project, session) => {
    try {
      const bridgePath = path.join(project, 'game', '_debug_bridge.rpy')
      await writeText(bridgePath, BRIDGE_RPY, session)
      return true
    } catch (e) { return false }
  }
  const indexerPath = cfg('indexerPath', dshHome + '/.agent-presets/renpy/plugins/indexer.py')
  const skillRoot = cfg('skillRoot', dshHome + '/skills')
  const running = new Map()

  const q = (p) => "'" + String(p).replace(/'/g, "''") + "'"
  const basename = (p) => String(p).split(/[\\/]/).pop() || 'project'

  const policyOf = (session) => {
    try {
      if (session) return ctx.sandboxPolicy.resolve({ session })
      const s = ctx.sessions.list()[0]
      if (s) return ctx.sandboxPolicy.resolve({ session: s })
      return undefined
    } catch (e) {
      return undefined
    }
  }

  const specOf = (cmd, timeout, session) => {
    const policy = policyOf(session)
    const r = { command: cmd, workdir: sdkPath, env: { RENPY_PATH_TO_SAVES: userDir }, timeoutMs: timeout || 180000, stdoutMaxBytes: 4 * 1024 * 1024 }
    if (policy !== undefined) r.sandboxPolicy = policy
    return ctx.shell.resolve(r)
  }

  // 浏览器文件夹选择（<input webkitdirectory>）拿不到绝对路径（fakepath 限制）——
  // 按文件夹名 + 特征文件（有 game/ 或 .rpy）在候选根中定位绝对路径。
  // 候选根：client 传入的起始目录（当前工程父目录）> 用户目录/Documents/Desktop/OneDrive > dshHome > 各盘根。
  const SKIP_DIRS = new Set(['appdata', 'windows', 'program files', 'program files (x86)', 'programdata', '$recycle.bin', 'system volume information', 'node_modules', '.git', '.hg', '.svn', 'venv', '.venv', '__pycache__', '.renpy-user', 'renpy-8.5.3-sdk'])
  const resolveFolder = async (name, startDirs) => {
    if (!name) return { error: 'missing folder name' }
    const roots = []
    const push = (p) => { if (p && roots.indexOf(p) < 0) roots.push(String(p).replace(/[\\/]+$/, '')) }
    for (const d of (startDirs || [])) push(d)
    const home = process.env.USERPROFILE || ''
    if (home) { push(home); push(home + '/Documents'); push(home + '/Desktop'); push(home + '/OneDrive/Documents') }
    push(dshHome)
    for (let c = 65; c <= 90; c++) {
      const letter = String.fromCharCode(c) + ':'
      let st = null
      try { st = await ctx.fs.stat(await ctx.fs.resolve(letter + '/')) } catch (e) { continue }
      if (st) push(letter)
    }
    const find = async (root, target, depth, maxDepth) => {
      if (depth > maxDepth) return null
      let entries
      try { entries = await ctx.fs.listDir(await ctx.fs.resolve(root)) } catch (e) { return null }
      for (const e of entries) {
        if (e.type !== 'directory') continue
        const base = String(e.name || '').toLowerCase()
        if (SKIP_DIRS.has(base)) continue
        const full = root + '/' + e.name
        if (e.name === target) {
          let sub = []
          try { sub = await ctx.fs.listDir(await ctx.fs.resolve(full)) } catch (e2) { /* ignore */ }
          const hasGame = sub.some((s) => s.type === 'directory' && String(s.name).toLowerCase() === 'game')
          const hasRpy = sub.some((s) => String(s.name).endsWith('.rpy'))
          if (hasGame || hasRpy) return full
        }
        const hit = await find(full, target, depth + 1, maxDepth)
        if (hit) return hit
      }
      return null
    }
    // 起始目录/文档/桌面深 4（用户项目常见位置），其余（盘根等）深 2 防慢
    const seq = roots.map((r, i) => ({ r, max: i < 3 ? 4 : 2 }))
    for (const { r, max } of seq) {
      const hit = await find(r, name, 0, max)
      if (hit) return { path: hit }
    }
    return { path: null }
  }

  const readText = async (p) => ctx.fs.readText(await ctx.fs.resolve(p))
  const writeText = async (p, c, session) => {
    const policy = policyOf(session)
    const target = await ctx.fs.resolve(p)
    if (policy !== undefined) return ctx.fs.writeText(target, c, undefined, undefined, policy)
    return ctx.fs.writeText(target, c)
  }

  // 收集项目 game/ 下其他文件的 label 名（排除 excludeRel，供写守卫跨文件冲突检测）
  const labelsOfProject = async (project, excludeRel) => {
    const labels = []
    const walk = async (dir, prefix) => {
      let entries
      try { entries = await ctx.fs.listDir(await ctx.fs.resolve(dir)) } catch (e) { return }
      for (const e of entries) {
        if (e.type === 'directory') { await walk(dir + '/' + e.name, prefix + e.name + '/'); continue }
        if (!e.name.endsWith('.rpy')) continue
        const rel = prefix + e.name
        if (rel === excludeRel) continue
        try {
          const content = await readText(dir + '/' + e.name)
          for (const line of content.split(/\r?\n/)) {
            const m = /^label\s+([A-Za-z_]\w*)/.exec(line.trim())
            if (m) labels.push(m[1])
          }
        } catch (err) { /* ignore */ }
      }
    }
    await walk(project.replace(/[\\/]+$/, '') + '/game', '')
    return labels
  }

  // ── 个性化配置存储（分层：全局 userDir/settings.json + 项目级 userDir/settings/<projectKey>.json；
  //    全部在 userDir 内，不写 Ren'Py 项目目录——保持项目零痕迹；配置体系借鉴 VSCode（MIT）） ──
  const settingsGlobalFile = () => userDir + '/settings.json'
  const settingsProjectFile = (project) => userDir + '/settings/' + backupsKey(project) + '.json'
  const settingsGet = async (project) => {
    const read = async (p) => { try { return JSON.parse(await readText(p)) } catch (e) { return null } }
    const globalCfg = await read(settingsGlobalFile())
    const projectCfg = project ? await read(settingsProjectFile(project)) : null
    return { global: globalCfg || {}, project: projectCfg || {}, merged: mergeSettings(globalCfg || {}, projectCfg || {}) }
  }
  const settingsSave = async (project, globalCfg, projectCfg, session) => {
    if (globalCfg !== undefined) await writeText(settingsGlobalFile(), JSON.stringify(globalCfg || {}, null, 2), session)
    if (project && projectCfg !== undefined) await writeText(settingsProjectFile(project), JSON.stringify(projectCfg || {}, null, 2), session)
    return { ok: true }
  }

  // ── 保存历史备份：write-file 前把旧版本存入 userDir/backups/<projectKey>/<rel>/<ts>.bak ──
  // 文件名 = 时间戳 + 递增序号（同毫秒多次保存不互相覆盖——测试批量跑曾踩此坑）
  let backupSeq = 0
  const backupsKey = (project) => basename(project) + '-' + hashStr(project)
  const backupOf = async (absPath, rel, session) => {
    try {
      const target = await ctx.fs.resolve(absPath)
      const st = await ctx.fs.stat(target)
      if (!st) return
      const old = await ctx.fs.readText(target)
      const project = String(absPath).replace(/[\\/]game[\\/].*$/, '')
      const file = userDir + '/backups/' + backupsKey(project) + '/' + rel + '/' + String(Date.now()) + '-' + (++backupSeq) + '.bak'
      await writeText(file, old, session) // writeText 自动递归建父目录
    } catch (e) { /* 备份失败不阻断保存 */ }
  }
  const listHistory = async (project, rel) => {
    const dir = userDir + '/backups/' + backupsKey(project) + '/' + rel
    let entries = []
    try { entries = await ctx.fs.listDir(await ctx.fs.resolve(dir)) } catch (e) { return [] }
    const out = []
    for (const e of entries) {
      if (!e.name.endsWith('.bak')) continue
      let size = 0
      try { const st = await ctx.fs.stat(e.target); size = (st && st.size) || 0 } catch (err) { /* ignore */ }
      out.push({ time: e.name.replace(/\.bak$/, ''), size })
    }
    return out.sort((a, b) => b.time.localeCompare(a.time))
  }
  const readHistoryFile = async (project, rel, time) => {
    const file = userDir + '/backups/' + backupsKey(project) + '/' + rel + '/' + time + '.bak'
    return { content: await readText(file) }
  }
  const restoreBackup = async (project, rel, time, session) => {
    const file = userDir + '/backups/' + backupsKey(project) + '/' + rel + '/' + time + '.bak'
    const content = await readText(file)
    await writeText(project + '/game/' + rel, content, session)
    return { ok: true, file: rel, time }
  }

  // ── 工作区域：锁定编辑范围 + 注入对话上下文（模型可见面 user/message） ──
  const wsFileFor = (project) => userDir + '/workspace/' + backupsKey(project) + '.json'
  const workspaceGet = async (project) => {
    try { return JSON.parse(await readText(wsFileFor(project))) } catch (e) { return null }
  }
  // 挂起工具调用检测见 renpy-core.js（hasOpenToolCall）：从会话尾部往前找到
  // 第一条 surface 消息。若它是 assistant 且 content 带 tool-call 块（其后
  // 再无 tool/result 闭合），说明 agent 正等待工具结果——此时往会话 append
  // user/message 会插在 assistant(tool_calls) 与 tool(result) 之间，违反
  // OpenAI 消息配对协议，模型 API 以 400 拒绝，并从此损坏整轮消息历史。
  // 检测到挂起时必须延迟注入，等工具结果落地后再追加（见 injectWorkspaceMsg）。
  const sessionAppendWsMsg = (session, text) => {
    const msg = { id: 'renpy-ws-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), role: 'user', content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'dsh-renpy-dev-client', form: 'instructions' } }
    session.append('user/message', msg, { surfaceOp: 'append' })
  }
  const pendingWs = new Map() // sessionId -> { text, at }
  let wsFlushTimer = null
  const flushPendingWs = () => {
    wsFlushTimer = null
    for (const [sid, entry] of [...pendingWs]) {
      let s
      try { s = ctx.sessions.get(sid) } catch (e) { s = undefined }
      if (!s || Date.now() - entry.at > 600000) { pendingWs.delete(sid); continue } // 会话已失效或等待超时（10min）则丢弃
      if (hasOpenToolCall(s)) continue // 工具结果未落地，继续等
      pendingWs.delete(sid)
      try { sessionAppendWsMsg(s, entry.text) } catch (e) { /* 注入失败不阻断 */ }
    }
    if (pendingWs.size > 0) wsFlushTimer = setTimeout(flushPendingWs, 300)
  }
  const injectWorkspaceMsg = (session, project, ws, cleared) => {
    if (!session) return
    try {
      let text
      if (cleared) {
        text = '【工作区域｜已解除】之前的工作区域约束已解除。现在你可以自由修改项目的任何部分；若后续再出现【工作区域】指示，以新的为准。'
      } else {
        text = '【工作区域｜高优先级约束】当前会话的工作范围已设置：文件 ' + ws.file + '，第 ' + ws.startLine + '-' + ws.endLine + ' 行' + (ws.label ? '（label ' + ws.label + '）' : '') + '。这是你必须遵守的高优先级指示：请把你的修改限定在该区域内，区域外的代码保持不动。Ren' + "'" + 'Py 脚本按顺序执行，越界修改会破坏执行上下文。如果用户的需求需要修改区域外的代码，先向用户说明并征得同意，不要擅自越界修改。'
      }
      if (hasOpenToolCall(session)) {
        // agent 正等待工具结果：延迟注入，避免破坏 assistant tool_calls ↔ tool 消息配对
        pendingWs.set(session.id, { text, at: Date.now() })
        if (!wsFlushTimer) wsFlushTimer = setTimeout(flushPendingWs, 300)
        return
      }
      sessionAppendWsMsg(session, text)
    } catch (e) { /* 注入失败不阻断 */ }
  }
  const workspaceSet = async (project, ws, sessionId) => {
    const data = { active: true, file: ws.file, startLine: ws.startLine, endLine: ws.endLine, label: ws.label || '', updatedAt: Date.now() }
    await writeText(wsFileFor(project), JSON.stringify(data), undefined)
    let s = undefined
    try { s = sessionId ? ctx.sessions.get(sessionId) : ctx.sessions.list()[0] } catch (e) { s = undefined }
    injectWorkspaceMsg(s, project, data, false)
    return { ok: true, workspace: data }
  }
  const workspaceClear = async (project, sessionId) => {
    try { await writeText(wsFileFor(project), JSON.stringify({ active: false, updatedAt: Date.now() }), undefined) } catch (e) { /* ignore */ }
    let s = undefined
    try { s = sessionId ? ctx.sessions.get(sessionId) : ctx.sessions.list()[0] } catch (e) { s = undefined }
    injectWorkspaceMsg(s, project, null, true)
    return { ok: true }
  }
  // 跨会话注入：只把当前项目的工作区域 append 到指定会话（不写文件、不改存储），供新会话加载项目时调用
  const workspaceInject = async (project, sessionId) => {
    const ws = await workspaceGet(project)
    if (!ws || !ws.active) return { ok: true, injected: false }
    let s = undefined
    try { s = sessionId ? ctx.sessions.get(sessionId) : ctx.sessions.list()[0] } catch (e) { s = undefined }
    injectWorkspaceMsg(s, project, ws, false)
    return { ok: true, injected: true, workspace: ws }
  }

  // ── 检查点：game/ 文本快照 + 行级 diff + 接受/撤回 ──
  const TEXT_EXT = ['.rpy', '.py', '.json', '.txt', '.md', '.ini', '.tmpl', '.yml', '.yaml', '.toml', '.cfg', '.conf', '.csv', '.html', '.css', '.js', '.ts', '.jsx', '.tsx', '.xml', '.log']
  const isTextFile = (name) => {
    const m = /\.([^.]+)$/.exec(name)
    return m ? TEXT_EXT.indexOf('.' + m[1].toLowerCase()) >= 0 : true
  }
  const listProjectFiles = async (project) => {
    const out = []
    const walk = async (dir, prefix) => {
      let entries
      try { entries = await ctx.fs.listDir(await ctx.fs.resolve(dir)) } catch (e) { return }
      for (const e of entries) {
        if (e.type === 'directory') { await walk(dir + '/' + e.name, prefix + e.name + '/'); continue }
        if (e.name.endsWith('.rpyc')) continue
        if (isTextFile(e.name)) out.push(prefix + e.name)
      }
    }
    await walk(project + '/game', '')
    return out
  }
  const cpRoot = (project) => userDir + '/checkpoints/' + backupsKey(project)
  const cpBase = (project, id) => cpRoot(project) + '/' + id + '/baseline'

  // 行级 diff 见模块级 lineDiff（可单测）
  // 持久检查点：每个对话/手动保存自动建一个（id=时间戳），全部保留不清理，用于随时恢复
  const cpCreate = async (project, session) => {
    const id = String(Date.now())
    const files = await listProjectFiles(project)
    let n = 0
    for (const rel of files) {
      try { await writeText(cpBase(project, id) + '/' + rel, await readText(project + '/game/' + rel), session); n++ } catch (e) { /* skip */ }
    }
    return { id, files: n }
  }
  const cpList = async (project) => {
    let entries = []
    try { entries = await ctx.fs.listDir(await ctx.fs.resolve(cpRoot(project))) } catch (e) { return [] }
    const countTree = async (dir) => {
      let total = 0
      try {
        const es = await ctx.fs.listDir(await ctx.fs.resolve(dir))
        for (const e of es) total += e.type === 'directory' ? await countTree(dir + '/' + e.name) : 1
      } catch (err) { /* ignore */ }
      return total
    }
    const out = []
    for (const e of entries) {
      if (e.type !== 'directory') continue
      out.push({ id: e.name, files: await countTree(cpBase(project, e.name)) })
    }
    return out.sort((a, b) => b.id.localeCompare(a.id))
  }
  const cpDiff = async (project, id) => {
    const base = cpBase(project, id)
    let baseFiles = []
    try { baseFiles = (await ctx.fs.listDir(await ctx.fs.resolve(base))).filter((e) => e.type !== 'directory').map((e) => e.name) } catch (e) { baseFiles = [] }
    const curFiles = await listProjectFiles(project)
    const all = Array.from(new Set(baseFiles.concat(curFiles))).sort()
    const files = []
    let added = 0, removed = 0
    for (const rel of all) {
      let oldLines = null, curLines = null
      try { oldLines = (await readText(base + '/' + rel)).split('\n') } catch (e) { /* 基线没有 */ }
      try { curLines = (await readText(project + '/game/' + rel)).split('\n') } catch (e) { /* 当前没有 */ }
      if (oldLines === null && curLines === null) continue
      let fd
      if (oldLines === null) fd = { rel, added: curLines.length, removed: 0, hunks: [{ type: 'add', oldStart: 1, newStart: 1, oldCount: 0, newCount: curLines.length }] }
      else if (curLines === null) fd = { rel, added: 0, removed: oldLines.length, hunks: [{ type: 'del', oldStart: 1, newStart: 1, oldCount: oldLines.length, newCount: 0 }] }
      else { const d = lineDiff(oldLines, curLines); fd = { rel, added: d.added, removed: d.removed, hunks: d.hunks } }
      const lt = []
      for (const h of fd.hunks) {
        if (h.type === 'add' || h.type === 'mod') { for (let k = h.newStart; k < h.newStart + h.newCount; k++) lt[k] = h.type }
        else if (h.type === 'del') lt[h.newStart] = 'del'
      }
      fd.lineTypes = lt
      if (fd.added || fd.removed) { files.push(fd); added += fd.added; removed += fd.removed }
    }
    return { files, summary: { files: files.length, added, removed } }
  }
  const cpAccept = async (project, id, rel, session) => {
    const base = cpBase(project, id)
    if (rel) {
      await writeText(base + '/' + rel, await readText(project + '/game/' + rel), session)
      return { ok: true, rel }
    }
    const curFiles = await listProjectFiles(project)
    for (const r of curFiles) {
      try { await writeText(base + '/' + r, await readText(project + '/game/' + r), session) } catch (e) { /* skip */ }
    }
    return { ok: true, all: true }
  }
  const cpRevert = async (project, id, rel, session) => {
    const base = cpBase(project, id)
    if (rel) {
      await writeText(project + '/game/' + rel, await readText(base + '/' + rel), session)
      return { ok: true, rel }
    }
    let baseFiles = []
    try { baseFiles = (await ctx.fs.listDir(await ctx.fs.resolve(base))).filter((e) => e.type !== 'directory').map((e) => e.name) } catch (e) { /* ignore */ }
    for (const r of baseFiles) {
      try { await writeText(project + '/game/' + r, await readText(base + '/' + r), session) } catch (e) { /* skip */ }
    }
    return { ok: true, all: true }
  }

  const listRpy = async (project) => {
    try {
      const entries = await ctx.fs.listDir(await ctx.fs.resolve(project + '/game'))
      return entries.filter((e) => e.name.endsWith('.rpy')).map((e) => e.name)
    } catch (e) {
      return []
    }
  }

  // ── 素材资源管理器 ─────────────────────────────────────────────────────
  const ASSET_CATS = {
    image: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'],
    audio: ['.ogg', '.opus', '.mp3', '.wav', '.m4a', '.flac'],
    video: ['.webm', '.mp4', '.mov'],
    font: ['.ttf', '.otf', '.woff', '.woff2'],
  }
  const MIME = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
    '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
    '.webm': 'video/webm', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
    '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  }
  const listAssets = async (project) => {
    const result = { image: [], audio: [], video: [], font: [], other: [] }
    const walk = async (dir, prefix) => {
      let entries
      try {
        entries = await ctx.fs.listDir(await ctx.fs.resolve(dir))
      } catch (e) {
        return
      }
      for (const e of entries) {
        if (e.type === 'directory') {
          await walk(dir + '/' + e.name, prefix + e.name + '/')
          continue
        }
        if (e.name.endsWith('.rpy') || e.name.endsWith('.rpyc')) continue
        const m = /\.([^.]+)$/.exec(e.name)
        const ext = m ? '.' + m[1].toLowerCase() : ''
        let cat = 'other'
        if (ASSET_CATS.image.indexOf(ext) >= 0) cat = 'image'
        else if (ASSET_CATS.audio.indexOf(ext) >= 0) cat = 'audio'
        else if (ASSET_CATS.video.indexOf(ext) >= 0) cat = 'video'
        else if (ASSET_CATS.font.indexOf(ext) >= 0) cat = 'font'
        let size = 0
        try {
          const st = await ctx.fs.stat(e.target)
          size = st.size || 0
        } catch (err) { /* ignore */ }
        result[cat].push({ name: e.name, rel: prefix + e.name, size, ext })
      }
    }
    await walk(project + '/game', '')
    for (const k of Object.keys(result)) result[k].sort((a, b) => a.rel.localeCompare(b.rel))
    return result
  }
  const serveAsset = async (project, rel, res) => {
    try {
      const base = await ctx.fs.resolve(project + '/game')
      const target = await ctx.fs.resolve(project + '/game/' + rel)
      if (!ctx.fs.contains(base, target)) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'outside game dir' }))
        return
      }
      const m = /\.([^.]+)$/.exec(rel)
      const ext = m ? '.' + m[1].toLowerCase() : ''
      const bytes = await ctx.fs.readBytes(target, undefined, 32 * 1024 * 1024)
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' })
      res.end(Buffer.from(bytes))
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: (e && e.message) || String(e) }))
    }
  }

  const runLint = async (project, session) => {
    const cmd = '& ' + q(python) + ' ' + q(renpyPy) + ' ' + q(project) + ' lint'
    const r = await ctx.shell.run(specOf(cmd, 180000, session))
    return { exitCode: r.exitCode, output: String(r.stdout.text) + (r.stderr ? '\n[stderr]\n' + String(r.stderr.text) : '') }
  }

  const runTest = async (project, suite, session) => {
    const cmd = '& ' + q(python) + ' ' + q(renpyPy) + ' ' + q(project) + ' test' + (suite ? ' ' + q(suite) : '')
    const r = await ctx.shell.run(specOf(cmd, 300000, session))
    const out = String(r.stdout.text) + (r.stderr ? '\n[stderr]\n' + String(r.stderr.text) : '')
    // 解析 rpytest 报告：passed/failed/xfailed/skipped + Status
    const m = /\[rpytest\] Test cases\s*:\s*\d+\s*\|\s*(\d+) passed\s*\|\s*\d+ xfailed\s*\|\s*(\d+) failed/.exec(out) || /\[rpytest\] Test suites:\s*\d+\s*\|\s*(\d+) passed\s*\|\s*\d+ xfailed\s*\|\s*(\d+) failed/.exec(out)
    const status = /Status: (\w+)/.exec(out)
    return { exitCode: r.exitCode, output: out, passed: m ? parseInt(m[1], 10) : null, failed: m ? parseInt(m[2], 10) : null, status: status ? status[1] : null }
  }

  // 读 SDK 官方文档（学习注释跳转）：doc HTML → 纯文本（剥标签/脚本/样式），按页返回
  const readDoc = async (page) => {
    const base = await ctx.fs.resolve(sdkPath)
    const target = await ctx.fs.resolve(sdkPath + '/doc/' + String(page || '').replace(/[\\/]/g, ''))
    if (!ctx.fs.contains(base, target) || !/\.html$/.test(target)) return { ok: false, error: 'bad doc page' }
    const bytes = await ctx.fs.readBytes(target, undefined, 8 * 1024 * 1024)
    let html = Buffer.from(bytes).toString('utf8')
    // 去掉 script/style，正文区（<main> 或 <div class="body">），剥标签 → 纯文本
    html = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    const main = /<main[\s\S]*?<\/main>/i.exec(html) || /<div class="body"[\s\S]*?<\/div>/i.exec(html)
    if (main) html = main[0]
    const text = html
      .replace(/<h([1-4])[^>]*>/gi, (mm, n) => '\n\n' + '#'.repeat(parseInt(n, 10)) + ' ')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<tr[^>]*>/gi, '\n')
      .replace(/<t[dh][^>]*>/gi, ' | ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#160;|\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
      .trim()
    return { ok: true, page, text: text.slice(0, 12000), full: text.length }
  }

  // 读本 preset 的 renpy-* skill 文件（学习模式的真实知识源；user 层 skill 目录）
  // skillRoot 在 apply 开头解析（renpy.config.json / 环境变量 / config）
  const readSkillFile = async (name) => {
    const safe = String(name || '').replace(/[^a-z0-9-]/gi, '')
    if (!safe) return { ok: false, error: 'bad skill name' }
    const base = await ctx.fs.resolve(skillRoot)
    const target = await ctx.fs.resolve(skillRoot + '/' + safe + '.md')
    if (!ctx.fs.contains(base, target)) return { ok: false, error: 'skill not found: ' + safe }
    try {
      const text = await ctx.fs.readText(target)
      // 剥 frontmatter（--- 到 ---）→ 纯正文
      const body = text.replace(/^---[\s\S]*?---\s*/, '').trim()
      return { ok: true, name: safe, text: body, full: text.length }
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) }
    }
  }

  // 学习模式 AI 教学：读对应 skill 全文 + 代码上下文 → llm.stream 生成针对性讲解（单行核心，teachFile 复用）
  const teachOne = async (req) => {
    const skill = await readSkillFile(req.skill)
    if (!skill.ok) return { ok: false, line: req.line, error: skill.error || 'skill 不可用' }
    const llm = ctx.get('llm')
    if (llm === undefined) return { ok: false, line: req.line, error: 'llm 服务不可用（重启 dsh 后生效）' }
    const adm = ctx.get('agentDefaultModel')
    const sel = adm !== undefined ? adm.currentSelection() : { provider: 'deepseek-official', model: 'deepseek-v4-flash' }
    // 教学 prompt：以 skill 真实内容为知识源（L1 引擎事实），要求针对性解释当前代码行
    const sys = [
      '你是 Ren\'Py 视觉小说引擎的编程教学助手。你的知识源是下面的 renpy-* skill 文档（经过人工核验的引擎事实），' +
        '教学必须严格以它为准，不要臆造 skill 之外的语法细节；若问题超出 skill 覆盖范围，明说"这超出我的技能覆盖，建议查官方文档"。',
      '教学要求（对正在学习 Ren\'Py 的新手）：',
      '1. 用中文讲解，结构清晰：**这段代码在做什么** → **逐点解释**（为什么这样写、各关键字含义）→ **常见坑**（如果 skill 提到）。',
      '2. 引用 skill 原文的关键句时标注来源（skill 名 · 章节标题）。',
      '3. 控制在 150 字以内，一行到三行注释的密度，不要客套，不要用 markdown 标题。',
      '',
      '===== 当前相关 skill：「' + req.skill + '」全文 =====',
      skill.text.slice(0, 8000),
    ].join('\n')
    const user = [
      '我打开了 .rpy 文件「' + (req.file || '?') + '」，第 ' + (req.line || '?') + ' 行：',
      '',
      '```rpy',
      String(req.code || ''),
      '```',
      '',
      req.context ? '上下文（前后几行）：\n```rpy\n' + req.context + '\n```\n' : '',
      '请讲解这一行（将写入为代码上方的注释，150 字内，勿用 markdown 标题/列表符号）。',
    ].join('\n')
    // 手工构造 llm 请求：单一 user 消息 + system（不依赖 createUserMessage，避免 bundle 加载问题）
    const msgs = [{
      id: 'teach-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      role: 'user',
      content: [{ type: 'text', text: user }],
      source: { kind: 'user' },
    }]
    let out = ''
    try {
      // 单条生成超时保护：60s 未完成视为失败（避免批量时挂死）
      const stream = llm.stream({ provider: sel.provider, model: sel.model, system: sys, messages: msgs, maxTokens: 600, temperature: 0.4 })
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('生成超时（60s）')), 60000))
      for await (const chunk of await Promise.race([(async () => stream)(), timeout])) {
        if (chunk && chunk.type === 'text-delta') out += chunk.text
      }
    } catch (e) {
      return { ok: false, line: req.line, error: 'AI 教学失败: ' + String(e && e.message || e) }
    }
    if (!out.trim()) return { ok: false, line: req.line, error: 'AI 未返回内容' }
    return { ok: true, skill: req.skill, line: req.line, text: out.trim() }
  }

  // 批量学习注释（单次调用）：一次 llm 调用为所有行生成注释
  // 实测逐行调用会触发连续调用限流（超时/空响应），单次调用 + 提示词输出 JSON 最稳
  const teachFile = async (req) => {
    const lines = Array.isArray(req.lines) ? req.lines : []
    if (!lines.length) return { ok: false, error: '没有可注释的语句行' }
    const llm = ctx.get('llm')
    if (llm === undefined) return { ok: false, error: 'llm 服务不可用（重启 dsh 后生效）' }
    const adm = ctx.get('agentDefaultModel')
    const sel = adm !== undefined ? adm.currentSelection() : { provider: 'deepseek-official', model: 'deepseek-v4-flash' }
    // 收集涉及的所有 skill 全文（去重，各截断 4000 字符）
    const skillNames = [...new Set(lines.map((l) => String(l.skill || '').replace(/[^a-z0-9-]/gi, '')) )].filter(Boolean)
    const skillParts = []
    for (const s of skillNames) {
      const sk = await readSkillFile(s)
      if (sk.ok) skillParts.push('===== skill「' + s + '」全文 =====\n' + sk.text.slice(0, 4000))
    }
    const sys = [
      '你是 Ren\'Py 视觉小说引擎的编程教学助手。知识源是下面这些 renpy-* skill 文档（人工核验的引擎事实），教学严格以它们为准，不要臆造；超出覆盖就说"建议查官方文档"。',
      '任务：为给定文件的多行代码，每行生成一句教学注释（将写入代码行上方的 # 注释）。',
      '教学注释要求：',
      '1. 中文，30~80 字，一句话讲清"这行在做什么/为什么"；引用 skill 关键点时标注（skill 名）。',
      '2. 只输出 JSON，格式严格如下（不要 markdown 代码块、不要任何其他文字）：',
      '{"<行号>": "<注释>", "<行号>": "<注释>"}',
      '例如：{"3": "define 在 init 阶段定义常量（游戏启动时执行一次）"}',
      '3. 行号必须是输入中给出的行号，逐一对应；不确定的行留空字符串。',
      '',
      skillParts.join('\n\n'),
    ].join('\n')
    const codeBlocks = lines.map((l) => 'L' + l.line + ':\n```rpy\n' + String(l.code || '').replace(/```/g, '') + '\n```').join('\n\n')
    const user = [
      '文件「' + (req.file || '?') + '」中需要注释的行：',
      '',
      codeBlocks,
      '',
      '请按 system 要求的 JSON 格式，为每一行输出教学注释。',
    ].join('\n')
    const msgs = [{
      id: 'teach-file-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      role: 'user',
      content: [{ type: 'text', text: user }],
      source: { kind: 'user' },
    }]
    let out = ''
    try {
      const stream = llm.stream({ provider: sel.provider, model: sel.model, system: sys, messages: msgs, maxTokens: 2000, temperature: 0.3 })
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('生成超时（90s）')), 90000))
      for await (const chunk of await Promise.race([(async () => stream)(), timeout])) {
        if (chunk && chunk.type === 'text-delta') out += chunk.text
      }
    } catch (e) {
      return { ok: false, error: 'AI 教学失败: ' + String(e && e.message || e) }
    }
    if (!out.trim()) return { ok: false, error: 'AI 未返回内容' }
    // 解析 JSON：剥离可能的 ```json 包裹，提取 {...}
    let jsonStr = out.trim()
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(jsonStr)
    if (fence) jsonStr = fence[1].trim()
    const brace = jsonStr.indexOf('{')
    const braceEnd = jsonStr.lastIndexOf('}')
    let parsed = null
    if (brace >= 0 && braceEnd > brace) {
      try {
        parsed = JSON.parse(jsonStr.slice(brace, braceEnd + 1))
      } catch (e) { parsed = null }
    }
    if (!parsed || typeof parsed !== 'object') {
      // 宽松回退：正则提取 "行号": "注释" 键值对（容忍缺括号/多余文字）
      const fallback = {}
      for (const m of jsonStr.matchAll(/"(\d+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
        fallback[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\n/g, ' ')
      }
      parsed = Object.keys(fallback).length ? fallback : null
    }
    if (!parsed || typeof parsed !== 'object') return { ok: false, error: '输出格式错误（无 JSON 对象）' }
    const results = lines.map((l) => {
      const text = String(parsed[String(l.line)] || '').trim()
      return text ? { ok: true, line: l.line, skill: l.skill, text } : { ok: false, line: l.line, error: '该行未生成注释' }
    })
    const okN = results.filter((r) => r.ok).length
    return { ok: true, total: results.length, okCount: okN, failed: results.length - okN, results }
  }

  const runGame = async (project, session) => {
    const old = running.get(project)
    if (old) { try { old.proc.kill() } catch (e) { /* ignore */ } }
    // 注入调试桥接（_debug_bridge.rpy + 清空指令），使 route-jump 可用
    const bridgeInjected = await injectBridge(project, session)
    const cmd = '& ' + q(python) + ' ' + q(renpyPy) + ' ' + q(project) + ' run'
    const proc = ctx.shell.start(specOf(cmd, 240000, session))
    running.set(project, { proc, at: Date.now() })
    return { started: true, project, bridgeInjected }
  }

  const stopGame = async (project) => {
    const old = running.get(project)
    if (!old) return { stopped: false }
    const killed = old.proc.kill()
    running.delete(project)
    return { stopped: true, killed }
  }

  const statusGame = (project) => {
    const old = running.get(project)
    if (!old) return { running: false }
    let delta = ''
    try { delta = old.proc.readOutput().delta || '' } catch (e) { /* ignore */ }
    const done = old.proc.status !== 'running'
    if (done) running.delete(project)
    return { running: !done, status: old.proc.status, exitCode: old.proc.exitCode, output: delta }
  }

  const takeShot = async (session) => {
    const dir = userDir + '/screenshots'
    const file = dir + '/panel-' + Date.now() + '.png'
    const cmd = 'New-Item -ItemType Directory -Force -Path ' + q(dir) + ' | Out-Null; Add-Type -AssemblyName System.Drawing; Add-Type -AssemblyName System.Windows.Forms; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object System.Drawing.Bitmap($b.Width,$b.Height); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.X,$b.Y,0,0,(New-Object System.Drawing.Size($b.Width,$b.Height))); $bmp.Save(' + q(file) + ',[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()'
    const r = await ctx.shell.run(specOf(cmd, 30000, session))
    if (r.exitCode !== 0) return { error: 'screenshot failed: ' + String(r.stderr.text) }
    const bytes = await ctx.fs.readBytes(await ctx.fs.resolve(file), undefined, 8 * 1024 * 1024)
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return { file, dataBase64: btoa(bin) }
  }

  const hashStr = (s) => {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    return (h >>> 0).toString(16)
  }

  // game/*.rpy 变更指纹（文件名 + fs 版本令牌），用于索引缓存新鲜度判断
  const fingerprint = async (project) => {
    let fp = ''
    try {
      const entries = await ctx.fs.listDir(await ctx.fs.resolve(project + '/game'))
      const names = entries.filter((e) => e.name.endsWith('.rpy')).map((e) => e.name).sort()
      for (const n of names) {
        try {
          const st = await ctx.fs.stat(await ctx.fs.resolve(project + '/game/' + n))
          fp += n + ':' + String(st.version) + ';'
        } catch (e) {
          fp += n + ':?;'
        }
      }
    } catch (e) { /* project dir missing */ }
    return fp
  }

  const indexPathFor = (project) => userDir + '/index/' + basename(project) + '-' + hashStr(project) + '.json'

  // 侧边栏对话/轨迹数据：从会话消息派生（只读叶子字段）
  const feed = (sessionId) => {
    let session = undefined
    try {
      session = sessionId ? ctx.sessions.get(sessionId) : ctx.sessions.list()[0]
    } catch (e) { session = undefined }
    const chat = []
    const trail = []
    if (!session) return { chat, trail }
    let messages = []
    try { messages = session.deriveMessages() } catch (e) { return { chat, trail } }
    for (const m of messages.slice(-60)) {
      try {
        const content = (m && m.content) || []
        let text = ''
        let rText = ''
        for (const [bi, b] of content.entries()) {
          if (!b) continue
          const bt = b.type || b.kind
          if (bt === 'text' && typeof b.text === 'string') text += b.text
          else if (bt === 'reasoning' && typeof b.text === 'string') rText += b.text
          else if (bt === 'tool-call' && b.name) {
            const argsStr = String(b.arguments || '')
            // 编辑类工具：提取目标文件与类型（供"编辑详情跳转编辑器"）
            let file = ''
            let kind = 'other'
            if (/edit/.test(b.name)) {
              kind = 'edit'
              const m2 = /"(?:file_path|path)"\s*:\s*"([^"]+)"/.exec(argsStr)
              if (m2) file = m2[1]
            } else if (/write|save/.test(b.name)) {
              kind = 'write'
              const m2 = /"(?:path|file)"\s*:\s*"([^"]+)"/.exec(argsStr)
              if (m2) file = m2[1]
            }
            trail.push({ id: m.id + ':' + bi, name: b.name, done: false, args: argsStr.replace(/\s+/g, ' ').slice(0, 300), file, kind })
          }
          else if (bt === 'tool-result' && b.name) trail.push({ id: m.id + ':' + bi, name: b.name, done: true, args: '' })
        }
        const role = m.role
        if ((role === 'user' || role === 'assistant') && text.trim()) chat.push({ id: m.id, t: role === 'user' ? 'user' : 'assistant', text: text, r: rText.trim() ? 1 : 0, rText: rText.trim().slice(0, 600) })
      } catch (e) { /* skip */ }
    }
    return { chat, trail }
  }

  const buildIndexResult = (j) => {
    const map = (o) => Object.keys(o || {}).map((k) => ({ name: k, file: o[k][0], line: o[k][1] }))
    return {
      labels: map(j.labels),
      characters: map(j.characters),
      transitions: map(j.transitions),
      variables: map(j.variables),
      screens: map(j.screens),
      counts: { labels: Object.keys(j.labels || {}).length, characters: Object.keys(j.characters || {}).length, transitions: Object.keys(j.transitions || {}).length, variables: Object.keys(j.variables || {}).length },
    }
  }

  // ── route-map 状态机提取（轻量分析器，host 侧运行；与 verification/scripts/extract-route-map.js 同源同逻辑） ──
  const extractRouteMap = (project) => {
    const { readdirSync, readFileSync } = require('fs')
    const path = require('path')
    const gameDir = path.join(project, 'game')
    const states = [], transitions = [], variables = []
    const labelToId = new Map()
    const relFor = (p) => path.relative(project, p).replace(/\\/g, '/')
    let curState = null
    let lastFlow = 'none'   // 当前 label 最后一条流程语句是否出口（顺序落入检测）
    let curFile = null      // 当前 label 所在文件（顺序落入只限同文件）
    const returnExits = new Set() // 顶层 return 出口的 label id（角色推断：ending）

    const addState = (name, line, file) => {
      if (labelToId.has(name)) {
        const id = labelToId.get(name)
        const s = states.find((x) => x.id === id)
        if (s && line > 0 && s.line === -1) { s.line = line; s.file = file }
        return id
      }
      const id = 's_' + name.replace(/[^a-zA-Z0-9_]/g, '_')
      states.push({ id, name, kind: 'label', file, line, role: 'scene', entryActions: [], outTransitions: [] })
      labelToId.set(name, id)
      return id
    }
    const addTrans = (from, to, type, extra = {}) => {
      if (!from || !to) return
      // 去重：同 from/to/type/label 只保留一条（guard 更具体的优先）
      const dup = transitions.find((t) => t.from === from && t.to === to && t.type === type && t.label === (extra.label || null))
      if (!dup && type === 'jump' && !extra.guard) {
        const hasCond = transitions.find((t) => t.from === from && t.to === to && t.type === 'conditional')
        if (hasCond) return hasCond.id
      }
      if (dup) {
        if (!dup.guard && extra.guard) { dup.guard = extra.guard; dup.branch = extra.branch }
        return dup.id
      }
      const id = 't_' + transitions.length
      const t = Object.assign({ id, from, to, type }, extra)
      transitions.push(t)
      const s = states.find((x) => x.id === from)
      if (s) s.outTransitions.push(id)
      return id
    }
    const trackVar = (name, kind, line, file) => {
      let v = variables.find((x) => x.name === name)
      if (!v) { v = { name, kind, definedAt: null, defaultValue: undefined, readIn: [], writtenIn: [], usedInGuards: [] }; variables.push(v) }
      if (kind === 'default' || kind === 'define') { v.kind = kind; v.definedAt = { file, line } }
      else if (kind === 'write') { if (curState && !v.writtenIn.includes(curState)) v.writtenIn.push(curState) }
      else if (kind === 'read') { if (curState && !v.readIn.includes(curState)) v.readIn.push(curState) }
      else if (kind === 'guard') { if (!v.usedInGuards.includes(line)) v.usedInGuards.push(line) }
      return v
    }
    // 跳过 if-elif-else 整条链（含后续同级 elif/else；只跳这一条链，不跳后续同级独立 if）
    const skipBlock = (lines, i) => {
      const baseIndent = (lines[i].match(/^\s*/) || [''])[0].length
      let j = i + 1
      while (j < lines.length) {
        const ol = lines[j]
        if (/^\s*$/.test(ol)) { j++; continue }
        const oIndent = (ol.match(/^\s*/) || [''])[0].length
        if (oIndent <= baseIndent) {
          if (/^\s*(elif|else)\s*:/.test(ol)) { j++; continue }
          break
        }
        j++
      }
      return j - 1
    }
    // 收集 if 分支"直接子语句"层级的 jump/call 目标（嵌套控制块跳过，不收集其内部跳转）
    const findBranchTargets = (lines, i) => {
      const baseIndent = (lines[i].match(/^\s*/) || [''])[0].length
      const targets = []
      let j = i + 1
      while (j < lines.length) {
        const ol = lines[j]
        if (/^\s*$/.test(ol)) { j++; continue }
        const oIndent = (ol.match(/^\s*/) || [''])[0].length
        if (oIndent <= baseIndent) break
        if (/^\s*(if|elif|else|menu|python|with|while|for)\b/.test(ol)) { j = skipNestedBlock(lines, j, oIndent); continue }
        const jm = ol.match(/^\s*jump\s+([a-zA-Z_.]+)/)
        if (jm) { targets.push({ label: jm[1] }); j++; continue }
        const cm = ol.match(/^\s*call\s+([a-zA-Z_.]+)/)
        if (cm) { targets.push({ label: cm[1] }); j++; continue }
        j++
      }
      return targets
    }
    const skipNestedBlock = (lines, i, blockIndent) => {
      let j = i + 1
      while (j < lines.length) {
        const ol = lines[j]
        if (/^\s*$/.test(ol)) { j++; continue }
        const oIndent = (ol.match(/^\s*/) || [''])[0].length
        if (oIndent <= blockIndent) break
        j++
      }
      return j - 1
    }

    const parseFile = (file) => {
      const rel = relFor(file)
      const lines = readFileSync(file, 'utf8').split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i], ln = i + 1
        // 插值读取
        for (const m of line.matchAll(/\[([a-zA-Z_][a-zA-Z0-9_]*)\]/g)) trackVar(m[1], 'read', ln, rel)
        // default/define（label 内外都提取）
        let dm = line.match(/^\s*default\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/)
        if (dm) { trackVar(dm[1], 'default', ln, rel); trackVar(dm[1], 'write', ln, rel); continue }
        dm = line.match(/^\s*define\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/)
        if (dm) { trackVar(dm[1], 'define', ln, rel); continue }
        // label（顺序落入：上一 label 未以出口结束且同文件 → 隐式 sequential 转移）
        const lm = line.match(/^\s*label\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*:/)
        if (lm) {
          if (curState && lastFlow !== 'exit' && curFile === rel) addTrans(curState, addState(lm[1], ln, rel), 'sequential', {})
          curState = addState(lm[1], ln, rel)
          curFile = rel
          lastFlow = 'none'
          continue
        }
        if (!curState) continue
        // 赋值 $ x = y
        const am = line.match(/^\s*\$?\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/)
        if (am && !line.trim().startsWith('#')) { trackVar(am[1], 'write', ln, rel); continue }
        // menu 块
        if (line.match(/^\s*menu:/)) {
          const mIndent = (line.match(/^\s*/) || [''])[0].length
          for (let j = i + 1; j < lines.length; j++) {
            const ml = lines[j]
            const ind = (ml.match(/^\s*/) || [''])[0].length
            if (ind <= mIndent) break
            if (/^\s*$/.test(ml) || /^\s*#/.test(ml)) continue
            const item = ml.match(/^\s*"([^"]+)"(?:\s+if\s+(.+))?\s*:\s*$/)
            if (item) {
              const guard = item[2] || null
              const optIndent = ind
              for (let k = j + 1; k < lines.length; k++) {
                const ol = lines[k], oInd = (ol.match(/^\s*/) || [''])[0].length
                if (oInd <= optIndent) break
                const ojm = ol.match(/^\s*jump\s+([a-zA-Z_.]+)/)
                if (ojm) { addTrans(curState, addState(ojm[1], -1, rel), 'menu', { event: 'choice:"' + item[1] + '"', guard, choiceText: item[1], label: ojm[1] }); break }
                const ocm = ol.match(/^\s*call\s+([a-zA-Z_.]+)/)
                if (ocm) { addTrans(curState, addState(ocm[1], -1, rel), 'menu', { event: 'choice:"' + item[1] + '"', guard, choiceText: item[1], label: ocm[1] }); break }
              }
            }
          }
          i = skipBlock(lines, i)
          lastFlow = 'exit'  // menu 必然暂停交互，所有路径从选项继续
          continue
        }
        // if-elif-else 完整链
        const im = line.match(/^\s*if\s+(.+):/)
        if (im) {
          const ifIndent = (line.match(/^\s*/) || [''])[0].length
          const chain = []
          chain.push({ guard: im[1], targets: findBranchTargets(lines, i) })
          let j = i + 1
          while (j < lines.length) {
            const ol = lines[j]
            if (/^\s*$/.test(ol)) { j++; continue }
            const oIndent = (ol.match(/^\s*/) || [''])[0].length
            if (oIndent < ifIndent) break
            if (oIndent > ifIndent) { j++; continue }
            const em = ol.match(/^\s*elif\s+(.+):\s*$/)
            if (em) { chain.push({ guard: em[1], targets: findBranchTargets(lines, j) }); j++; continue }
            const elseM = ol.match(/^\s*else\s*:\s*$/)
            if (elseM) { chain.push({ guard: 'else', targets: findBranchTargets(lines, j) }); j++; continue }
            break
          }
          for (const c of chain) {
            if (c.guard !== 'else') {
              for (const vm of c.guard.matchAll(/[a-zA-Z_][a-zA-Z0-9_]*/g)) {
                if (!/^(True|False|None|and|or|not|in|is|if|else|>=|<=|==|!=|>|<|\d+)$/.test(vm[0])) trackVar(vm[0], 'guard', ln, rel)
              }
            }
            for (const t of c.targets) {
              addTrans(curState, addState(t.label, -1, rel), 'conditional', { guard: c.guard === 'else' ? 'else' : c.guard, label: t.label, branch: c.guard === 'else' ? 'false' : 'true' })
            }
          }
          i = skipBlock(lines, i)
          // 完整 if-elif-else 链：有"带跳转的 else"才保证全分支出口；否则条件全不满足时顺序落入
          lastFlow = chain.some((c) => c.guard === 'else' && c.targets.length > 0) ? 'exit' : 'flow'
          continue
        }
        // jump / call / return
        const jm = line.match(/^\s*jump\s+([a-zA-Z_.]+)/)
        if (jm) { addTrans(curState, addState(jm[1], -1, rel), 'jump', { label: jm[1] }); lastFlow = 'exit'; continue }
        const cm = line.match(/^\s*call\s+([a-zA-Z_.]+)/)
        if (cm) { addTrans(curState, addState(cm[1], -1, rel), 'call', { label: cm[1] }); lastFlow = 'flow'; continue }
        if (line.match(/^\s*return\b/)) { if (curState) returnExits.add(curState); lastFlow = 'exit'; continue }
      }
    }

    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name.startsWith('.') || e.name.startsWith('_')) continue
        const p = path.join(d, e.name)
        if (e.isDirectory()) walk(p)
        else if (e.name.endsWith('.rpy')) parseFile(p)
      }
    }

    // 角色推断（与独立分析器同规则；按优先级：start > ending/dead_end > loop > choice > orphan > scene）
    const inferRoles = (initialState) => {
      const byId = new Map(states.map((s) => [s.id, s]))
      const incoming = new Map(), selfLoop = new Set(), hasOut = new Set()
      for (const t of transitions) {
        if (t.to === null || t.to === undefined || !byId.has(t.to) || !t.from) continue
        hasOut.add(t.from)
        if (t.from === t.to) selfLoop.add(t.from)
        if (!incoming.has(t.to)) incoming.set(t.to, [])
        incoming.get(t.to).push(t.from)
      }
      const callOnly = new Set()
      for (const [to, froms] of incoming) {
        const allCall = froms.every((f) => transitions.some((t) => t.from === f && t.to === to && t.type === 'call'))
        if (allCall) callOnly.add(to)
      }
      const isEndingName = (name) => /(?:^|_)(?:end|ending|finale|fin)(?:_|$)/i.test(String(name || '')) || /结局/.test(String(name || ''))
      for (const s of states) {
        let role
        if (s.name === initialState) role = 'start'
        else if (!hasOut.has(s.id)) role = (returnExits.has(s.id) && !callOnly.has(s.id)) || isEndingName(s.name) ? 'ending' : 'dead_end'
        else if (selfLoop.has(s.id)) role = 'loop'
        else if (transitions.some((t) => t.from === s.id && t.type === 'menu')) role = 'choice'
        else if (!incoming.has(s.id)) role = 'orphan'
        else role = 'scene'
        s.role = role
      }
    }

    try {
      walk(gameDir)
      inferRoles('start')
    } catch (e) { return { error: String(e) } }
    return {
      schema: 'route-map/1.0', project: path.basename(project), initialState: 'start',
      states, transitions, variables,
      meta: {
        totalStates: states.length,
        totalTransitions: transitions.length,
        endStates: states.filter((s) => s.role === 'ending' && !states.some((o) => o.id !== s.id && o.name.startsWith(s.name + '_'))).map((s) => s.id),
        unresolvedLabels: [...new Set(transitions.filter((t) => t.label && !labelToId.has(t.label)).map((t) => t.label))],
      },
    }
  }

  const runIndex = async (project, session) => {
    const out = indexPathFor(project)
    const fp = await fingerprint(project)
    // 快路径：缓存存在且 .rpy 未变 → 直接读，不启动引擎
    try {
      const cached = JSON.parse(await readText(out))
      if (cached._fp === fp) return buildIndexResult(cached)
    } catch (e) { /* no cache or stale */ }
    // 慢路径：启动引擎生成新索引
    const cmd = '& ' + q(python) + ' ' + q(indexerPath) + ' ' + q(sdkPath) + ' ' + q(project) + ' ' + q(out) + ' ' + q(userDir)
    const r = await ctx.shell.run(specOf(cmd, 180000, session))
    if (r.exitCode !== 0) return { error: String(r.stdout.text) }
    const j = JSON.parse(await readText(out))
    j._fp = fp
    await writeText(out, JSON.stringify(j), session)
    return buildIndexResult(j)
  }

  const EDITOR_CSS = [
    '.renpy-cm5 .CodeMirror{height:100%;font-size:13px;background:#1e1e1e;color:#d4d4d4}',
    '.renpy-cm5 .CodeMirror-scroll,.renpy-cm5 .CodeMirror-lines,.renpy-cm5 .CodeMirror-code{background:#1e1e1e;color:#d4d4d4}',
    '.renpy-cm5 .CodeMirror-gutters{background:#252526;color:#858585;border-right:1px solid #333}',
    '.renpy-cm5 .CodeMirror-line{color:#d4d4d4}',
    '.renpy-cm5 .cm-s-default .cm-comment{color:#6a9955}',
    '.renpy-cm5 .cm-s-default .cm-string{color:#ce9178}',
    '.renpy-cm5 .cm-s-default .cm-keyword{color:#569cd6}',
    '.renpy-cm5 .cm-s-default .cm-number{color:#b5cea8}',
    '.renpy-cm5 .CodeMirror-cursor{border-left:1px solid #fff}',
    '.renpy-cm5 .CodeMirror-selected{background:#264f78}',
    '.renpy-cm5 .CodeMirror-scroll{font-family:Consolas,"Courier New",monospace;line-height:1.5}',
  ].join('\n')

  const readBody = (req) => new Promise((resolve) => {
    // 必须用 Buffer.concat 收集后统一按 utf8 解码：字符串拼接会拆坏跨 chunk 的多字节字符（中文乱码）
    const chunks = []
    req.on('data', (c) => { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))) })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(JSON.parse(raw || '{}'))
      } catch (e) {
        resolve({})
      }
    })
  })

  const respond = (res, status, obj, type) => {
    res.writeHead(status, { 'Content-Type': type || 'application/json' })
    res.end(type ? obj : JSON.stringify(obj))
  }

  const handle = async (req, res) => {
    let u
    try { u = new URL(req.url, 'http://localhost') } catch (e) { respond(res, 400, { error: 'bad url' }); return }
    const p = u.pathname.replace(/\/+$/, '')
    const sessionId = u.searchParams.get('session') || undefined
    const session = sessionId ? ctx.sessions.get(sessionId) : undefined
    try {
      if (req.method === 'GET' && p === '/renpy-dev/style.css') { respond(res, 200, EDITOR_CSS, 'text/css'); return }
      if (req.method === 'GET' && p === '/renpy-dev/info') { respond(res, 200, { sdkPath, userDir, defaultProject }); return }
      if (req.method === 'GET' && p === '/renpy-dev/list-files') { respond(res, 200, { files: await listRpy(u.searchParams.get('project') || '') }); return }
      if (req.method === 'GET' && p === '/renpy-dev/read-file') { respond(res, 200, { content: await readText(u.searchParams.get('path') || '') }); return }
      if (req.method === 'GET' && p === '/renpy-dev/asset') { await serveAsset(u.searchParams.get('project') || '', u.searchParams.get('path') || '', res); return }
      if (req.method === 'GET' && p === '/renpy-dev/shot-image') {
        // 读游戏内截图（game/_shot.png），返回 image/png
        try {
          const proj = String(u.searchParams.get('project') || '').trim()
          if (!proj) { respond(res, 400, { error: 'missing project' }); return }
          const bytes = await ctx.fs.readBytes(await ctx.fs.resolve(proj.replace(/[\\/]+$/, '') + '/game/_shot.png'), undefined, 16 * 1024 * 1024)
          respond(res, 200, Buffer.from(bytes), 'image/png')
        } catch (e) {
          respond(res, 404, { error: 'no shot yet' })
        }
        return
      }
      if (req.method === 'POST') {
        const body = await readBody(req)
        if (p === '/renpy-dev/write-file') {
          const rel = (/\/game\/(.+)$/.exec(body.path || '') || [])[1]
          // 写守卫：保存前强制校验（缩进/保留名/标签唯一/对白转义）；失败默认拒写，force 可绕过
          if (rel && !body.force && String(body.path || '').endsWith('.rpy')) {
            const guard = guardRpy(body.content || '', { labels: await labelsOfProject(String(body.path || '').replace(/[\\/]game[\\/].*$/, ''), rel) })
            if (!guard.ok) {
              respond(res, 200, { ok: false, guarded: true, errors: guard.errors })
              return
            }
          }
          if (rel) await backupOf(body.path, rel, session) // 先备份旧版本，再写入
          await writeText(body.path, body.content || '', session)
          respond(res, 200, { ok: true })
          return
        }
        if (p === '/renpy-dev/history') { respond(res, 200, { versions: await listHistory(body.project, body.rel) }); return }
        if (p === '/renpy-dev/history-read') { respond(res, 200, await readHistoryFile(body.project, body.rel, body.time)); return }
        if (p === '/renpy-dev/restore') { respond(res, 200, await restoreBackup(body.project, body.rel, body.time, session)); return }
        if (p === '/renpy-dev/checkpoint-create') { respond(res, 200, await cpCreate(body.project, session)); return }
        if (p === '/renpy-dev/checkpoint-list') { respond(res, 200, await cpList(body.project)); return }
        if (p === '/renpy-dev/checkpoint-diff') { respond(res, 200, await cpDiff(body.project, body.id)); return }
        if (p === '/renpy-dev/checkpoint-accept') { respond(res, 200, await cpAccept(body.project, body.id, body.rel, session)); return }
        if (p === '/renpy-dev/checkpoint-revert') { respond(res, 200, await cpRevert(body.project, body.id, body.rel, session)); return }
        if (p === '/renpy-dev/workspace-set') { respond(res, 200, await workspaceSet(body.project, body, sessionId)); return }
        if (p === '/renpy-dev/workspace-get') { respond(res, 200, { workspace: await workspaceGet(body.project) }); return }
        if (p === '/renpy-dev/workspace-clear') { respond(res, 200, await workspaceClear(body.project, sessionId)); return }
        if (p === '/renpy-dev/workspace-inject') { respond(res, 200, await workspaceInject(body.project, sessionId)); return }
        if (p === '/renpy-dev/lint') { respond(res, 200, await runLint(body.project, session)); return }
        if (p === '/renpy-dev/errors') {
          // 报错落盘文件结构化读取（traceback.txt / log.txt / errors.txt，项目根目录）
          const proj = String(body.project || '').trim()
          if (!proj) { respond(res, 400, { error: 'missing project' }); return }
          const base = proj.replace(/[\\/]+$/, '')
          const read = async (name) => { try { return await readText(base + '/' + name) } catch (e) { return null } }
          const [tb, lg, er] = await Promise.all([read('traceback.txt'), read('log.txt'), read('errors.txt')])
          respond(res, 200, {
            project: proj,
            files: { traceback: !!tb, log: !!lg, errors: !!er },
            traceback: tb ? parseTraceback(tb) : null,
            log: lg ? parseLog(lg) : null,
            errors: er ? parseErrors(er) : null,
          })
          return
        }
        if (p === '/renpy-dev/settings-get') { respond(res, 200, await settingsGet(body.project)); return }
        if (p === '/renpy-dev/settings-save') { respond(res, 200, await settingsSave(body.project, body.global, body.projectCfg, session)); return }
        if (p === '/renpy-dev/diagnostics') {
          // 静态诊断（find_*：引用完整性扫描，秒级快速通道；递归收集 game/ 下 .rpy）
          const proj = String(body.project || '').trim()
          if (!proj) { respond(res, 400, { error: 'missing project' }); return }
          const base = proj.replace(/[\\/]+$/, '')
          const rpyFiles = []
          const walkRpy = async (dir, prefix) => {
            let entries
            try { entries = await ctx.fs.listDir(await ctx.fs.resolve(dir)) } catch (e) { return }
            for (const e of entries) {
              if (e.type === 'directory') { await walkRpy(dir + '/' + e.name, prefix + e.name + '/'); continue }
              if (!e.name.endsWith('.rpy')) continue
              let content = ''
              try { content = await readText(dir + '/' + e.name) } catch (err) { /* ignore */ }
              rpyFiles.push({ rel: prefix + e.name, content })
            }
          }
          await walkRpy(base + '/game', '')
          const assets = await listAssets(proj)
          const diag = findDiagnostics(rpyFiles, {
            images: assets.image.map((a) => a.rel),
            audio: assets.audio.map((a) => a.rel),
            fonts: assets.font.map((a) => a.rel),
          })
          respond(res, 200, { project: proj, files: rpyFiles.length, ...diag })
          return
        }
        if (p === '/renpy-dev/test') { respond(res, 200, await runTest(body.project, body.suite, session)); return }
        if (p === '/renpy-dev/doc' && req.method === 'GET') { const u2 = new URL(req.url, 'http://x'); respond(res, 200, await readDoc(u2.searchParams.get('page') || '')); return }
        if (p === '/renpy-dev/teach') { respond(res, 200, await teachOne(body)); return }
        if (p === '/renpy-dev/teach-file') { respond(res, 200, await teachFile(body)); return }
        if (p === '/renpy-dev/run') { respond(res, 200, await runGame(body.project, session)); return }
        if (p === '/renpy-dev/stop') { respond(res, 200, await stopGame(body.project)); return }
        if (p === '/renpy-dev/status') { respond(res, 200, await statusGame(body.project)); return }
        if (p === '/renpy-dev/resolve-folder') { respond(res, 200, await resolveFolder(body.name, body.startDirs)); return }
        if (p === '/renpy-dev/screenshot') { respond(res, 200, await takeShot(session)); return }
        if (p === '/renpy-dev/index') { respond(res, 200, await runIndex(body.project, session)); return }
        if (p === '/renpy-dev/assets') { respond(res, 200, await listAssets(body.project)); return }
        if (p === '/renpy-dev/feed') { respond(res, 200, feed(sessionId)); return }
        if (p === '/renpy-dev/route-map') {
          const map = extractRouteMap(body.project)
          if (map.error) { respond(res, 500, map); return }
          const layout = layoutRouteMap(map)
          const meta = computeRouteMeta(map)
          respond(res, 200, { ...map, layout, meta })
          return
        }
        if (p === '/renpy-dev/route-jump') {
          // 写桥接指令到项目 game/_route_cmd.json（项目内，沙箱允许写）
          // 游戏侧 _debug_bridge.rpy 的 periodic_callbacks 轮询该文件执行 warp
          try {
            const proj = String(body.project || '').trim()
            if (!proj) { respond(res, 400, { ok: false, error: 'missing project' }); return }
            const cmd = JSON.stringify({ action: 'warp', spec: body.spec || '' })
            const cmdPath = proj.replace(/[\\/]+$/, '') + '/game/_route_cmd.json'
            await writeText(cmdPath, cmd, session)
            respond(res, 200, { ok: true, state: body.state, spec: body.spec })
          } catch (e) {
            respond(res, 500, { ok: false, error: String(e) })
          }
          return
        }
        if (p === '/renpy-dev/route-status') {
          // 读游戏侧桥接回报的当前位置（_route_status.json）；无文件或超过 15s 视为未在调试
          try {
            const sp = body.project.replace(/[\\/]+$/, '') + '/game/_route_status.json'
            const content = await readText(sp)
            const j = JSON.parse(content)
            const fresh = j && j.at && (Date.now() - Number(j.at)) < 15000
            respond(res, 200, fresh ? { running: true, label: j.label || null, file: j.file || '', line: Number(j.line) || 0, vars: j.vars || {}, shotAt: Number(j.shot_at) || 0, shotErr: j.shot_err || null } : { running: false })
          } catch (e) {
            respond(res, 200, { running: false })
          }
          return
        }
        if (p === '/renpy-dev/route-shot') {
          // 写截图指令到项目 game/_route_cmd.json，桥接轮询到后执行 screenshot_to_bytes
          try {
            const proj = String(body.project || '').trim()
            if (!proj) { respond(res, 400, { ok: false, error: 'missing project' }); return }
            await writeText(proj.replace(/[\\/]+$/, '') + '/game/_route_cmd.json', JSON.stringify({ action: 'screenshot' }), session)
            respond(res, 200, { ok: true })
          } catch (e) {
            respond(res, 500, { ok: false, error: String(e) })
          }
          return
        }
        if (p === '/renpy-dev/route-act') {
          // 通用交互指令：dismiss 推进 / rollback 回滚 / click 点击（x,y 虚拟分辨率坐标）/ nav 菜单导航（dir+select）
          try {
            const proj = String(body.project || '').trim()
            if (!proj) { respond(res, 400, { ok: false, error: 'missing project' }); return }
            const cmd = { action: String(body.action || '') }
            if (body.x !== undefined && body.x !== null) cmd.x = Number(body.x)
            if (body.y !== undefined && body.y !== null) cmd.y = Number(body.y)
            if (body.dir) cmd.dir = String(body.dir)
            if (body.select) cmd.select = true
            await writeText(proj.replace(/[\\/]+$/, '') + '/game/_route_cmd.json', JSON.stringify(cmd), session)
            respond(res, 200, { ok: true })
          } catch (e) {
            respond(res, 500, { ok: false, error: String(e) })
          }
          return
        }
      }
      respond(res, 404, { error: 'not found: ' + p })
    } catch (e) {
      respond(res, 500, { error: (e && e.message) || String(e) })
    }
  }

  const webServer = ctx.get('webServer')
  if (webServer !== undefined) {
    webServer.register({ kind: 'prefix', path: '/renpy-dev', handler: handle })
  }
}

module.exports = { name, inject, apply, lineDiff }
