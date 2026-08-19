// Ren'Py 开发模式 — 共享纯函数模块（renpy-core）
// 目的：把 host.js 的模块级纯函数抽为单一来源，便于单测与复用。
// 加载方式：Node CJS（host.js / 测试直接 require）。
// 注意：client.js 是浏览器 bundle 格式（window.__ModuleLoader__），不支持相对
// require——本模块当前只服务 host 侧；client 侧的拆分留待打包器接入后再做。
'use strict'

// 行级 diff（公共前后缀 + LCS），返回 hunks 与统计（模块级纯函数，可单测）。
// 语义与 client.js 内联版同源；host 侧检查点 diff 使用本实现。
const lineDiff = (a, b) => {
  const n = a.length, m = b.length
  let s = 0
  while (s < n && s < m && a[s] === b[s]) s++
  let e = 0
  while (e < n - s && e < m - s && a[n - 1 - e] === b[m - 1 - e]) e++
  const A = a.slice(s, n - e), B = b.slice(s, m - e)
  const ops = []
  const ni = A.length, mi = B.length
  if (ni > 0 || mi > 0) {
    if (ni * mi <= 2500000) {
      const W = mi + 1
      const dp = new Uint32Array((ni + 1) * W)
      for (let i = ni - 1; i >= 0; i--) {
        for (let j = mi - 1; j >= 0; j--) {
          const idx = i * W + j
          dp[idx] = A[i] === B[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1])
        }
      }
      let i = 0, j = 0
      while (i < ni && j < mi) {
        if (A[i] === B[j]) { ops.push({ t: 'eq' }); i++; j++ }
        else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) { ops.push({ t: 'del' }); i++ }
        else { ops.push({ t: 'add' }); j++ }
      }
      while (i < ni) { ops.push({ t: 'del' }); i++ }
      while (j < mi) { ops.push({ t: 'add' }); j++ }
    } else {
      for (let i = 0; i < ni; i++) ops.push({ t: 'del' })
      for (let j = 0; j < mi; j++) ops.push({ t: 'add' })
    }
  }
  const hunks = []
  let cur = null, aIdx = s, bIdx = s
  for (const op of ops) {
    if (op.t === 'eq') { aIdx++; bIdx++; if (cur) { hunks.push(cur); cur = null } continue }
    if (!cur) cur = { oldStart: aIdx + 1, newStart: bIdx + 1, oldCount: 0, newCount: 0 }
    if (op.t === 'del') { cur.oldCount++; aIdx++ } else { cur.newCount++; bIdx++ }
  }
  if (cur) hunks.push(cur)
  for (const h of hunks) h.type = h.oldCount > 0 && h.newCount > 0 ? 'mod' : (h.oldCount > 0 ? 'del' : 'add')
  let added = 0, removed = 0
  for (const h of hunks) { added += h.newCount; removed += h.oldCount }
  return { hunks, added, removed }
}

// 挂起工具调用检测：从会话尾部往前找到第一条 surface 消息。
// 若它是 assistant 且 content 带 tool-call 块（其后再无 tool/result 闭合），
// 说明 agent 正等待工具结果——此时往会话 append user/message 会插在
// assistant(tool_calls) 与 tool(result) 之间，违反 OpenAI 消息配对协议，
// 模型 API 以 400 拒绝（"An assistant message with 'tool_calls' must be
// followed by tool messages responding to each 'tool_call_id'."），并从此
// 损坏整轮消息历史。检测到挂起时必须延迟注入，等工具结果落地后再追加。
const hasOpenToolCall = (session) => {
  if (!session) return false
  try {
    const evs = session.events
    for (let i = evs.length - 1; i >= 0; i--) {
      const ev = evs[i]
      if (ev.type === 'tool/result') return false // 最近的工具结果已闭合
      if (ev.type === 'assistant/message') {
        const msg = ev.data && ev.data.message
        const blocks = (msg && msg.content) || []
        return blocks.some((b) => b && b.type === 'tool-call')
      }
      if (ev.type === 'user/message') {
        // 跳过本插件自己注入的指令消息（source.form === 'instructions'）：
        // 它们不是真实用户输入，不应中断 tool-call 配对检查
        const src = ev.data && ev.data.source
        if (src && src.kind === 'plugin' && src.plugin === 'dsh-renpy-dev-client' && src.form === 'instructions') continue
        return false
      }
    }
    return false
  } catch (e) { return false }
}

