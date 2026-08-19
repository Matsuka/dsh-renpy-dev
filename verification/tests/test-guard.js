// 写守卫验证（guardRpy：缩进/保留名/标签唯一/对白转义四层）
// 运行：node verification/tests/test-guard.js
'use strict'
const { guardRpy } = require(require('./paths').CORE_MODULE)
let p = 0, f = 0
const ok = (c, msg, extra) => { if (c) { p++ } else { f++; console.log('  ✗ FAIL:', msg, extra !== undefined ? '| got ' + JSON.stringify(extra) : '') } }
const kinds = (r) => r.errors.map((e) => e.kind)
const lines = (r) => r.errors.map((e) => e.line)

// ── 正常代码：零错误 ─────────────────────────────────────────────────────
const GOOD = [
  'define e = Character("艾琳")',
  'default score = 0',
  '',
  'label start:',
  '    e "你好"',
  '    menu:',
  '        "继续":',
  '            jump next',
  '    return',
  '',
  'label next:',
  '    e "分数 [score]，{b}重点{/b} {color=#f00}红{/color}"',
  '    e "字面量：{{花括号}、[[方括号]、100%"',
  '    return',
].join('\n')
{
  const r = guardRpy(GOOD)
  ok(r.ok === true && r.errors.length === 0, '正常代码零错误', r.errors)
}

// ── 缩进：tab/空格混用 ──────────────────────────────────────────────────
{
  const r = guardRpy('label start:\n\t"tab 行"\n    "空格行"\n')
  ok(!r.ok && kinds(r).includes('indent'), 'tab/空格混用报 indent', r.errors)
  ok(lines(r).includes(2), '混用报在 tab 首次出现行', r.errors)
}
// ── 缩进：label 后语句未缩进 ────────────────────────────────────────────
{
  const r = guardRpy('label start:\n"旁白未缩进"\n')
  ok(!r.ok && kinds(r).includes('indent') && lines(r).includes(2), 'label 后未缩进报 indent', r.errors)
}
{
  const r = guardRpy('label start:\nlabel next:\n    "正常"\n')
  ok(r.ok, '连续 label 不误报', r.errors)
}

// ── 保留名：label/变量用保留字 ──────────────────────────────────────────
{
  const r = guardRpy('label if:\n    return\n')
  ok(!r.ok && kinds(r).includes('reserved') && lines(r).includes(1), 'label if 报 reserved', r.errors)
}
{
  const r = guardRpy('define renpy = 1\n')
  ok(!r.ok && kinds(r).includes('reserved'), 'define renpy 报 reserved', r.errors)
}
{
  const r = guardRpy('default config = 2\n')
  ok(!r.ok && kinds(r).includes('reserved'), 'default config 报 reserved', r.errors)
}

// ── 标签唯一：文件内重名 + 跨文件冲突 ───────────────────────────────────
{
  const r = guardRpy('label a:\n    return\nlabel a:\n    return\n')
  ok(!r.ok && kinds(r).includes('label_dup') && lines(r).includes(3), '文件内重名报 label_dup', r.errors)
}
{
  const r = guardRpy('label start:\n    return\n', { labels: ['start'] })
  ok(!r.ok && kinds(r).includes('label_dup'), '跨文件冲突报 label_dup', r.errors)
}
{
  const r = guardRpy('label start:\n    return\n', { labels: ['other'] })
  ok(r.ok, '无冲突不误报', r.errors)
}

// ── 对白转义：花括号/方括号不配对（{b} 自身配对不报；缺右括号才报） ──────
{
  const r = guardRpy('label s:\n    e "文本 {b 少了右括号"\n')
  ok(!r.ok && kinds(r).includes('dialogue') && lines(r).includes(2), '花括号不配对（缺 }）报 dialogue', r.errors)
}
{
  const r = guardRpy('label s:\n    e "文本 }多了右括号"\n')
  ok(!r.ok && kinds(r).includes('dialogue'), '花括号不配对（多 }）报 dialogue', r.errors)
}
{
  const r = guardRpy('label s:\n    e "插值 [x 少了右括号"\n')
  ok(!r.ok && kinds(r).includes('dialogue'), '方括号不配对报 dialogue', r.errors)
}
{
  const r = guardRpy('label s:\n    e "文本 {b}未闭合标签 但括号配对"\n')
  ok(r.ok, '{b} 自身配对不误报（标签未闭合属渲染期错误，静态不判）', r.errors)
}
// ── 对白转义：合法标签/插值/字面量零误报 ────────────────────────────────
{
  const r = guardRpy('label s:\n    e "{b}粗{/b} [score] 100% {{字面} [[字面]" \n')
  ok(r.ok, '配对标签/插值/字面量零误报', r.errors)
}

// ── 空内容 / 纯注释 ─────────────────────────────────────────────────────
{
  const r = guardRpy('')
  ok(r.ok && r.errors.length === 0, '空内容零错误', r)
}
{
  const r = guardRpy('# 只有注释\n# 第二行\n')
  ok(r.ok, '纯注释零错误', r)
}

console.log(p + ' passed, ' + f + ' failed')
process.exit(f ? 1 : 0)
