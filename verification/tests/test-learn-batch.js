// 学习批量目标收集集成验证：renpyLearnNotes 输出 + 工作区域过滤 + 已注释跳过
const fs = require('fs')
const src = fs.readFileSync(require('./paths').CLIENT_SRC, 'utf8')

// renpyLearnNotes 用 test-learn.js 的专用提取（含正则+引号，通用括号平衡不可靠）
const rnM = src.match(/const renpyLearnNotes = \(src\) => \{[\s\S]*?\n\t\t\};/)
if (!rnM) { console.log('未找到 renpyLearnNotes'); process.exit(1) }
// TDZ 坑：eval 赋值名不能撞外层 const，用 var 全局名承接
var __rln__
const rln = eval('(' + rnM[0].replace(/^const /, '').replace(/renpyLearnNotes/, '__rln__').replace(/;$/, '') + ')')
const renpyLearnNotes = rln
const LEARN_MARK = src.match(/const LEARN_MARK = "([^"]*)";/)[1]

// 小函数（无复杂正则）用逐行平衡提取
const grabSmall = (name) => {
  const lines = src.split('\n')
  let startLine = -1
  for (let li = 0; li < lines.length; li++) {
    if (lines[li].indexOf('const ' + name + ' = ') >= 0) { startLine = li; break }
  }
  if (startLine < 0) { console.log('未找到 ' + name); process.exit(1) }
  const text = lines.slice(startLine).join('\n')
  const eqIdx = text.indexOf('=')
  let depth = 0, inStr = null, esc = false, end = -1
  let inLineComment = false
  for (let i = eqIdx + 1; i < text.length; i++) {
    const ch = text[i], prev = text[i - 1]
    if (inLineComment) { if (ch === '\n') inLineComment = false; continue }
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === inStr) inStr = null
      continue
    }
    if (ch === '/' && prev === '/') { inLineComment = true; continue }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue }
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break } }
  }
  const expr = text.slice(eqIdx + 1, end)
  return eval('(' + expr + ')')
}
const insertLearn = grabSmall('insertLearnComment')
const findLearnBlock = grabSmall('findLearnBlock')
const learnCommentLines = grabSmall('learnCommentLines')

let p = 0, f = 0
const ok = (c, msg, extra) => { if (c) { p++; } else { f++; console.log('  ✗ FAIL:', msg, extra !== undefined ? '| got ' + JSON.stringify(extra) : '') } }

const atl = fs.readFileSync(require('./paths').DEMO_SCRIPT + '/game/atl_test.rpy', 'utf8')
const notes = renpyLearnNotes(atl)

// 模拟 collectLearnTargets：wsLock = atl_test.rpy 8-15
const wsLock = { file: 'atl_test.rpy', startLine: 8, endLine: 15 }
const activeName = 'atl_test.rpy'
const inWs = wsLock.file === activeName
const lines = atl.split('\n')
const collect = (skipCommentBlocks) => {
  const targets = []
  for (const n of notes) {
    if (!n.note || n.kind === 'comment' || n.kind === 'blank' || n.kind === 'other') continue
    if (inWs && (n.line < wsLock.startLine || n.line > wsLock.endLine)) continue
    if (skipCommentBlocks && findLearnBlock(atl, n.line)) continue
    targets.push({ line: n.line, code: lines[n.line - 1], skill: n.skill ? n.skill.split('·')[0].trim() : '' })
  }
  return targets
}
const inWsTargets = collect(false)
ok(inWsTargets.length > 0, '区域内有可注释目标', inWsTargets.length)
ok(inWsTargets.every((t) => t.line >= 8 && t.line <= 15), '全部目标在 8-15 内', inWsTargets.map((t) => t.line))
// 区域内是 python 函数行：应识别为 python kind 映射 renpy-core
ok(inWsTargets.every((t) => t.skill === 'renpy-core'), '区域内 python 行映射 renpy-core', inWsTargets.map((t) => t.skill))

// 无区域约束 → 整文件
const noWs = []
for (const n of notes) {
  if (!n.note || n.kind === 'comment' || n.kind === 'blank' || n.kind === 'other') continue
  noWs.push(n.line)
}
ok(noWs.length > inWsTargets.length, '整文件目标 > 区域目标', noWs.length + ' vs ' + inWsTargets.length)
ok(noWs.every((l) => l >= 1 && l <= notes.length), '整文件目标行号合法', '')

// 已注释跳过：给某行插入学习注释后，重新收集应排除该行
const withComment = insertLearn(atl, 18, 'xalign 设置水平对齐', 'renpy-atl')
const notes2 = renpyLearnNotes(withComment)
let skipped = false
for (const n of notes2) {
  // 插入 2 行块后，原 L18 现在在 L20（且该行被注释块覆盖，n.line 指向注释块内部或代码行）
  if (findLearnBlock(withComment, n.line)) { skipped = true; break }
}
ok(skipped, '已注释行被 findLearnBlock 检测', skipped)
// 插入注释后行号偏移：原 18 行变 20（插入 2 行：标记+正文）
ok(withComment.split('\n').length === atl.split('\n').length + 2, '插入注释块行数 +2', withComment.split('\n').length - atl.split('\n').length)

// 区域内插入注释后 lint 兼容（注释不破坏语法）——用 demo 项目验证已在别处，这里验证块格式
const blk = findLearnBlock(withComment, 20) // 原 18 行 → 20（插 2 行后）
ok(blk !== null && blk.start === 18 && blk.end === 19, '注释块区间正确（插入后）', blk)

console.log(p + ' passed, ' + f + ' failed')
process.exit(f ? 1 : 0)
