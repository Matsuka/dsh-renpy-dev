// 验证缩进线（完全参照 VSCode 算法）：
//  级别 L = ceil(缩进空格数 / tabSize)；纯空白行按上下最近内容行推断（offSide 语言）
//  级别 L 的行在 0, ts, 2ts, …, (L-1)·ts 列画线（含最左 0 列、不含字符起点列）
//  每列按连续行分段：级别下降处线断开，不跨行压到无关行；块内空行保持连续
function indentGuides(lines, ts) {
  const n = lines.length
  const raw = new Array(n)
  for (let i = 0; i < n; i++) {
    const line = String(lines[i]).replace(/\r$/, '')
    const m = /^[ \t]*/.exec(line)[0]
    let ws = 0
    for (let j = 0; j < m.length; j++) ws = m[j] === '\t' ? ws + ts - (ws % ts) : ws + 1
    raw[i] = (m.length === line.length) ? -1 : ws
  }
  const above = new Array(n), below = new Array(n)
  let last = -1
  for (let i = 0; i < n; i++) { if (raw[i] >= 0) last = raw[i]; above[i] = last }
  last = -1
  for (let i = n - 1; i >= 0; i--) { if (raw[i] >= 0) last = raw[i]; below[i] = last }
  const lvl = new Array(n)
  let maxLvl = 0
  for (let i = 0; i < n; i++) {
    if (raw[i] >= 0) lvl[i] = Math.ceil(raw[i] / ts)
    else if (above[i] < 0 || below[i] < 0) lvl[i] = 0
    else if (above[i] < below[i]) lvl[i] = 1 + Math.floor(above[i] / ts)
    else lvl[i] = Math.ceil(below[i] / ts)
    if (lvl[i] > maxLvl) maxLvl = lvl[i]
  }
  const segs = []
  for (let c = 0; c < maxLvl * ts; c += ts) {
    let first = -1
    for (let i = 0; i <= n; i++) {
      const has = i < n && lvl[i] > c / ts
      if (has && first < 0) first = i
      else if (!has && first >= 0) { segs.push({ col: c, first, last: i - 1 }); first = -1 }
    }
  }
  return segs
}
// x = 4px padding + c 个空格(spaceW) + letterSpacing(c-1 间距，与 textWidth 约定一致)
function guideX(col, spaceW, sp) {
  return 4 + col * spaceW + (col > 1 ? sp * (col - 1) : 0)
}
const segStr = (s) => s.map(g => `${g.col}:${g.first}-${g.last}`).join(' ')

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('✗ FAIL:', msg) } }

// 用例1：两层缩进（8 空格 → level2）→ 0 列与 4 列（不含字符起点的 8 列）
let s = indentGuides(['label a:', '        "deep"', '    "mid"'], 4)
ok(segStr(s) === '0:1-2 4:1-1', '两层 → 0:1-2 4:1-1，got ' + segStr(s))

// 用例2：三层（12 空格 → level3）→ 0/4/8 列
s = indentGuides(['label a:', '            "deepest"'], 4)
ok(segStr(s) === '0:1-1 4:1-1 8:1-1', '三层 → 0:1-1 4:1-1 8:1-1，got ' + segStr(s))

// 用例3：单层（4 空格 → level1）→ 仅 0 列（最左，外层代码线）
s = indentGuides(['label a:', '    "one"'], 4)
ok(segStr(s) === '0:1-1', '单层 → 仅 0 列，got ' + segStr(s))

// 用例4：非整档（6 空格）→ ceil(6/4)=2 → 0/4 列（VSCode 向上取整）
s = indentGuides(['label a:', '      "six"'], 4)
ok(segStr(s) === '0:1-1 4:1-1', '6 空格 → 0/4 列，got ' + segStr(s))

// 用例5：无缩进 → 无线
s = indentGuides(['label a:', 'label b:'], 4)
ok(segStr(s) === '', '无缩进 → 无线，got "' + segStr(s) + '"')

// 用例6：块断开不跨行（关键回归：不得压到中间的 label mid: 行）
s = indentGuides(['label a:', '    if x:', '        "b"', 'label mid:', '    "y"'], 4)
ok(segStr(s) === '0:1-2 0:4-4 4:2-2', '断开 → 0 列两段 0:1-2/0:4-4 + 4:2-2，got ' + segStr(s))

// 用例7：块内空行保持连续（above==below → level 不变）
s = indentGuides(['label a:', '    "x"', '', '    "y"'], 4)
ok(segStr(s) === '0:1-3', '块内空行 → 0:1-3 连续，got ' + segStr(s))

// 用例8：dedent 后空行在块外 → 断开（空行 above>below → level 0）
s = indentGuides(['label a:', '    if x:', '        "b"', '', 'label c:'], 4)
ok(segStr(s) === '0:1-2 4:2-2', 'dedent 空行 → 0:1-2 4:2-2（空行无线），got ' + segStr(s))

// 用例9：CRLF 纯空白行 → 视为空白行（\r 已剥离），块内连续
s = indentGuides(['label a:\r\n', '    "x"\r\n', '    \r\n', '    "y"\r\n'], 4)
ok(segStr(s) === '0:1-3', 'CRLF 空白行 → 0:1-3 连续，got ' + segStr(s))

// 用例10：tab 缩进（2 tab = 8 空格 → level2）→ 0/4 列
s = indentGuides(['label a:', '\t\t"tabs"'], 4)
ok(segStr(s) === '0:1-1 4:1-1', 'tab 缩进 → 0/4 列，got ' + segStr(s))

// 用例11：文件顶/底空白行 → level 0，无线
s = indentGuides(['', '    "x"', ''], 4)
ok(segStr(s) === '0:1-1', '顶底空行 → 0:1-1，got ' + segStr(s))

// ── x 定位：锚定空格宽 + 4px padding + letterSpacing(n-1 间距) ──
ok(guideX(0, 7.8, 0) === 4, 'col0 → 4，got ' + guideX(0, 7.8, 0))
ok(guideX(4, 7.8, 0) === 35.2, 'col4 等宽 → 35.2，got ' + guideX(4, 7.8, 0))
ok(guideX(4, 6.5, 0) === 30, 'col4 非等宽(空格6.5) → 30，got ' + guideX(4, 6.5, 0))
ok(guideX(4, 7.8, 1) === 38.2, 'col4 字距1px → 38.2，got ' + guideX(4, 7.8, 1))
ok(guideX(8, 7.8, 1) === 73.4, 'col8 字距1px → 73.4，got ' + guideX(8, 7.8, 1))

console.log(pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