// ── 状态机路线图布局（纯函数，可单测） ─────────────────────────────────
// 输入：route-map.json 结构（states/transitions/initialState）
// 输出：节点坐标 { states: [{id,name,role,x,y}], edges: [{from,to,x1,y1,x2,y2,type}] }
// 布局：分层 BFS（从 initialState 出发按转移层级分层，同层纵向排列）
const layoutRouteMap = (map, opts = {}) => {
  const gapX = opts.gapX || 220
  const gapY = opts.gapY || 90
  const byId = {}
  const children = new Map()

  for (const t of map.transitions || []) {
    if (!children.has(t.from)) children.set(t.from, [])
    children.get(t.from).push(t)
  }

  // BFS 分层
  const startId = map.initialState ? 's_' + map.initialState : (map.states && map.states[0] ? map.states[0].id : null)
  const layerOf = new Map()
  const queue = startId ? [startId] : []
  if (startId) layerOf.set(startId, 0)
  while (queue.length) {
    const id = queue.shift()
    const layer = layerOf.get(id)
    for (const t of (children.get(id) || [])) {
      if (!layerOf.has(t.to)) {
        layerOf.set(t.to, layer + 1)
        queue.push(t.to)
      }
    }
  }
  // 未分层（孤儿）放最后
  const maxLayer = layerOf.size ? Math.max(...layerOf.values()) + 1 : 0
  for (const s of map.states || []) {
    if (!layerOf.has(s.id)) layerOf.set(s.id, maxLayer)
  }

  // 同层分组
  const byLayer = new Map()
  for (const s of map.states || []) {
    const l = layerOf.get(s.id)
    if (!byLayer.has(l)) byLayer.set(l, [])
    byLayer.get(l).push(s)
  }
  // 层内排序（重心法，2 遍）：按"上一层入边来源"的平均位置排列，减少跨层边交叉。
  // 无上一层来源的节点保持原序（排末尾）；同层边/回边不参与（结构不变，保持稳定）。
  const pred = new Map()
  for (const t of map.transitions || []) {
    if (t.to === null || t.to === undefined) continue
    if (!pred.has(t.to)) pred.set(t.to, [])
    pred.get(t.to).push(t.from)
  }
  const layerKeys = [...byLayer.keys()].sort((a, b) => a - b)
  const idxInLayer = new Map()
  for (const l of layerKeys) byLayer.get(l).forEach((s, i) => idxInLayer.set(s.id, i))
  for (let pass = 0; pass < 2; pass++) {
    for (const l of layerKeys) {
      if (l === layerKeys[0]) continue // 起点层保持
      const states = byLayer.get(l)
      const prevLayer = byLayer.get(l - 1)
      if (!prevLayer) continue
      const bary = (id) => {
        const ps = (pred.get(id) || []).filter((p) => layerOf.get(p) === l - 1)
        if (!ps.length) return null
        let sum = 0
        for (const p of ps) sum += idxInLayer.get(p) === undefined ? prevLayer.length : idxInLayer.get(p)
        return sum / ps.length
      }
      states.sort((a, b) => {
        const ba = bary(a.id), bb = bary(b.id)
        if (ba !== null && bb !== null) return ba - bb
        if (ba !== null) return -1
        if (bb !== null) return 1
        return 0
      })
      states.forEach((s, i) => idxInLayer.set(s.id, i))
    }
  }
  // 按排序后的层内序号分配坐标
  for (const l of layerKeys) {
    byLayer.get(l).forEach((s, i) => {
      byId[s.id] = { id: s.id, name: s.name, role: s.role || 'scene', x: l * gapX + 30, y: i * gapY + 30 }
    })
  }

  const edges = (map.transitions || []).map((t) => {
    const a = byId[t.from], b = byId[t.to]
    if (!a || !b) return null
    // 自环：坐标无意义（渲染端按 from===to 画环）
    if (t.from === t.to) return { from: t.from, to: t.to, type: t.type, x1: a.x + 60, y1: a.y + 24, x2: a.x + 60, y2: a.y + 24 }
    // 端点锚定：源/目标各选"离对方中心最近的边缘中点"——回边从右往左时贴目标右边缘进入，
    // 上下排列时贴目标上/下边缘，线不再横穿节点框，箭头方向自然
    const SW = 120, SH = 48
    const scx = a.x + SW / 2, scy = a.y + SH / 2
    const dcx = b.x + SW / 2, dcy = b.y + SH / 2
    const nearest = (cx, cy, n) => {
      const cands = [
        { x: n.x, y: n.y + SH / 2 },        // 左
        { x: n.x + SW, y: n.y + SH / 2 },   // 右
        { x: n.x + SW / 2, y: n.y },        // 上
        { x: n.x + SW / 2, y: n.y + SH },   // 下
      ]
      let best = cands[0]
      let bd = (best.x - cx) * (best.x - cx) + (best.y - cy) * (best.y - cy)
      for (const c of cands) {
        const d = (c.x - cx) * (c.x - cx) + (c.y - cy) * (c.y - cy)
        if (d < bd) { bd = d; best = c }
      }
      return best
    }
    const dstAnchor = nearest(scx, scy, b)   // 目标上离源中心最近的边缘
    const srcAnchor = nearest(dcx, dcy, a)   // 源上离目标中心最近的边缘
    return { from: t.from, to: t.to, type: t.type, x1: srcAnchor.x, y1: srcAnchor.y, x2: dstAnchor.x, y2: dstAnchor.y }
  }).filter(Boolean)

  return { states: Object.values(byId), edges }
}

