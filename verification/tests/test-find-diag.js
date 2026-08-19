// 静态诊断验证（findDiagnostics：invalid_jump / undefined_screen / undefined_character /
// missing_asset / unreachable_label）
// 运行：node verification/tests/test-find-diag.js
'use strict'
const { findDiagnostics } = require(require('./paths').CORE_MODULE)
let p = 0, f = 0
const ok = (c, msg, extra) => { if (c) { p++ } else { f++; console.log('  ✗ FAIL:', msg, extra !== undefined ? '| got ' + JSON.stringify(extra) : '') } }

// ── 基础样例：正常项目（应零诊断） ───────────────────────────────────────
const GOOD_FILES = [
  { rel: 'script.rpy', content: [
    'define e = Character("艾琳", color="#c8c8ff")',
    'define character.naomi = Character("娜奥米")',
    'default s = Character("测试")',
    '',
    'image bg house = "images/bg/house.png"',
    '',
    'label start:',
    '    scene bg house with fade',
    '    e "你好"',
    '    menu:',
    '        "继续":',
    '            jump chapter1',
    '        "看看":',
    '            call chapter2',
    '    return',
    '',
    'label chapter1:',
    '    e "第一章"',
    '    jump end1',
    '',
    'label chapter2:',
    '    "旁白"',
    '    return',
    '',
    'label end1:',
    '    return',
  ].join('\n') },
];
const GOOD_ASSETS = {
  images: ['images/bg/house.png', 'images/charas/eileen/eileen happy.png', 'images/charas/eileen/happy.png'],
  audio: ['audio/bgm/theme.ogg'],
  fonts: ['fonts/cn.ttf'],
}
{
  const r = findDiagnostics(GOOD_FILES, GOOD_ASSETS)
  ok(r.items.length === 0, '正常项目零诊断', r.items)
}

// ── 坏引用样例：五种诊断各命中 ──────────────────────────────────────────
const BAD_FILES = [
  { rel: 'script.rpy', content: [
    'define e = Character("艾琳")',
    'image bg house = "images/bg/house.png"',
    'screen choice_ui():',
    '    text "选择"',
    '',
    'label start:',
    '    scene bg house',
    '    e "开始"',
    '    jump missing_label',            // invalid_jump
    '    call screen no_screen',          // undefined_screen
    '    show bg castle at left',         // missing_asset（castle 未定义）
    '    play music "audio/ghost.ogg"',   // missing_asset（音频不存在）
    '    show screen choice_ui',          // 存在 ✓
    '    return',
    '',
    'label hidden:',                      // unreachable_label（无任何引用）
    '    stranger "谁？"',                // undefined_character（stranger 未定义）
    '    return',
  ].join('\n') },
];
{
  const r = findDiagnostics(BAD_FILES, GOOD_ASSETS)
  const byKind = {};
  for (const it of r.items) (byKind[it.kind] = byKind[it.kind] || []).push(it)
  ok(byKind.invalid_jump && byKind.invalid_jump.length === 1 && byKind.invalid_jump[0].target === 'missing_label', 'invalid_jump 命中', byKind.invalid_jump)
  ok(byKind.undefined_screen && byKind.undefined_screen.length === 1 && byKind.undefined_screen[0].target === 'no_screen', 'undefined_screen 命中', byKind.undefined_screen)
  ok(byKind.missing_asset && byKind.missing_asset.length === 2, 'missing_asset 2 条（castle + ghost.ogg）', byKind.missing_asset && byKind.missing_asset.map((x) => x.target))
  ok(byKind.undefined_character && byKind.undefined_character.length === 1 && byKind.undefined_character[0].target === 'stranger', 'undefined_character 命中', byKind.undefined_character)
  ok(byKind.unreachable_label && byKind.unreachable_label.length === 1 && byKind.unreachable_label[0].target === 'hidden', 'unreachable_label 命中', byKind.unreachable_label)
  ok(byKind.invalid_jump[0].line === 9 && byKind.invalid_jump[0].level === 'error', 'invalid_jump 行号/级别', byKind.invalid_jump[0])
  ok(byKind.unreachable_label[0].level === 'info', 'unreachable info 级', byKind.unreachable_label[0])
  ok(byKind.missing_asset[0].level === 'warn', 'missing_asset warn 级', byKind.missing_asset[0])
}

// ── 误报控制 1：动态跳转/表达式/call screen/默认角色/字符串角色名 不报 ────
const DYN_FILES = [
  { rel: 'script.rpy', content: [
    'label start:',
    '    $ renpy.jump("somewhere")',
    '    jump expression _next_label',
    '    call expression expr',
    '    call screen save',
    '    "旁白"',
    '    "林" "字符串角色名"',
    '    centered "居中"',
    '    extend "续接"',
    '    nvl "多行"',
    '    return',
  ].join('\n') },
];
{
  const r = findDiagnostics(DYN_FILES, {})
  ok(r.items.length === 0, '动态/表达式/默认角色零诊断', r.items)
}

// ── 误报控制 2：screen 控件文本 / style 属性引号 不算角色 ────────────────
const SCREEN_FILES = [
  { rel: 'script.rpy', content: [
    'screen demo():',
    '    text "按钮文字"',
    '    textbutton "开始" action Return()',
    '    button:',
    '        text "内部"',
    '    vbox:',
    '        imagebutton auto "gui/btn_%s.png" action Return()',
    'style demo_text:',
    '    color "#fff"',
    '    background "gui/bg.png"',
    '    font "fonts/cn.ttf"',
    '    size 20',
  ].join('\n') },
];
{
  const r = findDiagnostics(SCREEN_FILES, { fonts: ['fonts/cn.ttf'] })
  ok(r.items.length === 0, 'screen 控件/style 属性零误报', r.items)
}

// ── 自动图像索引（差分含空格）与 show e at / scene 颜色 ──────────────────
const AUTO_FILES = [
  { rel: 'script.rpy', content: [
    'label start:',
    '    show eileen happy at right',   // images/eileen happy.png 自动索引 ✓
    '    scene black',                  // 内置颜色 ✓
    '    show eileen at left',          // images/eileen.png 自动索引 ✓
    '    return',
  ].join('\n') },
];
{
  const r = findDiagnostics(AUTO_FILES, { images: ['images/charas/eileen/eileen happy.png', 'images/eileen.png'] })
  ok(r.items.length === 0, '自动图像索引/颜色名零误报', r.items)
}

// ── 无 start 时跳过不可达诊断 ────────────────────────────────────────────
{
  const r = findDiagnostics([{ rel: 'x.rpy', content: 'label only_here:\n    return\n' }], {})
  ok(!r.items.some((it) => it.kind === 'unreachable_label'), '无 start 不报不可达', r.items)
}

// ── 空输入 ───────────────────────────────────────────────────────────────
{
  const r = findDiagnostics([], {})
  ok(r.items.length === 0 && Object.keys(r.counts).length === 0, '空输入零诊断', r)
}

console.log(p + ' passed, ' + f + ' failed')
process.exit(f ? 1 : 0)
