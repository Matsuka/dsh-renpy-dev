// 个性化配置验证：mergeSettings 分层合并 + SETTINGS_SCHEMA 完整性
// 运行：node verification/tests/test-settings.js
'use strict'
const fs = require('fs')
const { mergeSettings } = require(require('./paths').CORE_MODULE)
let p = 0, f = 0
const ok = (c, msg, extra) => { if (c) { p++ } else { f++; console.log('  ✗ FAIL:', msg, extra !== undefined ? '| got ' + JSON.stringify(extra) : '') } }

// ── mergeSettings（renpy-core 权威实现） ────────────────────────────────
{
  const r = mergeSettings({ "editor.fontSize": 13, "editor.tabSize": 4 }, { "editor.fontSize": 16 })
  ok(r["editor.fontSize"] === 16 && r["editor.tabSize"] === 4, '项目覆盖全局（键级）', r)
}
{
  const r = mergeSettings({ "editor.rulers": [80] }, { "editor.rulers": [120] })
  ok(JSON.stringify(r["editor.rulers"]) === "[120]", '数组整体替换不深合并', r["editor.rulers"])
}
{
  const r = mergeSettings({ editor: { fontSize: 13 } }, { editor: { lineHeight: 21 } })
  ok(r.editor.fontSize === 13 && r.editor.lineHeight === 21, '嵌套对象深合并一层', r.editor)
}
{
  const r = mergeSettings({ a: 1 }, null)
  ok(r.a === 1, '项目为空返回全局', r)
}
{
  const r = mergeSettings(null, null)
  ok(Object.keys(r).length === 0, '双空返回空对象', r)
}
{
  const r = mergeSettings({ a: 1 }, { a: undefined })
  ok(r.a === 1, 'undefined 项目值不覆盖', r)
}

// ── SETTINGS_SCHEMA 完整性（client.js 源码提取断言） ─────────────────────
const src = fs.readFileSync(require('./paths').CLIENT_SRC, 'utf8')
{
  ok(src.indexOf('const SETTINGS_SCHEMA = [') >= 0, 'client.js 含 SETTINGS_SCHEMA')
  const m = /const SETTINGS_SCHEMA = \[([\s\S]*?)\];/.exec(src)
  ok(!!m, 'SETTINGS_SCHEMA 数组可提取', m && m[1].slice(0, 80))
  if (m) {
    const ids = [...m[1].matchAll(/\{ id: "([^"]+)", group: "([^"]+)", type: "([^"]+)", default: ([^,]+),/g)].map((x) => ({ id: x[1], group: x[2], type: x[3], def: x[4] }))
    const required = ["editor.fontFamily", "editor.fontSize", "editor.fontWeight", "editor.lineHeight", "editor.letterSpacing", "editor.tabSize", "editor.insertSpaces", "editor.lineNumbers", "editor.renderLineHighlight", "editor.renderWhitespace", "editor.rulers"]
    for (const rid of required) ok(ids.some((x) => x.id === rid), 'schema 含 ' + rid)
    const dup = ids.length - new Set(ids.map((x) => x.id)).size
    ok(dup === 0, 'schema id 无重复', dup)
    ok(ids.filter((x) => x.group === "字体").length === 5, '字体组 5 项', ids.filter((x) => x.group === "字体").length)
    ok(ids.filter((x) => x.group === "缩进").length === 2, '缩进组 2 项')
    ok(ids.filter((x) => x.group === "显示").length === 4, '显示组 4 项')
    // 关键默认值（与 VSCode 语义一致）
    const lineHeight = ids.find((x) => x.id === "editor.lineHeight")
    ok(lineHeight.def === "0", 'lineHeight 默认 0（=自动，VSCode 语义）', lineHeight && lineHeight.def)
    const fontSize = ids.find((x) => x.id === "editor.fontSize")
    ok(fontSize.def === "13", 'fontSize 默认 13', fontSize && fontSize.def)
    const lineNumbers = ids.find((x) => x.id === "editor.lineNumbers")
    ok(lineNumbers.def === '"on"', 'lineNumbers 默认 on', lineNumbers && lineNumbers.def)
    const tabSize = ids.find((x) => x.id === "editor.tabSize")
    ok(tabSize.def === "4", 'tabSize 默认 4（Ren' + 'Py 惯例）', tabSize && tabSize.def)
    // 枚举值集（对齐 VSCode 值域）
    const wsSeg = m[1].slice(m[1].indexOf("renderWhitespace"), m[1].indexOf("renderWhitespace") + 400)
    ok(/trailing/.test(wsSeg), 'renderWhitespace 含 trailing（VSCode 值域）', wsSeg.slice(0, 120))
    const rlhSeg = m[1].slice(m[1].indexOf("renderLineHighlight"), m[1].indexOf("renderLineHighlight") + 400)
    ok(/"gutter"/.test(rlhSeg), 'renderLineHighlight 含 gutter（VSCode 值域）', rlhSeg.slice(0, 120))
  }
}

console.log(p + ' passed, ' + f + ' failed')
process.exit(f ? 1 : 0)
