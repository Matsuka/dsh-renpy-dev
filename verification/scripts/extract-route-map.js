#!/usr/bin/env node
/**
 * route-map 静态分析器原型（代码 → 状态机）
 *
 * 输入：Ren'Py 项目 game/ 目录
 * 输出：route-map.json（状态机结构，见 route-map-schema.md v1.0）
 *
 * 用法：node extract-route-map.js <project_dir> [out.json]
 *
 * 解析范围（原型）：
 *   - label x: → 状态（kind=label）
 *   - jump/call/return → 转移
 *   - menu: + 选项 → menu 状态 + 选项转移
 *   - if/elif/else → conditional 转移（guard）
 *   - $ var = val / default / define → 变量
 *   - say → 交互点（状态内，转移 event=dismiss）
 *   - 字符串插值 [var] → 变量读取
 *
 * 注意：这是原型，不做完整 Ren'Py 语法解析（复杂嵌套/ATL/screen 深水区后续完善）
 */
'use strict'
const fs = require('fs')
const path = require('path')

const projDir = process.argv[2]
const outFile = process.argv[3] || path.join(projDir, 'route-map.json')
if (!projDir) { console.error('用法: node extract-route-map.js <project_dir> [out.json]'); process.exit(1) }

const gameDir = path.join(projDir, 'game')

// ── 收集所有 .rpy 文件 ──────────────────────────────────────────────
const rpyFiles = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue  // 跳过隐藏/内部
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.rpy')) rpyFiles.push(p)
  }
})(gameDir)

// ── 行级解析 ────────────────────────────────────────────────────────
// 状态：label 定义
const states = []
// 转移：跳转/调用/选项/条件
const transitions = []
// 变量
const variables = []
// label 名 → 状态 id（去重用）
const labelToState = new Map()
// 当前正在解析的 label 上下文
let curState = null
// 当前 label 内"最后一条流程语句"是否出口（jump/menu/return/带 else 的完整 if 链）——顺序落入检测用
let lastFlow = 'none'
// 当前 label 所在文件（顺序落入只限同文件）
let curFile = null
// 顶层 return 出口的 label id（角色推断：ending；嵌套 if/menu 块内的 return 不算 label 出口）
const returnExits = new Set()

function addState(name, line, file) {
  // 若已存在：真实定义（line>0）应更新位置；占位定义（line=-1）保留等真实定义
  if (labelToState.has(name)) {
    const id = labelToState.get(name)
    const s = states.find((x) => x.id === id)
    if (s && line > 0 && s.line === -1) { s.line = line; s.file = file }
    return id
  }
  const id = 's_' + name.replace(/[^a-zA-Z0-9_]/g, '_')
  const s = { id, name, kind: 'label', file, line, role: 'scene', entryActions: [], outTransitions: [] }
  states.push(s)
  labelToState.set(name, id)
  return id
}

function addTransition(from, to, type, extra = {}) {
  if (!from || !to) return null
  // 去重：同 from/to/type/label 的转移只保留一条（guard/event 更具体的优先）
  const dup = transitions.find((t) =>
    t.from === from && t.to === to && t.type === type && t.label === (extra.label || null)
  )
  // 额外去重：若已有同 from→to 的 conditional 转移，则跳过纯 jump（冗余）
  if (!dup && type === 'jump' && !extra.guard) {
    const hasCond = transitions.find((t) => t.from === from && t.to === to && t.type === 'conditional')
    if (hasCond) return hasCond.id
  }
  if (dup) {
    // 已有无 guard 的，新的有 guard → 升级
    if (!dup.guard && extra.guard) { dup.guard = extra.guard; dup.branch = extra.branch }
    return dup.id
  }
  const id = 't_' + transitions.length
  const t = Object.assign({ id, from, to, type }, extra)
  transitions.push(t)
  const fs = states.find((s) => s.id === from)
  if (fs) fs.outTransitions.push(id)
  return id
}