// ── 路线元信息（可达性/循环/死路分析，供可视化着色） ───────────────────
const computeRouteMeta = (map) => {
  const children = new Map()
  for (const t of map.transitions || []) {
    if (!children.has(t.from)) children.set(t.from, [])
    children.get(t.from).push(t)
  }
  const startId = map.initialState ? 's_' + map.initialState : (map.states && map.states[0] ? map.states[0].id : null)

  // BFS 可达
  const reachable = new Set()
  if (startId) {
    const q = [startId]
    reachable.add(startId)
    while (q.length) {
      const id = q.shift()
      for (const t of (children.get(id) || [])) {
        if (!reachable.has(t.to)) { reachable.add(t.to); q.push(t.to) }
      }
    }
  }

  const deadStates = []
  const loops = []
  for (const s of map.states || []) {
    const outs = children.get(s.id) || []
    // 死路：可达但无出转移（且非 ending）
    if (reachable.has(s.id) && outs.length === 0 && !/end/i.test(s.name)) deadStates.push(s.id)
    // 循环：自环
    for (const t of outs) {
      if (t.to === s.id) loops.push({ from: s.id, type: 'self' })
    }
  }

  return {
    reachable: [...reachable],
    unreachable: (map.states || []).filter((s) => !reachable.has(s.id)).map((s) => s.id),
    deadStates,
    loops,
  }
}

// ── 报错落盘文件解析（traceback.txt / log.txt / errors.txt，锁定 8.5.3 格式） ──
// 数据来源：verification/projects/demo-script/ 下的真实报错文件。
// 结构：
//   traceback.txt：头部说明 + "While running game code:" 段（用户代码位置 + Exception 行）
//                  + "-- Full Traceback --" + "Traceback (most recent call last):"
//                  + 完整栈帧 + 尾部（平台/版本/时间）
//   log.txt：头部（时间/平台/版本）+ 初始化计时与日志条目 + 可能内嵌的报错段
//   errors.txt：lint 脚本错误（"…, at File "x.rpy", line N:" 段落）
// 根因帧启发式：栈帧中**最深的用户脚本帧**（倒序第一个 file 落在 game/ 下的帧）——
// 运行时错误栈帧通常 用户脚本 → 引擎内部 → …，最深用户帧即报错点；锁 8.5.3 格式
// 实测校准（demo-script traceback.txt：首个帧即 game/ 帧，倒序扫描仍命中它）。

