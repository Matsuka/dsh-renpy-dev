// 编辑器第二批：括号匹配 + 自动缩进 纯函数单测
const fs = require('fs')
const src = fs.readFileSync(require('./paths').CLIENT_SRC, 'utf8')
const grab = (name, pat) => {
  const m = src.match(pat)
  if (!m) { console.log('未找到 ' + name); process.exit(1) }
  return eval('(' + m[0].replace(/^const /, '').replace(/;$/, '') + ')')
}
const fm = grab('findMatchingBracket', /const findMatchingBracket = \(text, pos\) => \{[\s\S]*?\n\t\t\};/)
const ni = grab('nextIndent', /const nextIndent = \(line\) => \{[\s\S]*?\n\t\t\};/)
const bjt = grab('bracketJumpTarget', /const bracketJumpTarget = \(bm, pos\) => \{[\s\S]*?\n\t\t\};/)
let p = 0, f = 0
const ok = (c, msg, extra) => { if (c) { p++; } else { f++; console.log('  ✗ FAIL:', msg, extra !== undefined ? '| got ' + JSON.stringify(extra) : '') } }

// ── 括号匹配 ──
const T = 'e "hi" if (a > (b + 1)) { x = [1, 2] }'
// 开括号向后找
let r = fm(T, T.indexOf('('))
ok(r && T[r.open] === '(' && T[r.close] === ')', '开括号配对', r)
// 光标在括号后（pos 指向下一个字符）也能识别
r = fm(T, T.indexOf('(') + 1)
ok(r && T[r.open] === '(' && T[r.close] === ')', '光标在开括号后', r)
// 闭括号向前找
const closeIdx = T.lastIndexOf(')')
r = fm(T, closeIdx)
ok(r && T[r.open] === '(' && T[r.close] === ')', '闭括号向前配对', r)
// 嵌套计数：内层括号匹配最近配对
const inner = T.indexOf('b + 1')
r = fm(T, T.indexOf('(', T.indexOf('a >')))
ok(r && r.open === T.indexOf('(', T.indexOf('a >')) && r.close === T.indexOf(')', inner), '嵌套计数', r)
// 方括号
r = fm(T, T.indexOf('['))
ok(r && T[r.open] === '[' && T[r.close] === ']', '方括号', r)
// 无括号 → null
ok(fm(T, 0) === null, '非括号位置 → null')
ok(fm('', 0) === null, '空文本 → null')
// 未闭合 → close null
r = fm('if (x', 3)
ok(r && r.open === 3 && r.close === null, '未闭合开括号', r)
// 悬空闭括号 → open null
r = fm('x ) y', 2)
ok(r && r.open === null && r.close === 2, '悬空闭括号', r)

// ── 自动缩进 ──
ok(ni('label start:') === '    ', '冒号结尾 → +4', ni('label start:'))
ok(ni('    if x:') === '        ', '已缩进行+冒号 → 继承+4', ni('    if x:'))
ok(ni('    e "hi"') === '    ', '普通行继承缩进', ni('    e "hi"'))
ok(ni('menu:') === '    ', 'menu 冒号 → +4', ni('menu:'))
ok(ni('') === '', '空行 → 无缩进', ni(''))
ok(ni('    # 注释: 带冒号的注释') === '    ', '注释行不算块开', ni('    # 注释: 带冒号的注释'))

// ── 匹配括号跳转 ──
ok(bjt({ open: 3, close: 9 }, 3) === 10, '光标在开括号 → 跳闭括号后', bjt({ open: 3, close: 9 }, 3))
ok(bjt({ open: 3, close: 9 }, 4) === 10, '光标在开括号后 → 跳闭括号后', bjt({ open: 3, close: 9 }, 4))
ok(bjt({ open: 3, close: 9 }, 10) === 4, '光标在闭括号后 → 跳开括号后', bjt({ open: 3, close: 9 }, 10))
ok(bjt({ open: 3, close: 9 }, 9) === 4, '光标在闭括号 → 跳开括号后', bjt({ open: 3, close: 9 }, 9))
ok(bjt({ open: null, close: 9 }, 9) === null, '悬空闭括号 → 无跳转', bjt({ open: null, close: 9 }, 9))
ok(bjt(null, 5) === null, '无匹配 → null', bjt(null, 5))

console.log(p + ' passed, ' + f + ' failed')
process.exit(f ? 1 : 0)