function trackVar(name, kind, line, file, value) {
  let v = variables.find((x) => x.name === name)
  if (!v) { v = { name, kind, definedAt: null, defaultValue: undefined, readIn: [], writtenIn: [], usedInGuards: [] }; variables.push(v) }
  if (kind === 'default' || kind === 'define') {
    v.kind = kind
    v.definedAt = { file, line }
    if (value !== undefined) v.defaultValue = value.replace(/\s*#.*$/, '').trim()
  } else if (kind === 'write') {
    if (!v.writtenIn.includes(curState)) v.writtenIn.push(curState)
  } else if (kind === 'read') {
    if (curState && !v.readIn.includes(curState)) v.readIn.push(curState)
  } else if (kind === 'guard') {
    if (!v.usedInGuards.includes(line)) v.usedInGuards.push(line)
  }
  return v
}

// 提取字符串插值 [var] 和赋值 $ var =
const INTERP = /\[([a-zA-Z_][a-zA-Z0-9_]*)\]/g
const ASSIGN = /^\s*\$?\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/
const DEFAULT = /^\s*default\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/
const DEFINE = /^\s*define\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/
const JUMP = /^\s*jump\s+([a-zA-Z_.]+)/
const CALL = /^\s*call\s+([a-zA-Z_.]+)/
const RETN = /^\s*return\b/
const MENU = /^\s*menu:/
const MENU_ITEM = /^\s+"([^"]+)"(?:\s+if\s+(.+))?$/
const IF = /^\s*if\s+(.+):$/
const ELIF = /^\s*elif\s+(.+):$/
const ELSE = /^\s*else:/
const LABEL = /^\s*label\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*:/
const SAY = /^\s*("[^"]+")\s*$/
const SAY_CHAR = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+"[^"]*"\s*$/

for (const file of rpyFiles) {
  const rel = path.relative(projDir, file).replace(/\\/g, '/')
  const lines = fs.readFileSync(file, 'utf8').split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const ln = i + 1

    // 字符串插值读取（任意行）
    for (const m of line.matchAll(INTERP)) trackVar(m[1], 'read', ln, rel)

    // default/define 变量（全局有效，label 内外都提取）
    let dm = line.match(DEFAULT)
    if (dm) { trackVar(dm[1], 'default', ln, rel, dm[2]); trackVar(dm[1], 'write', ln, rel); continue }
    dm = line.match(DEFINE)
    if (dm) { trackVar(dm[1], 'define', ln, rel, dm[2]); continue }

    // label 定义
    const lm = line.match(LABEL)
    if (lm) {
      // 顺序落入：上一 label 体未以出口语句结束、且同文件 → 隐式顺序转移
      if (curState && lastFlow !== 'exit' && curFile === rel) {
        addTransition(curState, addState(lm[1], ln, rel), 'sequential', {})
      }
      curState = addState(lm[1], ln, rel)
      curFile = rel
      lastFlow = 'none'
      continue
    }

    if (!curState) continue  // label 外不分析

    // 赋值 $ x = y
    const am = line.match(ASSIGN)
    if (am && !line.trim().startsWith('#')) { trackVar(am[1], 'write', ln, rel); continue }

    // menu 块
    if (line.match(MENU)) {
      // 遍历后续缩进的选项行（menu 选项格式："文本": 或 "文本" if 条件:）
      const menuIndent = (line.match(/^\s*/) || [''])[0].length
      for (let j = i + 1; j < lines.length; j++) {
        const ml = lines[j]
        const mIndent = (ml.match(/^\s*/) || [''])[0].length
        if (mIndent <= menuIndent) break  // 缩进结束，退出 menu
        if (/^\s*$/.test(ml) || /^\s*#/.test(ml)) continue
        // 选项行："文本" 或 "文本" if 条件
        const item = ml.match(/^\s*"([^"]+)"(?:\s+if\s+(.+))?\s*:\s*$/)
        if (item) {
          const choiceText = item[1]
          const guard = item[2] || null
          // 在选项块内找 jump/call 目标
          const optIndent = mIndent
          for (let k = j + 1; k < lines.length; k++) {
            const ol = lines[k]
            const oIndent = (ol.match(/^\s*/) || [''])[0].length
            if (oIndent <= optIndent) break
            const ojm = ol.match(/^\s*jump\s+([a-zA-Z_.]+)/)
            if (ojm) {
              addTransition(curState, labelToState.get(ojm[1]) || addState(ojm[1], -1, rel), 'menu', {
                event: 'choice:"' + choiceText + '"', guard, choiceText, label: ojm[1],
              })
              break
            }
            const ocm = ol.match(/^\s*call\s+([a-zA-Z_.]+)/)
            if (ocm) {
              addTransition(curState, labelToState.get(ocm[1]) || addState(ocm[1], -1, rel), 'menu', {
                event: 'choice:"' + choiceText + '"', guard, choiceText, label: ocm[1],
              })
              break
            }
          }
        }
      }
      i = skipBlock(lines, i)
      lastFlow = 'exit'  // menu 必然暂停交互，所有路径从选项继续
      continue
    }

    // if/elif/else → conditional 转移（完整链处理）
    const im = line.match(IF)
    if (im) {
      const ifIndent = (line.match(/^\s*/) || [''])[0].length
      // 收集 if-elif-else 整条链：每个分支的 guard + 跳转目标
      const chain = []
      let guard = im[1]
      let blockStart = i
      // 收集当前 if 分支的跳转
      chain.push({ guard, targets: findBranchTargets(lines, i, rel) })
      // 扫描后续 elif/else
      let j = i + 1
      while (j < lines.length) {
        const ol = lines[j]
        if (/^\s*$/.test(ol)) { j++; continue }
        const oIndent = (ol.match(/^\s*/) || [''])[0].length
        if (oIndent < ifIndent) break
        if (oIndent > ifIndent) { j++; continue }  // 块内，继续找链
        const em = ol.match(/^\s*elif\s+(.+):\s*$/)
        if (em) { chain.push({ guard: em[1], targets: findBranchTargets(lines, j, rel) }); j++; continue }
        const elseM = ol.match(/^\s*else\s*:\s*$/)
        if (elseM) { chain.push({ guard: 'else', targets: findBranchTargets(lines, j, rel) }); j++; continue }
        break  // 同级非 elif/else：链结束
      }
      // 生成转移：每个分支一条 conditional（else 分支 guard=else）
      for (const c of chain) {
        // guard 表达式里的变量计入读取（条件依赖）
        if (c.guard !== 'else') {
          const varRe = /[a-zA-Z_][a-zA-Z0-9_]*/g
          for (const vm of c.guard.matchAll(varRe)) {
            // 跳过字面量（数字/True/False/None/and/or/not/比较符）
            if (!/^(True|False|None|and|or|not|in|is|if|else|>=|<=|==|!=|>|<|\d+)$/.test(vm[0])) {
              trackVar(vm[0], 'guard', ln, rel)
            }
          }
        }
        for (const t of c.targets) {
          addTransition(curState, labelToState.get(t.label) || addState(t.label, -1, rel), 'conditional', {
            guard: c.guard === 'else' ? 'else' : c.guard,
            label: t.label,
            branch: c.guard === 'else' ? 'false' : 'true',
          })
        }
      }
      i = skipBlock(lines, i)
      // 完整 if-elif-else 链：有"带跳转的 else"才保证全分支出口；否则条件全不满足时顺序落入
      lastFlow = chain.some((c) => c.guard === 'else' && c.targets.length > 0) ? 'exit' : 'flow'
      continue
    }

    // jump
    const jm = line.match(JUMP)
    if (jm) {
      addTransition(curState, labelToState.get(jm[1]) || addState(jm[1], -1, rel), 'jump', { label: jm[1] })
      lastFlow = 'exit'
      continue
    }

    // call（返回后继续本 label 后续语句 → 不算出口）
    const cm = line.match(CALL)
    if (cm) {
      addTransition(curState, labelToState.get(cm[1]) || addState(cm[1], -1, rel), 'call', { label: cm[1] })
      lastFlow = 'flow'
      continue
    }

    // return（顶层 return = label 出口；记入 returnExits 供角色推断，转移本身不落图）
    if (line.match(RETN)) {
      if (curState) returnExits.add(curState)
      lastFlow = 'exit'
      continue
    }

    // say（交互点）—— 状态内，记录为可推进点（原型：标记 kind）
    if (line.match(SAY) || line.match(SAY_CHAR)) {
      // 顺序链：如果前面有 seqStart 且无跳转，这里是一个交互点；原型简化不拆分
      continue
    }
  }
}