const parseTraceback = (text) => {
  const src = String(text || '')
  const lines = src.split(/\r?\n/)
  // 分隔线：之前的 head 段只含"运行代码位置"，之后的 body 段含完整栈帧
  const cutIdx = lines.findIndex((l) => l.indexOf('-- Full Traceback') >= 0)
  const headLines = cutIdx >= 0 ? lines.slice(0, cutIdx) : lines
  const bodyLines = cutIdx >= 0 ? lines.slice(cutIdx) : []

  const pickFrame = (ls, start) => {
    for (let i = start; i < ls.length; i++) {
      const m = /^  File "([^"]+)", line (\d+)(?:, in ([^\r\n]+))?$/.exec(ls[i])
      if (m) {
        const source = (ls[i + 1] || '').replace(/^[ \t]+/, '').trim()
        return { file: m[1], line: Number(m[2]), func: (m[3] || '').trim(), source }
      }
    }
    return null
  }
  // 异常类型/消息：全文中最后一个 "TypeError: msg" 形行（类型名以 Error/Exception/Warning
  // 结尾；前缀可空以覆盖 "Exception:" 裸类型，支持 renpy.x.Y 点分路径）
  const excRe = /^((?:[A-Za-z_][\w.]*\.)?[\w.]*?(?:Error|Exception|Warning)):\s*([^\r\n]*)$/gm
  let excType = null, excMsg = ''
  let em
  while ((em = excRe.exec(src))) { excType = em[1]; excMsg = em[2] }
  // 兜底：无三后缀匹配时取最后一个 "词: 内容" 行（如 renpy.Rollback 类异常）
  if (!excType) {
    const looseRe = /^([A-Za-z_][\w.]*):\s*([^\r\n]*)$/gm
    while ((em = looseRe.exec(src))) { excType = em[1]; excMsg = em[2] }
  }

  // 完整栈帧（body 段 "Traceback (most recent call last):" 之后）
  const frames = []
  const tbStart = bodyLines.findIndex((l) => /^Traceback \(most recent call last\):$/.test(l))
  for (let i = (tbStart >= 0 ? tbStart : 0) + (tbStart >= 0 ? 1 : 0); i < bodyLines.length; i++) {
    const m = /^  File "([^"]+)", line (\d+)(?:, in ([^\r\n]+))?$/.exec(bodyLines[i])
    if (m) {
      const source = (bodyLines[i + 1] || '').replace(/^[ \t]+/, '').trim()
      frames.push({ file: m[1], line: Number(m[2]), func: (m[3] || '').trim(), source })
    }
  }

  // "While running game code:" 段位置（head 段首个帧）
  const wIdx = headLines.findIndex((l) => l.indexOf('While running game code:') >= 0)
  const whilePos = wIdx >= 0 ? pickFrame(headLines, wIdx + 1) : null

  // 根因帧：倒序第一个 game/ 帧（file 形如 game/x.rpy 或绝对路径含 /game/）
  let rootFrame = null
  for (let i = frames.length - 1; i >= 0; i--) {
    if (/(^|[\\/])game[\\/]/.test(frames[i].file)) { rootFrame = frames[i]; break }
  }

  // 尾部：版本（Ren'Py x.y.z）行、其上一行平台、日期行
  const verLine = lines.find((l) => /^Ren'Py \d+\.\d+\.\d+/.test(l))
  const platLine = verLine ? lines[lines.indexOf(verLine) - 1] || '' : ''
  const dateLine = (lines.filter((l) => /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/.test(l)).pop() || '').trim()

  return {
    ok: src.trim() !== '',
    exception: excType ? { type: excType, message: excMsg } : null,
    whileRunning: whilePos,
    frames,
    rootFrame,
    platform: (platLine || '').trim(),
    version: verLine ? verLine.replace(/^Ren'Py\s+/, '').trim() : '',
    time: dateLine,
  }
}

// 日志条目行分类：timing（"X took N ms"） / info / error 段
const parseLog = (text) => {
  const lines = String(text || '').split(/\r?\n/)
  const header = { time: '', platform: '', version: '' }
  let i = 0
  if (lines[0] && /^\d{4}-\d{2}-\d{2}/.test(lines[0])) { header.time = lines[0].trim(); i = 1 }
  if (lines[i] && !/Ren'Py/.test(lines[i]) && lines[i].trim()) { header.platform = lines[i].trim(); i++ }
  if (lines[i] && /Ren'Py/.test(lines[i])) { header.version = lines[i].replace(/^Ren'Py\s+/, '').trim(); i++ }
  const entries = []
  const errors = []
  let errBuf = null
  for (; i < lines.length; i++) {
    const line = lines[i]
    const tr = /^  File "([^"]+)", line (\d+)/.exec(line)
    if (/Full traceback:|Traceback \(most recent call last\):|While running game code:/.test(line)) {
      errBuf = { text: [], frames: [] }
      continue
    }
    if (errBuf) {
      if (tr) { errBuf.frames.push({ file: tr[1], line: Number(tr[2]) }); continue }
      const em = /^((?:[A-Za-z_][\w.]*\.)?[\w.]*?(?:Error|Exception|Warning)):\s*(.*)$/.exec(line)
      if (em) {
        errors.push({ kind: em[1], message: em[2], frames: errBuf.frames })
        errBuf = null
        continue
      }
      if (line.trim()) errBuf.text.push(line.trim())
      continue
    }
    if (!line.trim()) continue
    if (/ took \d+ ms$/.test(line.trim())) { entries.push({ kind: 'timing', text: line.trim() }); continue }
    entries.push({ kind: 'info', text: line.trim() })
  }
  return { header, entries, errors }
}

