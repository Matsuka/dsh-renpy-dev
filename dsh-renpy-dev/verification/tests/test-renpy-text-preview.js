// renpyTextPreview 解析器单测（renpy-text skill 知识 → 代码的正确性验证）
const fs = require('fs')
const src = fs.readFileSync(require('./paths').CLIENT_SRC, 'utf8')
const m = src.match(/const renpyTextPreview = \(line\) => \{[\s\S]*?\n\t\t\};/)
if (!m) { console.log('未找到 renpyTextPreview'); process.exit(1) }
const fn = eval('(' + m[0].replace(/^const /, '').replace(/;$/, '') + ')')
let p = 0, f = 0
const ok = (c, msg, extra) => { if (c) { p++; } else { f++; console.log('  ✗ FAIL:', msg, extra !== undefined ? '| got ' + JSON.stringify(extra) : '') } }
const text = (r) => (r ? r.nodes.filter(n => n.t === 'text').map(n => n.s).join('') : null)
const notesKinds = (r) => (r ? r.notes.map(n => n.kind) : [])

// ── 语句识别 ──
let r = fn('e "你好"')
ok(r && r.who === 'e' && text(r) === '你好', '角色 say 识别', r)
r = fn('"旁白"')
ok(r && r.who === null && text(r) === '旁白', '旁白识别', r)
ok(fn('jump start') === null, '非 say 语句 → null', fn('jump start'))
r = fn('e "你好" (what_color="#8c8")')
ok(r && text(r) === '你好', 'say 带参数仍识别', r)

// ── 基础样式标签 ──
r = fn('e "{b}粗{/b}"')
ok(r && r.nodes.some(n => n.t === 'text' && n.s === '粗' && n.style.bold), '粗体', r.nodes)
r = fn('e "{i}斜{/i} {u}下{/u} {s}删{/s}"')
ok(r && r.nodes.some(n => n.s === '斜' && n.style.italic), '斜体', r.nodes)
ok(r && r.nodes.some(n => n.s === '下' && n.style.underline), '下划线', r.nodes)
ok(r && r.nodes.some(n => n.s === '删' && n.style.strikethrough), '删除线', r.nodes)
r = fn('e "{b}粗 {plain}不粗{/plain} 粗{/b}"')
ok(r && r.nodes.some(n => n.s === '不粗' && !n.style.bold), 'plain 清除粗体', r.nodes)
ok(r && r.nodes.some(n => n.s.trim() === '粗' && n.style.bold && !n.style.italic), 'plain 后恢复粗体', r.nodes)

// ── 尺寸 / 颜色 / 透明度 ──
r = fn('e "{size=+10}大{/size}"')
ok(r && r.nodes.some(n => n.s === '大' && n.style.size === 32), 'size=+10 相对（基线22）', r.nodes)
r = fn('e "{size=*2}倍{/size}"')
ok(r && r.nodes.some(n => n.s === '倍' && n.style.size === 44), 'size=*2 乘法', r.nodes)
r = fn('e "{size=24}定{/size}"')
ok(r && r.nodes.some(n => n.s === '定' && n.style.size === 24), 'size=24 绝对', r.nodes)
r = fn('e "{color=#f00}红{/color}"')
ok(r && r.nodes.some(n => n.s === '红' && n.style.color === '#ff0000'), '#rgb 展开', r.nodes)
r = fn('e "{color=#00ff00}绿{/color}"')
ok(r && r.nodes.some(n => n.s === '绿' && n.style.color === '#00ff00'), '#rrggbb', r.nodes)
r = fn('e "{color=#0000ffff}蓝{/color}"')
ok(r && r.nodes.some(n => n.s === '蓝' && n.style.color.indexOf('rgba(0,0,255,') === 0), '#rrggbbaa → rgba', r.nodes)
r = fn('e "{alpha=0.5}淡{/alpha}"')
ok(r && r.nodes.some(n => n.s === '淡' && n.style.alpha === 0.5), 'alpha 绝对', r.nodes)
r = fn('e "{alpha=*0.5}半{/alpha}"')
ok(r && r.nodes.some(n => n.s === '半' && n.style.alpha === 0.5), 'alpha 乘法', r.nodes)

// ── 嵌套与回溯 ──
r = fn('e "{b}a{size=+5}c{/size}d{/b}"')
const parts = r.nodes.filter(n => n.t === 'text')
ok(parts.length === 3 && parts[0].s === 'a' && parts[0].style.bold && !parts[0].style.size, '嵌套1 a 只粗', parts)
ok(parts[1].s === 'c' && parts[1].style.bold && parts[1].style.size === 27, '嵌套2 c 粗+大', parts)
ok(parts[2].s === 'd' && parts[2].style.bold && !parts[2].style.size, '嵌套3 d 只粗', parts)

