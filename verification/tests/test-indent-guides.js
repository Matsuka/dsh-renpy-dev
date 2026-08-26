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

console.log(pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