// lint 脚本错误（errors.txt / lint 输出）："…, at File "x.rpy", line N:" 段落
// + 行级 "game/x.rpy:N: message" 兜底（部分 lint 输出格式）
const parseErrors = (text) => {
  const src = String(text || '')
  const lines = src.split(/\r?\n/)
  const errors = []
  // 段落式：空行分隔；段内含 "at File …, line N:" → 错误条目
  let para = []
  const flush = () => {
    const joined = para.join('\n')
    // at File 行可能在段落中间（其后跟源码上下文行），取段内第一处
    const m = /at File "([^"]+)", line (\d+):/.exec(joined)
    if (m) {
      const msg = joined.slice(0, m.index).replace(/\s+/g, ' ').replace(/[,\s]+$/, '').trim()
      errors.push({ message: msg || 'script error', file: m[1], line: Number(m[2]) })
    }
    para = []
  }
  for (const line of lines) {
    if (!line.trim()) { if (para.length) flush(); continue }
    para.push(line)
  }
  if (para.length) flush()
  // 行级兜底：game/x.rpy:12: message（段落式未覆盖的 lint 行）
  if (!errors.length) {
    for (const line of lines) {
      const m = /^([^\s:]+\.rpy):(\d+):\s*(.+)$/.exec(line.trim())
      if (m) errors.push({ message: m[3].trim(), file: m[1], line: Number(m[2]) })
    }
  }
  const verLine = /Ren'Py Version: ([^\r\n]+)/.exec(src)
  const dateLine = (lines.filter((l) => /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/.test(l)).pop() || '').trim()
  return { errors, version: verLine ? verLine[1].replace(/^Ren'Py\s+/, '').trim() : '', time: dateLine }
}

// ── 静态诊断（find_*：引用完整性扫描） ──────────────────────────────────
// 输入：files = [{rel, content}]（game/ 下的 .rpy，rel 相对 game/）、
//       assets = { images: [rel], audio: [rel], fonts: [rel] }（资源文件路径，相对 game/）
// 输出：{ items: [{kind, level, file, line, target, msg}], counts }
// 诊断种类（保守策略：只报可静态确定的；动态特性——jump/call expression、renpy.jump()、
// 表达式图像 show expression——一律跳过，宁可漏报不误报）：
//   invalid_jump         jump/call 指向不存在的 label（error）
//   undefined_screen     show/call screen、use 指向不存在的 screen（error）
//   undefined_character  say 用了未定义的 Character（warn；默认角色/字符串名形式/语句与
//                        screen 控件与 style 属性排除表除外——排除表不全时宁可漏报）
//   missing_asset        show/scene 图像名、play 音频、{font=} 指向不存在的资源（warn）
//   unreachable_label    从 start 出发不可达的 label（info；可能是有意保留的隐藏路线）
// 与 lint 的关系：lint 是权威（引擎解析），本扫描是秒级快速通道，供 agent 改完即查。
const findDiagnostics = (files, assets) => {
  const items = []
  const push = (kind, level, file, line, target, msg) => items.push({ kind, level, file, line, target, msg })
  const a = assets || {}
  const imgFiles = new Set((a.images || []).map((r) => r.replace(/\\/g, "/")))
  const audFiles = new Set((a.audio || []).map((r) => r.replace(/\\/g, "/")))
  const fontFiles = new Set((a.fonts || []).map((r) => r.replace(/\\/g, "/")))

  // 引擎内置默认角色（无需 define）
  const DEFAULT_CHARS = new Set(["narrator", "adv", "nvl", "name_only", "centered", "vcentered", "extend", "none", "null"])
  // 引擎内置特殊 screen（say/choice/save 等，项目脚本无需定义）
  const ENGINE_SCREENS = new Set(["say", "choice", "input", "nvl", "notify", "main_menu", "navigation", "save", "load", "preferences", "confirm", "game_menu", "yesno_prompt", "quick_menu", "file_slots"])
  // 常见场景颜色名（引擎内置图像）
  const COLOR_SCENE = new Set(["black", "white", "red", "green", "blue", "yellow", "cyan", "magenta", "transparent", "solid"])
  // 非角色 token 排除表（语句 / screen 控件 / style 属性 / 测试与翻译关键字 / 常用词）：
  // say 形态歧义时宁可漏报。含 testsuite 命令（id/click/run/advance/until）、translate 块
  // （old/new）、layeredimage 属性（image_format）、screen 属性（style_prefix）。
  const NON_CHAR_TEXT = (
    "menu label jump call return scene show hide with play stop queue window pause " +
    "centered vcentered nvl extend define default image transform screen style init python if elif else " +
    "while for pass break continue function event on showif has spacing alpha offset " +
    "text textbutton button imagebutton vbox hbox fixed grid add bar vbar hbar input timer key " +
    "frame side viewport vpgrid drag draggable mousearea hotspot hotbar null " +
    "background hover_background idle_background selected_background insensitive_background font size bold " +
    "italic underline color hover_color idle_color selected_color insensitive_color outlinecolor " +
    "what_color who_color xalign yalign xpos ypos xsize ysize xfill yfill xmaximum ymaximum " +
    "text_align line_spacing kerning min_width max_width antialias xminimum yminimum " +
    "id click run advance until testcase testsuite old new translate language expression " +
    "image_format style_prefix variant when group auto always attribute"
  )
  const NON_CHAR = new Set(NON_CHAR_TEXT.split(" "))

  // ── 第一遍：收集定义（label/character/screen/image/layeredimage/store 变量） ──
  const labels = new Set(), chars = new Set(), screens = new Set(), images = new Set()
  const storeNames = new Set() // define/default 变量 + python 块 def 函数（show 可显示的对象）
  const defs = [] // {kind, name, file, line}
  for (const f of files || []) {
    const lines = String(f.content || "").split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim()
      if (!t || t.startsWith("#")) continue
      let m
      if ((m = /^label\s+([A-Za-z_][\w.]*)/.exec(t))) { labels.add(m[1]); defs.push({ kind: "label", name: m[1], file: f.rel, line: i + 1 }); continue }
      if ((m = /^(?:define|default)\s+([A-Za-z_][\w.]*)\s*=\s*Character\s*\(/i.exec(t))) { chars.add(m[1]); storeNames.add(m[1]); continue }
      if ((m = /^(?:define|default)\s+([A-Za-z_][\w.]*)\s*=/.exec(t))) { storeNames.add(m[1]); continue }
      if ((m = /^screen\s+([A-Za-z_][\w.]*)/.exec(t))) { screens.add(m[1]); defs.push({ kind: "screen", name: m[1], file: f.rel, line: i + 1 }); continue }
      if ((m = /^image\s+(.+?)\s*=\s*/.exec(t))) { images.add(m[1].trim()); continue }
      // layeredimage 定义名也是图像名（show augustina 合法）
      if ((m = /^layeredimage\s+([A-Za-z_]\w*)/.exec(t))) { images.add(m[1]); continue }
      // python 块内函数定义（def snow_scene(): → show snow_scene 显示 SpriteManager 等对象）
      if (/^def\s+([A-Za-z_]\w*)\s*\(/.test(t)) { storeNames.add(/^def\s+([A-Za-z_]\w*)\s*\(/.exec(t)[1]); continue }
    }
  }
  // 自动图像索引：images/ 下文件名 basename（含空格差分：eileen happy.png → "eileen happy"）
  const autoImages = new Set()
  for (const r of imgFiles) {
    const base = r.split("/").pop().replace(/\.[^.]+$/, "")
    if (base) autoImages.add(base)
  }
  const hasImg = (name) => {
    if (images.has(name) || autoImages.has(name)) return true
    // 差分属性：show augustina happy → 前缀 "augustina" 命中（layeredimage/image 定义名）
    for (const known of images) if (name.startsWith(known + " ")) return true
    return false
  }

  // ── 第二遍：扫描引用（label 图 + 各诊断） ──
  const outEdges = [] // {from, to}（label 图，供可达性）
  for (const f of files || []) {
    const lines = String(f.content || "").split(/\r?\n/)
    let curLabel = null
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim()
      if (!t || t.startsWith("#")) continue
      const ln = i + 1
      const lm = /^label\s+([A-Za-z_][\w.]*)/.exec(t)
      if (lm) { curLabel = lm[1]; continue }

      // jump / call expression（动态跳转，静态无法确认——跳过）
      if (/^(?:jump|call)\s+expression\b/.test(t)) { continue }
      // show/call screen 与 use（screen 引用；须在普通 call 之前，否则 screen 被当 label）
      let m
      if ((m = /^(?:show|call)\s+screen\s+([A-Za-z_][\w.]*)/.exec(t))) {
        if (!screens.has(m[1]) && !ENGINE_SCREENS.has(m[1])) push("undefined_screen", "error", f.rel, ln, m[1], "screen \"" + m[1] + "\" 未定义")
        continue
      }
      if ((m = /^use\s+([A-Za-z_][\w.]*)/.exec(t))) {
        if (!screens.has(m[1]) && !ENGINE_SCREENS.has(m[1])) push("undefined_screen", "error", f.rel, ln, m[1], "use 引用的 screen \"" + m[1] + "\" 未定义")
        continue
      }
      // jump / call 普通（label 引用）
      if ((m = /^jump\s+([A-Za-z_][\w.]*)/.exec(t))) {
        if (!labels.has(m[1])) push("invalid_jump", "error", f.rel, ln, m[1], "jump 目标 label \"" + m[1] + "\" 未定义")
        else if (curLabel) outEdges.push({ from: curLabel, to: m[1] })
        continue
      }
      if ((m = /^call\s+([A-Za-z_][\w.]*)/.exec(t))) {
        if (!labels.has(m[1])) push("invalid_jump", "error", f.rel, ln, m[1], "call 目标 label \"" + m[1] + "\" 未定义")
        else if (curLabel) outEdges.push({ from: curLabel, to: m[1] })
        continue
      }
      // show / scene 图像（取 at/with/as 前的图像名，剥行尾注释；颜色名/已定义图像/自动索引/store 对象放行）
      if ((m = /^(?:show|scene)\s+(.+?)(?:\s+at\b|\s+with\b|\s+as\b|$)/.exec(t))) {
        const imgName = m[1].trim().replace(/\s+#.*$/, "").trim()
        if (imgName !== "expression" && !hasImg(imgName) && !storeNames.has(imgName) && !COLOR_SCENE.has(imgName.split(" ")[0])) {
          push("missing_asset", "warn", f.rel, ln, imgName, "图像 \"" + imgName + "\" 未定义（image/layeredimage/自动索引/store 变量均无）")
        }
        continue
      }
      // play 音频
      if ((m = /^play\s+(?:music|sound|voice|audio)\s+"([^"]+)"/.exec(t))) {
        const rel = m[1].replace(/\\/g, "/")
        if (!audFiles.has(rel) && !audFiles.has("audio/" + rel)) {
          push("missing_asset", "warn", f.rel, ln, m[1], "音频文件 \"" + m[1] + "\" 不存在（相对 game/）")
        }
        continue
      }
      // {font=...} 引用
      const fm = /\{font=([^}\s]+)\}/g
      let fm2
      while ((fm2 = fm.exec(t))) {
        const rel = fm2[1].replace(/\\/g, "/")
        if (!fontFiles.has(rel) && !fontFiles.has("fonts/" + rel)) {
          push("missing_asset", "warn", f.rel, ln, fm2[1], "字体文件 \"" + fm2[1] + "\" 不存在（相对 game/）")
        }
      }
      // say 角色（token + 引号；排除表/默认角色/字符串名形式）
      const sm = /^([A-Za-z_][\w.]*)\s+"/.exec(t)
      if (sm) {
        const who = sm[1]
        if (!DEFAULT_CHARS.has(who.toLowerCase()) && !chars.has(who) && !NON_CHAR.has(who)) {
          push("undefined_character", "warn", f.rel, ln, who, "角色 \"" + who + "\" 未定义（define X = Character 声明后才能使用）")
        }
      }
    }
  }

  // ── 可达性：从 start 出发 BFS（无 start 则跳过——无法确定入口） ──
  const unreachable = []
  if (labels.has("start")) {
    const reach = new Set(["start"])
    const q = ["start"]
    while (q.length) {
      const cur = q.shift()
      for (const e of outEdges) if (e.from === cur && !reach.has(e.to)) { reach.add(e.to); q.push(e.to) }
    }
    for (const l of labels) if (!reach.has(l)) unreachable.push(l)
  }
  const defIdx = {}
  for (const d of defs) { if (!defIdx[d.name]) defIdx[d.name] = d }
  for (const l of unreachable) {
    const d = defIdx[l]
    push("unreachable_label", "info", d ? d.file : "?", d ? d.line : 0, l, "label \"" + l + "\" 从 start 不可达（可能是有意保留的隐藏路线）")
  }

  const counts = {}
  for (const it of items) counts[it.kind] = (counts[it.kind] || 0) + 1
  return { items, counts }
}

// ── 写守卫（保存前强制校验：拦截结构上直接破坏脚本的写入） ─────────────
// 四层校验（保守策略：只报"确定错误"，可疑项不报，避免误伤合法代码）：
//   1. indent     tab 与空格缩进混用（引擎 TabError）；label 后语句未缩进（块归属错误）
//   2. reserved   保留字（Python 关键字 + Ren'Py 语句名/内置）作 label/变量名
//   3. label_dup  文件内 label 重名；opts.labels 提供项目其他文件标签集合可查跨文件冲突
//   4. dialogue   say 对白里花括号 { 与 } / 插值方括号 [ 与 ] 不配对（字面 {{ / [[ 已剥离）
// 返回 { ok, errors: [{line, kind, msg}] }；ok=false 时调用方应拒绝写入（可提供强制写入选项）
const guardRpy = (content, opts = {}) => {
  const errors = []
  const push = (line, kind, msg) => errors.push({ line, kind, msg })
  const lines = String(content || "").split(/\r?\n/)
  const existing = new Set(opts.labels || [])
  const seen = new Set()
  const RESERVED = new Set((
    "and as assert async await break class continue def del elif else except finally for from global if import in is " +
    "lambda nonlocal not or pass raise return try while with yield " +
    "label jump call menu scene show hide with play stop queue window pause define default image transform screen " +
    "style init python renpy config persistent store True False None self narrator"
  ).split(" "))
  // 顶层语句（缩进 0 合法；label 后首个非空行若不属于此集合且未缩进 → 块归属错误）
  const TOP_LEVEL = new Set(["label", "define", "default", "image", "transform", "screen", "style", "init", "translate", "python", "$", "renpy"])

  let hasTabIndent = false, hasSpaceIndent = false, firstTabLine = 0
  let pendingLabelLine = null
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const t = raw.trim()
    if (!t || t.startsWith("#")) continue
    const ln = i + 1
    if (/^\t/.test(raw)) { if (!hasTabIndent) firstTabLine = ln; hasTabIndent = true }
    if (/^ +/.test(raw)) hasSpaceIndent = true
    const indent = (raw.match(/^ */) || [""])[0].length

    // label 定义：保留名 + 文件内/跨文件重名
    let m = /^label\s+([A-Za-z_]\w*)/.exec(t)
    if (m) {
      const name = m[1]
      if (seen.has(name)) push(ln, "label_dup", "label \"" + name + "\" 在本文件重复定义")
      else if (existing.has(name)) push(ln, "label_dup", "label \"" + name + "\" 与项目其他文件已存在的 label 冲突")
      else if (RESERVED.has(name)) push(ln, "reserved", "label 名 \"" + name + "\" 是保留字，不能用作 label")
      seen.add(name)
      pendingLabelLine = ln
      continue
    }
    // label 后首个非空行未缩进（非顶层语句）→ 块归属错误
    if (pendingLabelLine !== null) {
      if (indent === 0) {
        const firstWord = /^[A-Za-z_$]+/.exec(t)
        if (!firstWord || !TOP_LEVEL.has(firstWord[0])) {
          push(ln, "indent", "label 块内语句未缩进（label 定义在第 " + pendingLabelLine + " 行；块内语句需缩进 4 空格）")
        }
      }
      pendingLabelLine = null
    }
    // define/default 变量名保留字
    m = /^(?:define|default)\s+([A-Za-z_]\w*)\s*=/.exec(t)
    if (m && RESERVED.has(m[1])) push(ln, "reserved", "变量名 \"" + m[1] + "\" 是保留字，不能用作变量")

    // 对白转义：say 行第一段引号文本的括号配对
    const sayM = /^(?:[A-Za-z_][\w.]*\s+)?"([^"]*)"(?:\s*(?:with\b|nointeract\b|\(|$))/.exec(t)
    if (sayM) {
      // 剥离字面花括号/方括号（{{…} 与 [[…]），再计数配对
      const stripped = sayM[1].replace(/\{\{.*?\}/g, "").replace(/\[\[.*?\]/g, "")
      const ob = (stripped.match(/\{/g) || []).length, cb = (stripped.match(/\}/g) || []).length
      if (ob !== cb) push(ln, "dialogue", "对白花括号不配对（{ " + ob + " 个 / } " + cb + " 个；字面 { 需写 {{）")
      const os = (stripped.match(/\[/g) || []).length, cs = (stripped.match(/\]/g) || []).length
      if (os !== cs) push(ln, "dialogue", "对白插值方括号不配对（[ " + os + " 个 / ] " + cs + " 个；字面 [ 需写 [[）")
    }
  }
  if (hasTabIndent && hasSpaceIndent) push(firstTabLine, "indent", "tab 与空格缩进混用（引擎会报 TabError）")

  return { ok: errors.length === 0, errors }
}

module.exports = { lineDiff, hasOpenToolCall, layoutRouteMap, computeRouteMeta, parseTraceback, parseLog, parseErrors, findDiagnostics, guardRpy }
