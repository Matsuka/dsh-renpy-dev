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
    const ids = [...m[1].matchAll(/\{ id: "([^"]+)", category: "([^"]+)", group: "([^"]+)", type: "([^"]+)", default: ([^,]+),/g)].map((x) => ({ id: x[1], cat: x[2], group: x[3], type: x[4], def: x[5] }))
    const required = ["editor.fontFamily", "editor.fontSize", "editor.fontWeight", "editor.lineHeight", "editor.letterSpacing", "editor.tabSize", "editor.insertSpaces", "editor.lineNumbers", "editor.renderLineHighlight", "editor.renderWhitespace", "editor.rulers", "editor.bracketPairColorization.enabled", "editor.guides.indentation", "editor.quickSuggestions.other", "editor.quickSuggestions.comments", "editor.quickSuggestions.strings", "editor.suggestOnTriggerCharacters", "editor.padding.top", "editor.padding.bottom", "editor.mouseWheelZoom", "editor.smoothScrolling", "editor.trimAutoWhitespace", "editor.background", "editor.foreground", "editor.lineHighlightBackground", "editor.selectionBackground", "theme.mode", "button.background", "button.foreground", "input.border", "workbench.border"]
    for (const rid of required) ok(ids.some((x) => x.id === rid), 'schema 含 ' + rid)
    const dup = ids.length - new Set(ids.map((x) => x.id)).size
    ok(dup === 0, 'schema id 无重复', dup)
    // 两大分类（功能/控件）+ 子分组
    const catFn = ids.filter((x) => x.cat === "功能").length
    const catCt = ids.filter((x) => x.cat === "控件").length
    ok(catFn + catCt === ids.length, '全部项有 category（功能/控件）', catFn + catCt + '/' + ids.length)
    ok(catFn === 15, '功能 15 项（编辑行为5+补全4+显示5+亮暗1）', catFn)
    ok(catCt === 33, '控件 33 项（字体5+布局3+颜色25）', catCt)
    ok(ids.filter((x) => x.group === "编辑行为").length === 5, '编辑行为组 5 项（缩进并入）', ids.filter((x) => x.group === "编辑行为").length)
    ok(ids.filter((x) => x.group === "补全").length === 4, '补全组 4 项')
    ok(ids.filter((x) => x.group === "显示").length === 5, '显示组 5 项（行为开关；rulers/padding 移布局）', ids.filter((x) => x.group === "显示").length)
    ok(ids.filter((x) => x.group === "亮暗模式").length === 1, '亮暗模式组 1 项')
    ok(ids.filter((x) => x.group === "字体").length === 5, '字体组 5 项')
    ok(ids.filter((x) => x.group === "布局").length === 3, '布局组 3 项（rulers/padding）', ids.filter((x) => x.group === "布局").length)
    ok(ids.filter((x) => x.group === "颜色·编辑器").length === 12, '颜色·编辑器 12 项', ids.filter((x) => x.group === "颜色·编辑器").length)
    ok(ids.filter((x) => x.group === "颜色·界面").length === 8, '颜色·界面 8 项', ids.filter((x) => x.group === "颜色·界面").length)
    ok(ids.filter((x) => x.group === "颜色·交互").length === 5, '颜色·交互 5 项', ids.filter((x) => x.group === "颜色·交互").length)
    ok(ids.filter((x) => x.type === "color").length === 25, 'color 类型 25 项', ids.filter((x) => x.type === "color").length)
    ok(ids.some((x) => x.id === "theme.mode" && x.def === '"dark"' && /"light", "dark"/.test(m[1].slice(m[1].indexOf("theme.mode"), m[1].indexOf("theme.mode") + 200))), 'theme.mode 仅亮/暗两档（默认 dark，无 system）')
    const mwz = ids.find((x) => x.id === "editor.mouseWheelZoom")
    ok(mwz.def === "false", 'mouseWheelZoom 默认 false（不影响页面缩放，冲突可关）', mwz && mwz.def)
    // 关键默认值（与 VSCode 语义一致）
    const lineHeight = ids.find((x) => x.id === "editor.lineHeight")
    ok(lineHeight.def === "0", 'lineHeight 默认 0（=自动，VSCode 语义）', lineHeight && lineHeight.def)
    const fontSize = ids.find((x) => x.id === "editor.fontSize")
    ok(fontSize.def === "13", 'fontSize 默认 13', fontSize && fontSize.def)
    const lineNumbers = ids.find((x) => x.id === "editor.lineNumbers")
    ok(lineNumbers.def === '"on"', 'lineNumbers 默认 on', lineNumbers && lineNumbers.def)
    const tabSize = ids.find((x) => x.id === "editor.tabSize")
    ok(tabSize.def === "4", 'tabSize 默认 4（Ren' + 'Py 惯例）', tabSize && tabSize.def)
    const qcOther = ids.find((x) => x.id === "editor.quickSuggestions.other")
    ok(qcOther.def === "true", 'quickSuggestions.other 默认 true', qcOther && qcOther.def)
    const qcComments = ids.find((x) => x.id === "editor.quickSuggestions.comments")
    ok(qcComments.def === "false", 'quickSuggestions.comments 默认 false（对齐 VSCode）', qcComments && qcComments.def)
    // 枚举值集（对齐 VSCode 值域）
    const wsSeg = m[1].slice(m[1].indexOf("renderWhitespace"), m[1].indexOf("renderWhitespace") + 400)
    ok(/trailing/.test(wsSeg), 'renderWhitespace 含 trailing（VSCode 值域）', wsSeg.slice(0, 120))
    const rlhSeg = m[1].slice(m[1].indexOf("renderLineHighlight"), m[1].indexOf("renderLineHighlight") + 400)
    ok(/"gutter"/.test(rlhSeg), 'renderLineHighlight 含 gutter（VSCode 值域）', rlhSeg.slice(0, 120))
  }
}