// ── 辅助函数 ────────────────────────────────────────────────────────
function skipBlock(lines, i) {
  // 跳过 if/elif/else 链：从 if 行开始，跳过其块直到链结束（else/elif 也属于链）。
  // 注意：只跳这一条链，不跳过后续同级的独立 if（顺序块）。
  const baseIndent = (lines[i].match(/^\s*/) || [''])[0].length
  let j = i + 1
  let inChain = true
  while (j < lines.length) {
    const ol = lines[j]
    if (/^\s*$/.test(ol)) { j++; continue }
    const oIndent = (ol.match(/^\s*/) || [''])[0].length
    if (oIndent <= baseIndent) {
      // 同级：elif/else 属于本链继续；其他语句结束链
      if (/^\s*(elif|else)\s*:/.test(ol)) { inChain = true; j++; continue }
      break
    }
    j++
  }
  return j - 1
}

function findNextLabel(lines, j, projDir, rpyFiles) {
  // 原型简化：查找 demo-script 中已知的 label（粗）
  // 真实实现应从代码块内跳转推导；这里返回 null 由调用方补 label 状态
  return null
}

function findBranchTargets(lines, i, rel) {
  // 收集 if/else 块"直接子语句"层级的 jump/call 目标。
  // 规则：目标跳转的缩进深度 = if 行缩进 + 1（直接子块）或 + 2（menu 选项内常见）。
  // 更深的缩进（嵌套 if/嵌套块内）不收集——那是嵌套控制流，不是本分支的跳转。
  const baseIndent = (lines[i].match(/^\s*/) || [''])[0].length
  const targets = []
  let j = i + 1
  while (j < lines.length) {
    const ol = lines[j]
    if (/^\s*$/.test(ol)) { j++; continue }
    const oIndent = (ol.match(/^\s*/) || [''])[0].length
    if (oIndent <= baseIndent) break  // 回到同级或更浅：块结束
    // 跳过嵌套控制块（if/menu/python/with 等更深结构），不收集其内部跳转
    if (/^\s*(if|elif|else|menu|python|with|while|for)\b/.test(ol)) {
      // 跳过整个嵌套块（直到缩进回到当前层级）
      j = skipNestedBlock(lines, j, oIndent)
      continue
    }
    const jm = ol.match(/^\s*jump\s+([a-zA-Z_.]+)/)
    if (jm) { targets.push({ label: jm[1] }); j++; continue }
    const cm = ol.match(/^\s*call\s+([a-zA-Z_.]+)/)
    if (cm) { targets.push({ label: cm[1] }); j++; continue }
    j++
  }
  return targets
}

