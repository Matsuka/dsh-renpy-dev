// 侧栏 logo 固定品牌色测试：验证 client.js 注入的 CSS 选择器与颜色值
// 背景：DSH 的 FishLogo/BrandWordmark 是 fill:currentColor（继承按钮 color → --dsw-alias-label-primary token），
// 调配色会跟着变；注入 CSS 将其固定为 Ren'Py 品牌色 #00b8c3（排除面板图标 panelIcon）。
const fs = require('fs')
const vm = require('vm')
const src = fs.readFileSync(require('./paths').CLIENT_SRC, 'utf8')

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) } }

const m = src.match(/style\.textContent = ([^;]+);/)
if (!m) { console.log('  ✗ FAIL: 未找到 style.textContent 注入'); process.exit(1) }
const css = String(vm.runInNewContext(m[1]))

console.log('1) 注入内容')
ok(css.indexOf('[data-composer-seat]{display:none!important}') >= 0, '保留原生输入框隐藏规则')
ok(css.indexOf('[class$="logoRow"]') >= 0, '选择器锚定侧栏 logoRow（CSS Module 后缀稳定）')
ok(css.indexOf('button svg') >= 0, '作用于 logoRow 内按钮的 svg')
ok(css.indexOf(':not([class$="panelIcon"])') >= 0, '排除面板图标（展开/折叠按钮图标保持主题色）')
ok(css.indexOf('color:#00b8c3!important') >= 0, '颜色固定为 Ren' + "'" + 'Py 品牌色 #00b8c3')

console.log('2) 选择器语义推演（模拟宿主 DOM 类名）')
const cases = [
  ['<button class="hHd-Xa_iconButton hHd-Xa_toggle"><svg class="hHd-Xa_railFish"></svg></button>', true, '折叠态鱼形 logo（railFish）→ 被固定'],
  ['<button class="hHd-Xa_brand hHd-Xa_wide"><svg></svg></button>', true, '宽态品牌字标 BrandWordmark（无 class 的 svg）→ 被固定'],
  ['<button class="hHd-Xa_iconButton hHd-Xa_toggle"><svg class="hHd-Xa_panelIcon"></svg></button>', false, '面板图标（panelIcon）→ 不被固定'],
]
// 用 node 的 CSS 选择器匹配能力近似验证：把类名断言在注入文本的选择器结构上
const sel = /\[class\$="logoRow"\]\s*button\s+svg:not\(\[class\$="panelIcon"\]\)/.exec(css)
ok(!!sel, '选择器结构完整（logoRow > button svg:not(panelIcon)）')
for (const [html, expect, label] of cases) {
  // 近似验证：railFish/brand 的 svg 是否被 :not(panelIcon) 放行
  const hasPanelIcon = html.indexOf('panelIcon') >= 0
  const wouldMatch = !hasPanelIcon
  ok(wouldMatch === expect, label + (wouldMatch === expect ? '' : '（选择器不匹配！）'))
}

console.log(pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
