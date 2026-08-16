// parseTextCfg 单测：项目文本速度配置解析（slow_cps / slow_cps_multiplier / Character what_*）
const fs = require('fs')
const src = fs.readFileSync(require('./paths').CLIENT_SRC, 'utf8')
const m = src.match(/const parseTextCfg = \(files\) => \{[\s\S]*?\n\t\t\};/)
if (!m) { console.log('未找到 parseTextCfg'); process.exit(1) }
const fn = eval('(' + m[0].replace(/^const /, '').replace(/;$/, '') + ')')
let p = 0, f = 0
const ok = (c, msg, extra) => { if (c) { p++; } else { f++; console.log('  ✗ FAIL:', msg, extra !== undefined ? '| got ' + JSON.stringify(extra) : '') } }

// 1. 无配置 → 空
let r = fn([{ name: "script.rpy", content: "label start:\n    e \"hi\"\n" }])
ok(r.globalCps === null && Object.keys(r.charCps).length === 0 && Object.keys(r.styleCps).length === 0, '无配置 → 空', r)

// 2. Character what_slow_cps
r = fn([{ name: "chars.rpy", content: 'define e = Character("艾琳", what_slow_cps=40)\ndefine n = Character("娜", what_slow_cps=30, what_style="talk")\n' }])
ok(r.charCps.e && r.charCps.e.cps === 40, '角色 what_slow_cps=40', r.charCps)
ok(r.charCps.n && r.charCps.n.cps === 30 && r.charCps.n.style === "talk", '角色 cps+style', r.charCps)

// 3. 样式块 slow_cps / multiplier
r = fn([{ name: "options.rpy", content: "style say_dialogue:\n    slow_cps 30\n    slow_cps_multiplier 1.5\n" }])
ok(r.styleCps.say_dialogue && r.styleCps.say_dialogue.cps === 30 && r.styleCps.say_dialogue.mult === 1.5, '样式块 slow_cps+mult', r.styleCps)
ok(r.globalCps === 45, 'globalCps = 30×1.5 = 45', r)

// 4. 多文件合并 + 其他样式块不影响
r = fn([
  { name: "a.rpy", content: "style talk:\n    slow_cps 50\n" },
  { name: "b.rpy", content: 'define g = Character("G", what_slow_cps=25)\nstyle say_dialogue:\n    slow_cps 12\n' },
])
ok(r.styleCps.talk.cps === 50, '多文件样式合并', r.styleCps)
ok(r.charCps.g.cps === 25, '多文件角色合并', r.charCps)
ok(r.globalCps === 12, 'globalCps 取 say_dialogue', r)

// 5. 嵌套/干扰不误匹配
r = fn([{ name: "s.rpy", content: "define slow_cps = 99\nstyle say_dialogue:\n    size 22\n# slow_cps 100\n" }])
ok(r.globalCps === null, '注释里的 slow_cps 不匹配', r)

console.log(p + ' passed, ' + f + ' failed')
process.exit(f ? 1 : 0)
