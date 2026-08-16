// parseGuiVars / applyGuiChanges 单测（GUI 定制面板）
const fs = require('fs')
const src = fs.readFileSync(require('./paths').CLIENT_SRC, 'utf8')
const grab = (name, pat) => {
  const m = src.match(pat)
  if (!m) { console.log('未找到 ' + name); process.exit(1) }
  return eval('(' + m[0].replace(/^const /, '').replace(/;$/, '') + ')')
}
const pfn = grab('parseGuiVars', /const parseGuiVars = \(content\) => \{[\s\S]*?\n\t\t\};/)
const afn = grab('applyGuiChanges', /const applyGuiChanges = \(content, changes\) => \{[\s\S]*?\n\t\t\};/)
let p = 0, f = 0
const ok = (c, msg, extra) => { if (c) { p++; } else { f++; console.log('  ✗ FAIL:', msg, extra !== undefined ? '| got ' + JSON.stringify(extra) : '') } }

// ── 解析 ──
let r = pfn('init offset = -2\ninit python:\n    gui.init(1280, 720)\n\ndefine gui.accent_color = "#00b8c3"\ndefine gui.text_size = 33\n')
ok(r.width === 1280 && r.height === 720, 'gui.init 解析', r)
ok(r.vars['gui.accent_color'] === '#00b8c3', '颜色值解析', r.vars)
ok(r.vars['gui.text_size'] === '33', '数字值解析', r.vars)

// ── 应用：替换已有 + 新增 ──
const base = 'init offset = -2\ninit python:\n    gui.init(1280, 720)\n\ndefine gui.accent_color = "#00b8c3"\ndefine gui.text_size = 33\n'
let out = afn(base, { width: 1920, height: 1080, vars: { 'gui.accent_color': '#ff0000', 'gui.text_font': '"FZ.ttf"' } })
ok(out.indexOf('gui.init(1920, 1080)') >= 0, '分辨率替换', out)
ok(out.indexOf('define gui.accent_color = #ff0000') >= 0, '颜色替换', out)
ok(out.indexOf('define gui.text_font = "FZ.ttf"') >= 0, '新增字体行（追加）', out)
ok(out.indexOf('GUI 定制面板追加') >= 0, '追加标记', out)

// ── 无 gui.rpy：空内容也能生成 ──
out = afn('', { width: 1280, height: 720, vars: { 'gui.accent_color': '#112233' } })
ok(out.indexOf('define gui.accent_color = #112233') >= 0, '空文件生成', out)

// ── 已打开标签同步用（幂等） ──
out = afn(base, { width: 1280, height: 720, vars: {} })
ok(out === base, '无修改保持原样', out)

console.log(p + ' passed, ' + f + ' failed')
process.exit(f ? 1 : 0)
