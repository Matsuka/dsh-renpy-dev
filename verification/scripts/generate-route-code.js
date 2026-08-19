#!/usr/bin/env node
/**
 * route-map → Ren'Py 代码骨架生成器（状态机 → 代码方向）
 *
 * 输入：route-map.json（状态机结构，见 route-map-schema.md v1.0）
 * 输出：.rpy 代码骨架（label + entryActions + 转移）
 *
 * 用法：node generate-route-code.js <route-map.json> [out.rpy]
 *
 * 映射规则（对齐 skill renpy-route 第三章）：
 *   - 状态 → label + entryActions（$ var = val）
 *   - jump/call → jump/call 语句
 *   - menu → menu: + 选项
 *   - conditional（if 守卫）→ if/elif/else + jump
 *   - conditional（离散值）→ match 语句
 *   - conditional（随机）→ if renpy.random.random() < p
 *   - ending → return
 *   - 剧情锁 persistent → $ persistent.seen_x = True
 */
'use strict'
const fs = require('fs')
const path = require('path')

const inFile = process.argv[2]
const outFile = process.argv[3] || 'generated_route.rpy'
if (!inFile) { console.error('用法: node generate-route-code.js <route-map.json> [out.rpy]'); process.exit(1) }

const map = JSON.parse(fs.readFileSync(inFile, 'utf8'))

// ── 状态 id → 代码 ────────────────────────────────────────────────────
const stateById = new Map(map.states.map((s) => [s.id, s]))

function indent(n) { return '    '.repeat(n) }

// 比较符取反（用于判断 true/false 分支对）
function invOp(op) {
  return { '>': '<=', '<': '>=', '>=': '<', '<=': '>', '==': '!=', '!=': '==' }[op] || op
}

function genEntryActions(s) {
  // entryActions: [{var, value}] → $ var = value
  const lines = []
  for (const a of s.entryActions || []) {
    lines.push(indent(1) + '$ ' + a.var + ' = ' + a.value)
  }
  return lines
}

function genEnding(s) {
  // ending 状态：return（除非有明确出转移）
  return [indent(1) + 'return']
}