// ── 插值 / 转义 ──
r = fn('e "分数 [points] 分"')
ok(r && r.nodes.some(n => n.t === 'interp' && n.expr === 'points'), '插值节点', r.nodes)
ok(notesKinds(r).indexOf('interp') >= 0, '插值降级提示', notesKinds(r))
r = fn('e "[[字面] [player.names[0]] 好"')
ok(text(r).indexOf('[字面]') >= 0, '[[ → 字面 [', text(r))
ok(r.nodes.some(n => n.t === 'interp' && n.expr === 'player.names[0]'), '嵌套方括号表达式', r.nodes)
r = fn('e "{{花括号} 100%%"')
// 引擎实测（8.5.3）：现代 Ren'Py 中 % 不需要转义——%% 原样显示、\% → %%；doc 的 "%% → %" 属 old_substitutions 旧语法
ok(text(r) === '{花括号} 100%%', '{{ → 字面 {；%% 引擎实测原样', text(r))
r = fn('e "a\\nb \\u4f60\\u597d \\"q\\""')
ok(text(r).indexOf('\n') >= 0 && text(r).indexOf('你好') >= 0 && text(r).indexOf('"q"') >= 0, '\\n \\uXXXX \\" 转义', text(r))
r = fn('e "a   b"')
ok(text(r) === 'a b', '空白折叠', text(r))
r = fn('e r"a  b \\n"')
ok(text(r) === 'a  b \\n', 'raw 字符串不处理', text(r))

// ── 对话标签 / 自闭合 ──
r = fn('e "A{w}B"')
ok(r && r.nodes.some(n => n.t === 'pause' && n.kind === 'w'), '{w} 等待节点', r.nodes)
r = fn('e "A{space=30}B"')
ok(r && r.nodes.some(n => n.t === 'space' && n.n === 30), '{space=30}', r.nodes)
r = fn('e "A{image=heart.png}B"')
ok(r && r.nodes.some(n => n.t === 'image' && n.src === 'heart.png'), '{image} 节点', r.nodes)
ok(notesKinds(r).indexOf('image') >= 0, '图片降级提示', notesKinds(r))
r = fn('e "A{nw}B{fast}C{done}D"')
ok(r && r.nodes.some(n => n.t === 'nw') && r.nodes.some(n => n.t === 'fast') && r.nodes.some(n => n.t === 'done'), 'nw/fast/done 节点', r.nodes)

// ── 高级标签：标记 + 降级提示 ──
r = fn('e "【{rb}東{/rb}{rt}とう{/rt}】"')
ok(r && notesKinds(r).indexOf('ruby') >= 0, 'ruby 降级提示', notesKinds(r))
r = fn('e "{=mystyle}样式{/=}"')
ok(r && r.nodes.some(n => n.s === '样式' && n.style.styleName === 'mystyle'), '{=style} 标记', r.nodes)
ok(notesKinds(r).indexOf('style') >= 0, '样式降级提示', notesKinds(r))
r = fn('e "{font=mikachan.ttf}字体{/font}"')
ok(r && r.nodes.some(n => n.s === '字体' && n.style.font === 'mikachan.ttf'), '{font} 记录', r.nodes)
ok(notesKinds(r).indexOf('font') >= 0, '字体降级提示', notesKinds(r))
r = fn('e "{a=jump:more}链接{/a}"')
ok(r && r.nodes.some(n => n.s === '链接' && n.style.href === 'jump:more'), '{a} 超链接', r.nodes)
r = fn('e "{cps=40}快{/cps}"')
ok(r && r.nodes.some(n => n.s === '快' && n.style.cps === 40), 'cps 绝对值进样式', r && r.nodes)
r = fn('e "{cps=*2}快{/cps}"')
ok(r && r.nodes.some(n => n.s === '快' && n.style.cps === 40), 'cps 倍数（20×2=40）进样式', r && r.nodes)
ok(notesKinds(r).indexOf('cps') >= 0, 'cps 提示保留', notesKinds(r))

// ── 错误处理 ──
r = fn('e "{zzz}未知{/zzz}"')
ok(r && r.nodes.some(n => n.t === 'err'), '未知标签 err 节点', r.nodes)
ok(notesKinds(r).indexOf('unknown') >= 0, '未知标签降级提示', notesKinds(r))
r = fn('e "a{/b}"')
ok(notesKinds(r).indexOf('mismatch') >= 0, '不匹配关闭提示', notesKinds(r))
r = fn('e "{color=notacolor}x{/color}"')
ok(notesKinds(r).indexOf('color') >= 0, '无效颜色提示', notesKinds(r))

// ── 翻译消歧 # 忽略 ──
r = fn('e "新{#playlist}"')
ok(text(r) === '新', '{#x} 忽略', text(r))

console.log(p + ' passed, ' + f + ' failed')
process.exit(f ? 1 : 0)
