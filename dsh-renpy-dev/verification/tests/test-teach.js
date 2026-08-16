// teachLine 依赖验证：readSkillFile 路径 + skill 文件真实存在（不调 llm，只验证输入侧）
const fs = require('fs')
const path = require('path')
// skill 目录：发布包内 skills/（可移植）；如需验证已部署到 ~/.dsh/skills 的版本，可设 SKILL_ROOT 覆盖
const skillRoot = process.env.SKILL_ROOT || path.join(__dirname, '..', '..', 'skills')
let p = 0, f = 0
const ok = (c, msg, extra) => { if (c) { p++; } else { f++; console.log('  ✗ FAIL:', msg, extra !== undefined ? '| got ' + JSON.stringify(extra) : '') } }

// 1. 全部 14 个 skill 文件存在且非空
const names = ['renpy-core','renpy-text','renpy-atl','renpy-screen','renpy-api','renpy-l10n','renpy-practices','renpy-layeredimage','renpy-transitions','renpy-save','renpy-sprites','renpy-test','renpy-build','renpy-gui']
for (const n of names) {
  const fp = skillRoot + '/' + n + '.md'
  if (!fs.existsSync(fp)) { ok(false, 'skill 文件存在: ' + n); continue }
  const body = fs.readFileSync(fp, 'utf8').replace(/^---[\s\S]*?---\s*/, '').trim()
  ok(body.length > 200, 'skill 正文非空: ' + n + ' (' + body.length + ' chars)', body.length)
}

// 2. teachLine 的 skill 名清洗：只允许 [a-z0-9-]（host 侧 readSkillFile 逻辑）
const clean = (name) => String(name || '').replace(/[^a-z0-9-]/gi, '')
ok(clean('renpy-core') === 'renpy-core', 'clean 保留连字符', clean('renpy-core'))
ok(clean('renpy-core 中文 x!') === 'renpy-corex', 'clean 剥非法字符', clean('renpy-core 中文 x!'))
// client 实际传的是 split('·')[0].trim() → 直接是 skill 名；host 侧再 clean 一次防御
ok(clean('renpy-text'.split('·')[0].trim()) === 'renpy-text', 'client 传值路径', clean('renpy-text'.split('·')[0].trim()))
ok(clean('renpy-text · say 语句变体'.split('·')[0].trim()) === 'renpy-text', 'client split 后传值', clean('renpy-text · say 语句变体'.split('·')[0].trim()))

// 3. DOC 映射 → skill 前缀 → 文件存在的闭环（学习模式点击的每类语句都能找到 skill）
const DOC = {
  label: 'renpy-core', say: 'renpy-text', menu: 'renpy-core', jump: 'renpy-core', call: 'renpy-core', return: 'renpy-core',
  scene: 'renpy-core', show: 'renpy-core', hide: 'renpy-core', with: 'renpy-transitions', define: 'renpy-core',
  default: 'renpy-core', image: 'renpy-core', transform: 'renpy-atl', screen: 'renpy-screen', python: 'renpy-core',
  dollar: 'renpy-core', if: 'renpy-core', play: 'renpy-api', pause: 'renpy-core', window: 'renpy-text',
  layeredimage: 'renpy-layeredimage', translate: 'renpy-l10n', init: 'renpy-core', comment: 'renpy-core',
}
for (const [k, sk] of Object.entries(DOC)) {
  ok(fs.existsSync(skillRoot + '/' + sk + '.md'), 'DOC.' + k + ' → skill 文件: ' + sk)
}

console.log(p + ' passed, ' + f + ' failed')
process.exit(f ? 1 : 0)