function genState(s) {
  const out = []
  out.push('')
  if (s.description) out.push('# ' + String(s.description).split('\n').join('\n# '))
  out.push('label ' + s.name + ':')
  out.push(...genEntryActions(s))

  // 该状态的出转移
  const outs = map.transitions.filter((t) => t.from === s.id)

  if (outs.length === 0) {
    // 无出转移：ending 或待确认
    if (s.role === 'ending' || /end/i.test(s.name)) {
      out.push(...genEnding(s))
    } else {
      out.push(indent(1) + '# TODO: 无出转移（待确认：ending 或死路）')
    }
    return out
  }

  // menu 类型：多个 menu 选项
  const menuOuts = outs.filter((t) => t.type === 'menu')
  if (menuOuts.length > 0) {
    out.push(indent(1) + 'menu:')
    for (const t of menuOuts) {
      const choice = (t.choiceText || t.label || '选项').replace(/^choice:"|"$/g, '')
      const guard = t.guard ? ' if ' + t.guard : ''
      out.push(indent(2) + '"' + choice + '"' + guard + ':')
      const target = stateById.get(t.to)
      out.push(indent(3) + (target ? 'jump ' + target.name : '# TODO: 目标待确认'))
    }
    return out
  }

  // conditional：if/elif/else 或 match
  const conds = outs.filter((t) => t.type === 'conditional')
  if (conds.length > 0) {
    // 离散值（match）：所有 guard 都是 var == "值" 或类似
    const isMatch = conds.every((t) => /^\w+\s*==\s*["'][^"']+["']$/.test(t.guard || ''))
    if (isMatch && conds.length >= 2) {
      const matchVar = conds[0].guard.match(/^(\w+)\s*==/)[1]
      out.push(indent(1) + 'python:')
      out.push(indent(2) + 'match ' + matchVar + ':')
      for (const t of conds) {
        const val = t.guard.match(/==\s*["']([^"']+)["']$/)[1]
        out.push(indent(3) + 'case "' + val + '":')
        const target = stateById.get(t.to)
        out.push(indent(4) + (target ? 'jump ' + target.name : '# TODO'))
      }
    } else {
      // if/elif/else 链
      // 优化：成对的 true/false（guard X 和 其取反/else）→ if/else，不生成冗余 elif
      let first = true
      let prevGuard = null
      for (let i = 0; i < conds.length; i++) {
        const t = conds[i]
        const guard = t.guard
        const isElse = guard === 'else'
        // 判断当前 guard 是否是前一个的取反（else / not (X) / 比较符互斥）
        const isNegation = prevGuard && (
          guard === 'else' ||
          guard === 'not (' + prevGuard + ')' ||
          'not (' + guard + ')' === prevGuard ||
          (() => {
            // 比较符取反：affection < 70 的取反是 affection >= 70
            const pm = prevGuard.match(/^(\w+)\s*([<>]=?)\s*([\d.]+)$/)
            const gm = guard.match(/^(\w+)\s*([<>]=?)\s*([\d.]+)$/)
            return pm && gm && pm[1] === gm[1] && pm[3] === gm[3] && gm[2] === invOp(pm[2])
          })()
        )
        if (first) {
          out.push(indent(1) + 'if' + (isElse ? '' : ' ' + guard) + ':')
        } else if (isNegation) {
          out.push(indent(1) + 'else:')
        } else {
          out.push(indent(1) + (isElse ? 'else' : 'elif ' + guard) + ':')
        }
        const target = stateById.get(t.to)
        out.push(indent(2) + (target ? 'jump ' + target.name : '# TODO'))
        first = false
        if (!isElse) prevGuard = guard
      }
    }
    return out
  }

  // 其他（jump/call/sequential）
  for (const t of outs) {
    if (t.type === 'jump' || t.type === 'menu') {
      const target = stateById.get(t.to)
      out.push(indent(1) + 'jump ' + (target ? target.name : '# TODO'))
    } else if (t.type === 'call') {
      const target = stateById.get(t.to)
      out.push(indent(1) + 'call ' + (target ? target.name : '# TODO'))
    } else if (t.type === 'return') {
      out.push(indent(1) + 'return')
    }
  }

  return out
}

// ── 生成默认变量声明（default/define） ────────────────────────────────
function genDefaults() {
  const out = []
  for (const v of map.variables || []) {
    if ((v.kind === 'default' || v.kind === 'define') && v.defaultValue !== undefined && v.defaultValue !== '') {
      out.push(v.kind + ' ' + v.name + ' = ' + v.defaultValue)
    }
  }
  return out
}

// ── 组装 ──────────────────────────────────────────────────────────────
const out = []
out.push('# 由 route-map.json 生成的 Ren' + 'Py 代码骨架（generate-route-code.js）')
out.push('# 状态机: ' + (map.project || 'unknown'))
out.push('# 生成时间: ' + new Date().toISOString())

// 待确认项（meta.pending）→ 文件头 TODO 注释（人机协作：生成后需人工确认）
if (map.meta && Array.isArray(map.meta.pending) && map.meta.pending.length) {
  out.push('#')
  out.push('# ── 待确认项（生成后需人工确认/补全） ──')
  for (const p of map.meta.pending) out.push('# TODO: ' + p)
}
out.push('')
out.push('# ── 变量声明 ──')
out.push(...genDefaults())
out.push('')

// 按顺序生成状态（先初始状态）
const ordered = [map.initialState ? stateById.get('s_' + map.initialState) : null, ...map.states.filter((s) => s.name !== map.initialState)].filter(Boolean)
const seen = new Set()
for (const s of ordered) {
  if (seen.has(s.id)) continue
  seen.add(s.id)
  out.push(...genState(s))
}

fs.writeFileSync(outFile, out.join('\n') + '\n')
console.log('生成完成: ' + outFile)
console.log('状态 ' + map.states.length + ' 个, 转移 ' + map.transitions.length + ' 条')
