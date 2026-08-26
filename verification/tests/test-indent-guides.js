// 验证缩进线档位逻辑：每行缩进产生所有档位边界
function guideKeys(content, ts) {
  const guide = {}
  const lines = content.split('\n')
  const tabPad = ' '.repeat(ts)
  for (let i = 0; i < lines.length; i++) {
    const m = /^[ \t]*/.exec(lines[i])
    const raw = m[0].replace(/\t/g, tabPad)
    const n = raw.length
    if (n <= 0) continue
    for (let k2 = ts; k2 <= n; k2 += ts) {
      if (!guide[k2]) guide[k2] = { first: i, last: i }
      else { guide[k2].first = Math.min(guide[k2].first, i); guide[k2].last = Math.max(guide[k2].last, i) }
    }
  }
  return Object.keys(guide).map(Number).sort((a, b) => a - b)
}

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('✗ FAIL:', msg) } }

// 用例1：两层缩进（8 空格）→ 应有 4 和 8 两档
let ks = guideKeys('label a:\n        "deep"\n    "mid"\nlabel b:\n', 4)
ok(JSON.stringify(ks) === '[4,8]', '两层缩进 → [4,8]，got ' + JSON.stringify(ks))

// 用例2：三层（12 空格）→ [4,8,12]
ks = guideKeys('label a:\n            "deepest"\n', 4)
ok(JSON.stringify(ks) === '[4,8,12]', '三层缩进 → [4,8,12]，got ' + JSON.stringify(ks))

// 用例3：单层（4 空格）→ [4]
ks = guideKeys('label a:\n    "one"\n', 4)
ok(JSON.stringify(ks) === '[4]', '单层 → [4]，got ' + JSON.stringify(ks))

// 用例4：tab 缩进（2 个 tab = 8 空格，tabSize 4）→ [4,8]
ks = guideKeys('label a:\n\t\t"tabs"\n', 4)
ok(JSON.stringify(ks) === '[4,8]', 'tab 缩进 → [4,8]，got ' + JSON.stringify(ks))

// 用例5：非整档（6 空格）→ 只画 4 档（6<8）
ks = guideKeys('label a:\n      "six"\n', 4)
ok(JSON.stringify(ks) === '[4]', '6 空格 → [4]，got ' + JSON.stringify(ks))

// 用例6：无缩进 → []
ks = guideKeys('label a:\nlabel b:\n', 4)
ok(JSON.stringify(ks) === '[]', '无缩进 → []，got ' + JSON.stringify(ks))

// ── x 定位：锚定空格宽（spaceW）+ 4px padding + letterSpacing(n-1 间距) ──
function guideX(col, spaceW, sp) {
  return 4 + col * spaceW + (col > 1 ? sp * (col - 1) : 0)
}
// 用例7：等宽（spaceW=7.8，无字距）col=4 → 4 + 31.2
ok(guideX(4, 7.8, 0) === 35.2, '等宽 col4 → 35.2，got ' + guideX(4, 7.8, 0))
// 用例8：非等宽（空格 6.5px）col=4 → 4 + 26 = 30（比数字宽锚定偏左，贴合实际渲染）
ok(guideX(4, 6.5, 0) === 30, '非等宽 col4 → 30，got ' + guideX(4, 6.5, 0))
// 用例9：字距 1px col=8 → 4 + 8*7.8 + 7*1
ok(guideX(8, 7.8, 1) === 73.4, '字距1px col8 → 73.4，got ' + guideX(8, 7.8, 1))
// 用例10：col=1 无间距项（col>1 才加）
ok(guideX(1, 7.8, 5) === 11.8, 'col1 不加字距 → 11.8，got ' + guideX(1, 7.8, 5))

console.log(pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
