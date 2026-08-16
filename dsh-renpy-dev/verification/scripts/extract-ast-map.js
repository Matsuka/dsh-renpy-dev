// 混合流程①：从 renpy/ast.py 机械提取"语句类 → execute 调用序列"（无 AI，纯静态分析）
// 用法：node extract-ast-map.js <sdk>/renpy/ast.py [输出.json]
const fs = require('fs')
const path = require('path')

const astFile = process.argv[2]
if (!astFile) {
  console.error('用法: node extract-ast-map.js <sdk>/renpy/ast.py [输出.json]')
  process.exit(1)
}
const lines = fs.readFileSync(astFile, 'utf8').split('\n')

const classes = []
let cur = null
let inExecute = false
let execBody = []

const isCls = /^class (\w+)\(Node\):/
const isAttr = /^    (\w+):/
const isExecStart = /^    def execute(?:\(self[^)]*\))?:/
const isMethod = /^    def /
const isTop = /^\S/

for (let i = 0; i < lines.length; i++) {
  const l = lines[i]
  const cm = isCls.exec(l)
  if (cm) {
    if (cur) classes.push(cur)
    cur = { className: cm[1], attrs: [], statementName: null, renpyCalls: [], internals: [], exec: '' }
    inExecute = false
    continue
  }
  if (!cur) continue
  if (isAttr.test(l) && !inExecute) {
    cur.attrs.push(l.trim().replace(/:.*/, ''))
    continue
  }
  if (isExecStart.test(l)) {
    inExecute = true
    execBody = []
    continue
  }
  if (inExecute) {
    if (isMethod.test(l) || isTop.test(l)) {
      inExecute = false
      finishExec(cur, execBody)
    } else {
      execBody.push(l)
    }
    continue
  }
}
if (cur) { classes.push(cur) }
function finishExec(cls, body) {
  const src = body.join('\n')
  cls.exec = src.slice(0, 1200)
  const sm = /statement_name\("([^"]+)"\)/.exec(src)
  if (sm) cls.statementName = sm[1]
  const rc = new Set()
  for (const m of src.matchAll(/renpy\.([a-z_]+)(?:\.([a-z_]+))?\(/g)) {
    rc.add(m[1] + (m[2] ? '.' + m[2] : ''))
  }
  cls.renpyCalls = [...rc]
  const ic = new Set()
  for (const m of src.matchAll(/\b(py_eval|next_node|show_imspec|hide_imspec|predict_imspec|lookup|show_image|show_display_say|rollback|jump_expression|call_in_new_context|interact)\b/g)) {
    ic.add(m[1])
  }
  cls.internals = [...ic]
}

const out = classes.filter((c) => c.exec || c.statementName || c.renpyCalls.length)
  .map((c) => ({
    className: c.className,
    attrs: c.attrs.slice(0, 12),
    statementName: c.statementName || undefined,
    renpyCalls: c.renpyCalls,
    internals: c.internals,
    execSnippet: c.exec.slice(0, 700),
  }))

const outFile = process.argv[3] || path.join(__dirname, '..', 'extracts', 'ast-statement-map.json')
fs.writeFileSync(outFile, JSON.stringify(out, null, 2))
console.log('提取语句类:', out.length)
console.log('输出:', outFile)
for (const c of out.slice(0, 20)) {
  console.log(`- ${c.className}${c.statementName ? ' [' + c.statementName + ']' : ''} → renpy.${(c.renpyCalls || []).join(', renpy.')}`)
}
