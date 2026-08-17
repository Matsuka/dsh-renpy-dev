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

  // 同层纵向排列
  const byLayer = new Map()
  for (const s of map.states || []) {
    const l = layerOf.get(s.id)
    if (!byLayer.has(l)) byLayer.set(l, [])
    byLayer.get(l).push(s)
  }
  for (const [l, states] of byLayer) {
    states.forEach((s, i) => {
      byId[s.id] = { id: s.id, name: s.name, role: s.role || 'scene', x: l * gapX + 30, y: i * gapY + 30 }
    })
  }

  const edges = (map.transitions || []).map((t) => {
    const a = byId[t.from], b = byId[t.to]
    if (!a || !b) return null
    return { from: t.from, to: t.to, type: t.type, x1: a.x + 60, y1: a.y + 24, x2: b.x, y2: b.y + 24 }
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

module.exports = { lineDiff, hasOpenToolCall, layoutRouteMap, computeRouteMeta }