function skipNestedBlock(lines, i, blockIndent) {
  // 跳过从 i 开始、缩进 >= blockIndent 的嵌套块
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

// ── 角色推断（分支类型：start/choice/ending/dead_end/orphan/loop） ────
// 规则（按优先级）：
//   1. 初始状态 → start
//   2. 无出向状态转移（终点）→ 顶层 return 出口且非"仅被 call 进入"（子例程）或结局命名 → ending；否则 → dead_end
//   3. 有自环转移 → loop
//   4. 有 menu 出转移 → choice（玩家选择点）
//   5. 无入转移（不可达，非起点）→ orphan
//   6. 其余 → scene
// 结局命名启发式：_end 结尾 / end / ending / finale / fin_ / 结局
const isEndingName = (name) => /(?:^|_)(?:end|ending|finale|fin)(?:_|$)/i.test(String(name || '')) || /结局/.test(String(name || ''))
function inferRoles(states, transitions, initialState, returnExits) {
  const byId = new Map(states.map((s) => [s.id, s]))
  const incoming = new Map()   // to → [from...]
  const selfLoop = new Set()   // 自环
  const hasOut = new Set()     // 有指向真实状态的出转移
  for (const t of transitions) {
    if (t.to === null || t.to === undefined || !byId.has(t.to)) continue
    if (!t.from) continue
    hasOut.add(t.from)
    if (t.from === t.to) selfLoop.add(t.from)
    if (!incoming.has(t.to)) incoming.set(t.to, [])
    incoming.get(t.to).push(t.from)
  }
  // 仅被 call 进入（所有入转移都是 call）→ 子例程：return 返回调用方，不是结局
  const callOnly = new Set()
  for (const [to, froms] of incoming) {
    const allCall = froms.every((f) => transitions.some((t) => t.from === f && t.to === to && t.type === 'call'))
    if (allCall) callOnly.add(to)
  }
  for (const s of states) {
    let role
    if (s.name === initialState) role = 'start'
    else if (!hasOut.has(s.id)) {
      role = (returnExits.has(s.id) && !callOnly.has(s.id)) || isEndingName(s.name) ? 'ending' : 'dead_end'
    }
    else if (selfLoop.has(s.id)) role = 'loop'
    else if (transitions.some((t) => t.from === s.id && t.type === 'menu')) role = 'choice'
    else if (!incoming.has(s.id)) role = 'orphan'
    else role = 'scene'
    s.role = role
  }
}
inferRoles(states, transitions, 'start', returnExits)

// ── 输出 ────────────────────────────────────────────────────────────
const routeMap = {
  schema: 'route-map/1.0',
  project: path.basename(projDir),
  sdkVersion: '8.5.3',
  generatedAt: new Date().toISOString(),
  initialState: 'start',
  states,
  transitions,
  variables,
  meta: {
    totalStates: states.length,
    totalTransitions: transitions.length,
    // endStates：role=ending 且无嵌套子状态（排除 route_listen 这类有子 label 的父状态）
    endStates: states.filter((s) => {
      if (s.role !== 'ending') return false
      const hasChild = states.some((o) => o.id !== s.id && o.name.startsWith(s.name + '_'))
      return !hasChild
    }).map((s) => s.id),
    unresolvedLabels: [...new Set(transitions.filter((t) => t.label && !labelToState.has(t.label)).map((t) => t.label))],
  },
}

fs.writeFileSync(outFile, JSON.stringify(routeMap, null, 2))
console.log(`分析完成: ${rpyFiles.length} 个 .rpy → ${states.length} 状态, ${transitions.length} 转移, ${variables.length} 变量`)
console.log(`输出: ${outFile}`)
