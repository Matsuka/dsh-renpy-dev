// renpyLearnNotes 单测（学习用途自动注释）
const fs = require('fs')
const src = fs.readFileSync(require('./paths').CLIENT_SRC, 'utf8')
const m = src.match(/const renpyLearnNotes = \(src\) => \{[\s\S]*?\n\t\t\};/)
if (!m) { console.log('未找到 renpyLearnNotes'); process.exit(1) }
const fn = eval('(' + m[0].replace(/^const /, '').replace(/;$/, '') + ')')
let p = 0, f = 0
const ok = (c, msg, extra) => { if (c) { p++; } else { f++; console.log('  ✗ FAIL:', msg, extra !== undefined ? '| got ' + JSON.stringify(extra) : '') } }

const code = [
  '# 注释行',
  'define e = Character("艾琳")',
  '',
  'label start:',
  '    scene bg classroom',
  '    e "你好"',
  '    "旁白"',
  '    menu:',
  '        "继续":',
  '            jump next',
  '    $ x = 1',
  '    jump next',
  '',
  'label next:',
  '    return',
].join('\n')

const r = fn(code)
ok(r.length === 15, '行数匹配', r.length)

// 各类识别
const get = (line) => r.find((x) => x.line === line)
ok(get(1).kind === 'comment' && get(1).note.indexOf('注释') >= 0, '注释行', get(1))
ok(get(2).note.indexOf('define') >= 0 && get(2).note.indexOf('init 阶段') >= 0, 'define', get(2))
ok(get(3).kind === 'blank', '空行', get(3))
ok(get(4).kind === 'label' && get(4).note.indexOf('跳转目标') >= 0, 'label', get(4))
ok(get(5).note.indexOf('场景') >= 0, 'scene', get(5))
ok(get(6).note.indexOf('角色对话') >= 0 && get(6).note.indexOf('e 说出') >= 0, 'say 角色', get(6))
ok(get(7).note.indexOf('旁白') >= 0, '旁白', get(7))
ok(get(8).note.indexOf('选择菜单') >= 0, 'menu', get(8))
ok(get(9).note.indexOf('菜单选项') >= 0, 'menu 选项（含缩进提示）', get(9))
ok(get(10).note.indexOf('跳转') >= 0, 'jump', get(10))
ok(get(11).note.indexOf('$') >= 0 && get(11).note.indexOf('单行 Python') >= 0, '$ 行', get(11))
ok(get(15).note.indexOf('返回') >= 0, 'return', get(15))
// 缩进提示
ok(get(9).note.indexOf('缩进') >= 0, '缩进提示', get(9))
// label 行不误加缩进提示（缩进 0）
ok(get(4).note.indexOf('缩进') < 0, '顶层 label 无缩进提示', get(4))
// doc/skill 字段（学习注释跳转官方文档）
const DOCPAGES = {
  1: 'language_basics.html',   // 注释
  2: 'python_statements.html', // define
  4: 'label.html',             // label
  5: 'displaying_images.html', // scene
  6: 'dialogue.html',          // say
  8: 'menus.html',             // menu
  10: 'label.html',            // jump
}
for (const [ln, page] of Object.entries(DOCPAGES)) {
  const item = get(Number(ln))
  ok(item.doc === page, 'line ' + ln + ' doc=' + page, item.doc)
  ok(typeof item.skill === 'string' && item.skill.indexOf('renpy-') === 0, 'line ' + ln + ' skill 前缀', item.skill)
}
ok(get(3).doc === undefined && get(3).skill === undefined, 'blank 无 doc/skill', get(3))
ok(get(15).doc === 'label.html', 'return doc', get(15).doc)

console.log(p + ' passed, ' + f + ' failed')
process.exit(f ? 1 : 0)