// ── completionContext（client.js 源码提取，quickSuggestions 上下文判断） ──
{
  const cm = src.match(/const completionContext = \(text, pos\) => \{[\s\S]*?\n\t\t\};/)
  ok(!!cm, 'completionContext 可提取', cm && cm[0].slice(0, 60))
  if (cm) {
    const completionContext = eval('(' + cm[0].replace(/^const completionContext = /, '').replace(/;$/, '') + ')')
    ok(completionContext('label start:\n    e "hi"', 14) === 'other', '代码上下文 other', completionContext('label start:\n    e "hi"', 14))
    ok(completionContext('    # 注释文字', 8) === 'comments', '整行注释 comments', completionContext('    # 注释文字', 8))
    ok(completionContext('    e "hi"  # 行尾注释', 18) === 'comments', '行尾注释 comments', completionContext('    e "hi"  # 行尾注释', 18))
    ok(completionContext('    e "正在输入', 11) === 'strings', '引号内 strings', completionContext('    e "正在输入', 11))
    ok(completionContext('    e "已闭合" 继续', 15) === 'other', '引号闭合后 other', completionContext('    e "已闭合" 继续', 15))
    ok(completionContext('', 0) === 'other', '空输入 other')
  }
}

// ── COLOR_PRESETS（预制配色方案，VSCode 2026 主题色值） ──────────────────
{
  ok(src.indexOf('const COLOR_PRESETS = {') >= 0, 'client.js 含 COLOR_PRESETS')
  const m = /const COLOR_PRESETS = \{([\s\S]*?)\n\t\t\};/.exec(src)
  ok(!!m, 'COLOR_PRESETS 可提取', m && m[1].slice(0, 80))
  if (m) {
    const names = [...m[1].matchAll(/^\t\t\t"([^"]+)": \{/gm)].map((x) => x[1])
    ok(names.includes('2026 Dark') && names.includes('2026 Light'), '含 VSCode 2026 预制方案（2026 Dark/Light）', names)
    for (const n of ['Dark Modern', 'Dark+', 'Light Modern', 'Light+', 'Dark High Contrast', 'Light High Contrast']) ok(names.includes(n), '含 ' + n)
    ok(names.length === 8, '共 8 套方案', names.length)
    // 每套至少含背景/前景/选区（name 可能含 + 等正则元字符，需转义）
    const seg = m[1]
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const hasBg = (n) => new RegExp('"' + esc(n) + '": \\{[\\s\\S]*?"editor.background"').test(seg)
    for (const n of names) ok(hasBg(n), n + ' 含 editor.background')
    // 2026 Dark 精确色值（本机 VSCode 1.133.0 实测）
    const d26 = /"2026 Dark": \{([^}]*)\}/.exec(seg)
    ok(d26 && /"editor.background": "#121314"/.test(d26[1]), '2026 Dark 背景 #121314（本机实测）', d26 && d26[1].slice(0, 100))
    ok(d26 && /"editor.foreground": "#BBBEBF"/.test(d26[1]), '2026 Dark 前景 #BBBEBF')
    // 每套含 workbench token（界面覆写）
    const hasWb = (n) => new RegExp('"' + esc(n) + '": \\{[\\s\\S]*?"workbench.background"').test(seg)
    for (const n of names) ok(hasWb(n), n + ' 含 workbench.background')
    const d26w = /"2026 Dark": \{([^}]*)\}/.exec(seg)
    ok(d26w && /"workbench.sideBar.background": "#191A1B"/.test(d26w[1]), '2026 Dark 侧栏 #191A1B（本机实测）', d26w && d26w[1].slice(0, 220))
    // 交互 token（按钮强调色等）
    ok(/button.background": "#297AA0"/.test(seg), '2026 Dark 按钮强调色 #297AA0（本机实测）')
    ok(/button.background": "#0069CC"/.test(seg), '2026 Light 按钮强调色 #0069CC')
    ok(/input.border": "#333536FF"/.test(seg), '2026 Dark 输入框边框 #333536FF')
  }
}

console.log(p + ' passed, ' + f + ' failed')
process.exit(f ? 1 : 0)
