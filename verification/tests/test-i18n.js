// i18n 完整性测试：所有 tr("中文") 引用在 I18N_EN 中有英文翻译；抽样验证
const fs = require('fs')
const src = fs.readFileSync(require('./paths').CLIENT_SRC, 'utf8')

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) } }

// 1. 提取所有 tr("中文") key（含 tr(meta.title)/tr(s.desc)/tr(g) 是变量调用，不算）
const keys = [...new Set([...src.matchAll(/tr\("([^"]*[\u4e00-\u9fff][^"]*)"(?:,\s*\{[^}]*\})?\)/g)].map((x) => x[1]))]
ok(keys.length > 100, 'tr() 引用的中文文案 ' + keys.length + ' 个')

// 2. 提取 I18N_EN
const enBlock = src.match(/const I18N_EN = \{([\s\S]*?)\n\t\t\};/)
ok(!!enBlock, '找到 I18N_EN 表')
const enMap = {}
if (enBlock) {
  for (const m of enBlock[1].matchAll(/"((?:[^"\\]|\\.)*)":\s*"((?:[^"\\]|\\.)*)"/g)) enMap[m[1]] = m[2]
}
ok(Object.keys(enMap).length > 200, 'I18N_EN 条目 ' + Object.keys(enMap).length + ' 个')

// 3. 完整性：每个 key 都有英文（变量型调用除外）
const missing = keys.filter((k) => enMap[k] === undefined)
ok(missing.length === 0, '全部 key 有英文翻译' + (missing.length ? '，缺失: ' + missing.slice(0, 5).join(' | ') : ''), )

// 4. 抽样验证
const samples = [["运行游戏", "Run Game"], ["保存", "Save"], ["检查", "Check"], ["项目文件", "Project files"], ["工作范围", "Workspace"], ["静态诊断", "Static diagnostics"], ["个性化设置", "Settings"]]
for (const [k, v] of samples) ok(enMap[k] === v, '「' + k + '」→ "' + v + '"', enMap[k])

// 5. tr 逻辑：UI_LANG en/zh/system 分支
ok(/const tr = \(text, vars\) => \{/.test(src), 'tr 函数定义存在')
ok(/const uiLang = \(\) => \{/.test(src), 'uiLang 函数定义存在')
ok(/ui\.language/.test(src), 'ui.language 设置项存在')

console.log(pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
