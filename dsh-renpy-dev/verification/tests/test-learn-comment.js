// 学习注释写入/清除纯函数单测（insertLearnComment / findLearnBlock / stripLearnComment / learnCommentLines）
const fs = require('fs')
const src = fs.readFileSync(require('./paths').CLIENT_SRC, 'utf8')

const grab = (name) => {
  const m = src.match(new RegExp('const ' + name + ' = \\([\\s\\S]*?\\n\\t\\t;'))
  if (!m) { console.log('未找到 ' + name); process.exit(1) }
  return eval('(' + m[0].replace(/^const /, '').replace(/;$/, '') + ')')
}
// findLearnBlock 是 const findLearnBlock = (src, line) => {...}; 格式与其他不同（无 = ( 前缀空格），单独取
const grabFn = (name) => {
  const m = src.match(new RegExp('const ' + name + ' = \\([\\s\\S]*?\\n\\t\\t;'))
  if (!m) { console.log('未找到 ' + name); process.exit(1) }
  return eval('(' + m[0].replace(/^const /, '').replace(/;$/, '') + ')')
}
// 稳健提取：从 "const fn = " 起，平衡参数括号 + 箭头函数体大括号（不依赖缩进）
const grabAny = (name) => {
  const startM = src.match(new RegExp('const ' + name + ' = '))
  if (!startM) { console.log('未找到 ' + name); process.exit(1) }
  let i = startM.index + startM[0].length
  const n = src.length
  while (i < n && src[i] !== '(') i++
  if (i >= n) { console.log('无参数: ' + name); process.exit(1) }
  // 平衡参数括号
  let depth = 0, inStr = null, esc = false
  for (; i < n; i++) {
    const ch = src[i]
    if (inStr) { if (esc) { esc = false } else if (ch === '\\') { esc = true } else if (ch === inStr) inStr = null; continue }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue }
    if (ch === '(') depth++
    else if (ch === ')') { depth--; if (depth === 0) { i++; break } }
  }
  // 跳过 => 与空白
  while (i < n && /\s/.test(src[i])) i++
  if (src[i] === '=' && src[i + 1] === '>') i += 2
  while (i < n && /\s/.test(src[i])) i++
  if (src[i] !== '{') { console.log('非箭头函数体: ' + name); process.exit(1) }
  // 平衡函数体大括号
  depth = 0; inStr = null; esc = false
  let end = -1
  for (; i < n; i++) {
    const ch = src[i]
    if (inStr) { if (esc) { esc = false } else if (ch === '\\') { esc = true } else if (ch === inStr) inStr = null; continue }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue }
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break } }
  }
  if (end < 0) { console.log('未闭合: ' + name); process.exit(1) }
  const expr = src.slice(startM.index + startM[0].length, end) // "(args) => { body }"
  return eval('(' + expr + ')')
}

const insertLearnComment = grabAny('insertLearnComment')
const findLearnBlock = grabAny('findLearnBlock')
const stripLearnComment = grabAny('stripLearnComment')
const learnCommentLines = grabAny('learnCommentLines')
// LEARN_MARK 常量：函数体内引用了它，需在 eval 作用域注入（var 避免 TDZ 影响闭包）
const markM = src.match(/const LEARN_MARK = "([^"]*)";/)
if (!markM) { console.log('未找到 LEARN_MARK'); process.exit(1) }
var LEARN_MARK = markM[1]

let p = 0, f = 0
const ok = (c, msg, extra) => { if (c) { p++; } else { f++; console.log('  ✗ FAIL:', msg, extra !== undefined ? '| got ' + JSON.stringify(extra) : '') } }

const code = [
  '# 注释行',
  'define e = Character("艾琳")',
  '',
  'label start:',
  '    scene bg classroom',
  '    e "你好"',
  '    return',
].join('\n')

// ── learnCommentLines：文本 → 注释行 ──
const cl = learnCommentLines('这是讲解\n\n第二段', 'renpy-core', 4)
ok(cl.length === 4, '注释行数（head + 正文2 + 空行→#）', cl)
ok(cl[0].indexOf('# 📖 学习: renpy-core（L4）') === 0, '标记行', cl[0])
ok(cl[1] === '# 这是讲解', '正文行前缀', cl[1])
ok(cl[2] === '#', '空行转 #', cl[2])
ok(cl[3] === '# 第二段', '第二段', cl[3])

// ── insertLearnComment：插入到行上方 ──
const ins = insertLearnComment(code, 4, '讲解A\n讲解B', 'renpy-core')
const insLines = ins.split('\n')
ok(insLines[3].indexOf('# 📖 学习:') === 0, '插入位置在第 4 行前', insLines[3])
ok(insLines[3] === '# 📖 学习: renpy-core（L4）', '标记行内容', insLines[3])
ok(insLines[4] === '# 讲解A', '讲解 A', insLines[4])
ok(insLines[5] === '# 讲解B', '讲解 B', insLines[5])
ok(insLines[6] === 'label start:', '原代码行下移', insLines[6])
// 插入 3 行块：原 L4 → L7

// ── findLearnBlock：检测 ──
const blk = findLearnBlock(ins, 7) // 原第 4 行现在在 7（插入 3 行后）
ok(blk !== null, '检测到注释块', blk)
ok(blk.start === 4 && blk.end === 6, '块区间 4-6（标记+2行正文）', blk)
ok(findLearnBlock(code, 4) === null, '原代码无块', findLearnBlock(code, 4))

// 多个相邻注释块：只认紧贴代码行的块（跳过其他 # 注释）
const code2 = '# 普通注释\nlabel x:\n    return'.split('\n')
const ins2 = insertLearnComment(code2.join('\n'), 2, 'T', 'renpy-core')
// 现在：1:# 普通注释 2:# 📖 学习 3:# T 4:label x 5:return
const blk2 = findLearnBlock(ins2, 4)
ok(blk2 !== null && blk2.start === 2 && blk2.end === 3, '跳过上方普通注释只认标记块', blk2)

// ── stripLearnComment：清除 ──
const stripped = stripLearnComment(ins, 7) // 原 L4 现在在 L7
ok(stripped === code, '清除后还原', stripped.split('\n').slice(0, 4))
ok(stripLearnComment(code, 4) === code, '无块时原样返回')

// 清除后行号恢复：再次插入 + 清除循环（插入 2 行块后原 L4 → L6）
const again = insertLearnComment(stripped, 4, 'X', 'renpy-core')
ok(again.split('\n').length === code.split('\n').length + 2, '再插入行数', again.split('\n').length)
ok(stripLearnComment(again, 6) === code, '再清除还原', stripLearnComment(again, 6))

// 标记行含中文与特殊字符的容错
const ins3 = insertLearnComment(code, 5, 'scene 清空层\n「注意」缩进', 'renpy-core')
ok(ins3.indexOf('# 📖 学习: renpy-core（L5）') >= 0, '中文正文注释', '')
ok(ins3.indexOf('# 「注意」缩进') >= 0, '中文标点保留', '')

console.log(p + ' passed, ' + f + ' failed')
process.exit(f ? 1 : 0)
