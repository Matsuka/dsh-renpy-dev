// 混合流程①b：ast-statement-map.json → Markdown 速查初稿（无 AI 渲染）
// 用法：node render-statement-md.js [输入.json] [输出.md]
const fs = require('fs')
const path = require('path')
const m = require(process.argv[2] || path.join(__dirname, '..', 'extracts', 'ast-statement-map.json'))
const esc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 200)

const rows = m.map((c) => {
  const api = (c.renpyCalls || []).map((r) => 'renpy.' + r).join(', ') || '（内部调用: ' + (c.internals || []).join(', ') + '）'
  return `| \`${c.statementName || c.className}\` | ${c.className} | ${esc(c.attrs.join(', '))} | ${esc(api)} |`
}).join('\n')

const md = `# Ren'Py 语句 → Python/API 映射（源码自动提取初稿）

> 来源：renpy/ast.py 语句类 execute() 静态分析（无 AI）。语义/示例待 AI 解读补全。

| 语句 | AST 类 | 关键属性 | execute 中调用的 API/内部函数 |
|---|---|---|---|
${rows}

## 说明
- statementName = execute 中 statement_name("...") 标记（引擎内部分发名）
- renpyCalls = execute 体中的 renpy.* 顶层调用
- internals = show_imspec / next_node / py_eval 等内部函数（需映射到公开 API）
`

fs.writeFileSync(process.argv[3] || path.join(__dirname, '..', 'extracts', 'renpy-statement-map.md'), md)
console.log('生成 renpy-statement-map.md，行数:', rows.split('\n').length)
