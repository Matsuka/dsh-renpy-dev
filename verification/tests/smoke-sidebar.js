// 冒烟测试：加载 renpy-client bundle，渲染 RenpyPanel（含美化侧栏），抓引用/渲染错误。
const fs = require('fs');
const path = require('path');

// 从 DSH 安装目录解析 react / react-dom（发布包内不含这些依赖）。
// 通过 DSH_PKG 环境变量指定 DSH 安装位置（如 npm 全局 node_modules/@deepseek-ai/dsh）；
// 未指定时尝试从当前 node 解析链查找（适用于在 DSH 环境内运行的情况）。
const dshPkg = process.env.DSH_PKG || (() => {
  try { return path.dirname(require.resolve('@deepseek-ai/dsh/package.json')); } catch { return ''; }
})();
if (!dshPkg) {
  console.error('✗ 无法定位 DSH 安装目录。请设置环境变量 DSH_PKG=<dsh 安装路径> 后重试。');
  process.exit(1);
}
const root = path.join(dshPkg, 'node_modules');
const react = require(path.join(root, 'react'));
const reactDOM = require(path.join(root, 'react-dom'));
const { renderToString } = require(path.join(root, 'react-dom/server'));

// client bundle 依赖代理：react + react-dom（ReactDOM.createPortal 用于浮动窗/面板渲染）
const depProxy = (id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); };

let captured = null;
global.window = {};
global.window.__ModuleLoader__ = { load: (m) => { captured = m.factory; } };

const src = fs.readFileSync(require('./paths').CLIENT_SRC, 'utf8');
// 注入模拟数据，测试有内容时的渲染分支
const fakeFeed = `const [feed, setFeed] = React.useState({ chat: [ { id: "m1", t: "assistant", text: "你好，我是 **RenPy** 助手，支持 \\\`code\\\`。", r: 1, rText: "先分析一下需求……" }, { id: "m2", t: "user", text: "帮我写个开场" }, { id: "m3", t: "assistant", text: "label start: \\n  \\"你好！\\"" } ], trail: [ { id: "t1", name: "lint", done: true, args: "{ project: demo }" }, { id: "t2", name: "run", done: false, args: "" }, { id: "t3", name: "edit", done: true, args: "{\\"file_path\\":\\"game/script.rpy\\",\\"old_string\\":\\"x\\"}", kind: "edit", file: "game/script.rpy" } ] });`;
// 注入模拟资源（含子目录），测试文件夹树渲染
const fakeAssets = `const [assets, setAssets] = React.useState({ image: [ { rel: "images/bg/house.png", size: 2048 }, { rel: "images/chars/eileen.png", size: 4096 }, { rel: "images/chars/akari.png", size: 1024 }, { rel: "images/logo.png", size: 512 } ], audio: [ { rel: "audio/bgm/theme.ogg", size: 8192 }, { rel: "audio/click.ogg", size: 64 } ], video: [], font: [ { rel: "fonts/cn.ttf", size: 1024 } ], other: [] });`;
const fakeFiles = `const [files, setFiles] = React.useState(["script.rpy", "chars/eileen.rpy", "options.rpy"]);`;
let srcWithData = src.replace(
  'const [feed, setFeed] = React.useState({ chat: [], trail: [] });',
  fakeFeed
);
srcWithData = srcWithData.replace(
  'const [assets, setAssets] = React.useState(panelState.assets || { image: [], audio: [], video: [], font: [], other: [] });',
  fakeAssets
);
srcWithData = srcWithData.replace(
  'const [files, setFiles] = React.useState(panelState.files);',
  fakeFiles
);
srcWithData = srcWithData.replace(
  'const [hoverMsgId, setHoverMsgId] = React.useState(null);',
  'const [hoverMsgId, setHoverMsgId] = React.useState("m2");'
);
srcWithData = srcWithData.replace(
  'const [previewImg, setPreviewImg] = React.useState(panelState.previewImg || null);',
  'const [previewImg, setPreviewImg] = React.useState("images/bg/house.png");'
);
require('vm').runInThisContext(srcWithData, { filename: 'client.js' });
console.log('debug srcWithData previewImg 行:', srcWithData.indexOf('React.useState("images/bg/house.png")') >= 0);

// 再测"轨迹"页签分支：初始 sideTab 强制为 trail
const srcTrail = srcWithData.replace('React.useState(panelState.sideTab || "chat")', 'React.useState("trail")');
let captured2 = null;
global.window.__ModuleLoader__.load = (m) => { captured2 = m.factory; };
require('vm').runInThisContext(srcTrail, { filename: 'client-trail.js' });
const modTrail = captured2((id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); });
let reg2 = null;
const slots2 = { inject: (n, fn) => { reg2 = fn; }, register: (o, c) => ({ opts: o, comp: c }) };
modTrail.apply({ get: (n) => (n === 'slots' ? slots2 : undefined) });
const elTrail = reg2().comp({ sessionId: 's3', inputActions: undefined });
const htmlTrail = renderToString(elTrail);
console.log('轨迹页签: lint 卡片', htmlTrail.indexOf('lint') >= 0, '| ✓ 完成态', htmlTrail.indexOf('✓') >= 0, '| run 进行中', htmlTrail.indexOf('run') >= 0);
console.log('轨迹编辑条目: ✎ 标记', htmlTrail.indexOf('✎') >= 0, '| 文件', htmlTrail.indexOf('game/script.rpy') >= 0);

const mod = captured((id) => {
  if (id === 'react') return react; if (id === 'react-dom') return reactDOM;
  throw new Error('unexpected require: ' + id);
});

// 模拟 slots 服务
let reg = null;
const slots = {
  inject: (name, fn) => { reg = fn; },
  register: (opts, comp) => ({ opts, comp }),
};
const ctx = { get: (n) => (n === 'slots' ? slots : undefined) };
mod.apply(ctx);
if (!reg) throw new Error('conversation.view 未注册');

const { opts, comp } = reg();
console.log('slot:', opts.id, 'order', opts.order, 'label', opts.label);

// 渲染含侧栏的面板（hideSidebar 未设 → 侧栏开启，走美化分支）
const el = comp({ sessionId: 'smoke-session', inputActions: undefined });
const html = renderToString(el);
console.log('rendered OK, html length:', html.length);
console.log('含气泡文本:', html.indexOf('你好，我是') >= 0, '| 用户气泡:', html.indexOf('帮我写个开场') >= 0);
console.log('markdown: 粗体', html.indexOf('<strong>RenPy</strong>') >= 0, '| 行内代码', html.indexOf('>code</code>') >= 0);
console.log('思考标记: 标签', html.indexOf('🤔 思考') >= 0);
console.log('编辑重发: 编辑按钮', html.indexOf('✎ 编辑') >= 0, '| 复制按钮', html.indexOf('⧉ 复制') >= 0);
console.log('素材预览浮窗: 浮窗', html.indexOf('关闭预览') >= 0, '| 路径', html.indexOf('images/bg/house.png') >= 0, '| 不占编辑器(旧文本移除)', html.indexOf('素材预览: images') < 0);
console.log('  debug 浮窗样式:', html.indexOf('right: 14px') >= 0, '| previewImg 注入后:', html.indexOf('React.useState("images/bg/house.png")') >= 0);
console.log('轨迹卡片:', html.indexOf('lint') >= 0 && html.indexOf('✓') >= 0, '| 运行中:', html.indexOf('run') >= 0);
// 资源文件夹树断言（files 视图渲染）
console.log('文件视图: 文件标题', html.indexOf('文件 (3)') >= 0, '| 目录树 📁', html.indexOf('📁') >= 0, '| 根文件', html.indexOf('script.rpy') >= 0, '| 导航区', html.indexOf('导航') >= 0 && html.indexOf('标签') >= 0);
// 资源视图（activeView=assets）
const srcAsset = srcWithData.replace('const [activeView, setActiveView] = React.useState("files");', 'const [activeView, setActiveView] = React.useState("assets");');
let captured8 = null;
global.window.__ModuleLoader__.load = (m) => { captured8 = m.factory; };
require('vm').runInThisContext(srcAsset, { filename: 'client-asset.js' });
const modAsset = captured8((id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); });
let reg8 = null;
const slots8 = { inject: (n, fn) => { reg8 = fn; }, register: (o, c) => ({ opts: o, comp: c }) };
modAsset.apply({ get: (n) => (n === 'slots' ? slots8 : undefined) });
const htmlAsset = renderToString(reg8().comp({ sessionId: 's9', inputActions: undefined }));
console.log('资源视图: 标题', htmlAsset.indexOf('资源 (7)') >= 0, '| 分类图标', htmlAsset.indexOf('🖼') >= 0, '| 子目录 bg/chars/bgm', htmlAsset.indexOf('bg') >= 0 && htmlAsset.indexOf('bgm') >= 0);
console.log('资源视图 分类: 图片(4)', htmlAsset.indexOf('图片') >= 0 && htmlAsset.indexOf('▾') >= 0, '| 音频(2)', htmlAsset.indexOf('音频') >= 0, '| 字体(1)', htmlAsset.indexOf('字体') >= 0);

// 展开子目录后叶子文件应渲染（资源视图）
const srcExp = srcWithData
  .replace('const [activeView, setActiveView] = React.useState("files");', 'const [activeView, setActiveView] = React.useState("assets");')
  .replace(
    'const [expanded, setExpanded] = React.useState(panelState.expanded || {});',
    'const [expanded, setExpanded] = React.useState({ "image/bg": true, "image/chars": true, "audio/bgm": true });'
  );
let captured3 = null;
global.window.__ModuleLoader__.load = (m) => { captured3 = m.factory; };
require('vm').runInThisContext(srcExp, { filename: 'client-exp.js' });
const modExp = captured3((id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); });
let reg3 = null;
const slots3 = { inject: (n, fn) => { reg3 = fn; }, register: (o, c) => ({ opts: o, comp: c }) };
modExp.apply({ get: (n) => (n === 'slots' ? slots3 : undefined) });
const htmlExp = renderToString(reg3().comp({ sessionId: 's4', inputActions: undefined }));
console.log('展开后叶子: house.png', htmlExp.indexOf('house.png') >= 0, '| eileen.png', htmlExp.indexOf('eileen.png') >= 0, '| theme.ogg', htmlExp.indexOf('theme.ogg') >= 0, '| click.ogg', htmlExp.indexOf('click.ogg') >= 0);

// 历史弹层分支：histOpen + 版本列表 + 预览
const srcHist = srcWithData
  .replace('const [histOpen, setHistOpen] = React.useState(false);', 'const [histOpen, setHistOpen] = React.useState(true);')
  .replace('const [histVersions, setHistVersions] = React.useState([]);', 'const [histVersions, setHistVersions] = React.useState([{ time: "1723654000000", size: 120 }, { time: "1723654100000", size: 240 }]);')
  .replace('const [histPreview, setHistPreview] = React.useState(null);', 'const [histPreview, setHistPreview] = React.useState({ time: "1723654000000", content: "label start:\\n    \\"v1\\"" });');
let captured4 = null;
global.window.__ModuleLoader__.load = (m) => { captured4 = m.factory; };
require('vm').runInThisContext(srcHist, { filename: 'client-hist.js' });
const modHist = captured4((id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); });
let reg4 = null;
const slots4 = { inject: (n, fn) => { reg4 = fn; }, register: (o, c) => ({ opts: o, comp: c }) };
modHist.apply({ get: (n) => (n === 'slots' ? slots4 : undefined) });
const htmlHist = renderToString(reg4().comp({ sessionId: 's5', inputActions: undefined }));
console.log('历史弹层: 标题', htmlHist.indexOf('保存历史') >= 0, '| 版本数', htmlHist.indexOf('2 个版本') >= 0, '| 恢复按钮', htmlHist.indexOf('恢复') >= 0, '| 预览内容', htmlHist.indexOf('v1') >= 0, '| 关闭按钮', htmlHist.indexOf('关闭') >= 0);
console.log('工具栏历史按钮:', htmlHist.indexOf('历史') >= 0);

// 检查点面板 + gutter 修改标记分支
const fakeCp = [
  'const [cpOpen, setCpOpen] = React.useState(false);',
  'const [cpOpen, setCpOpen] = React.useState(true);',
  'const [cpActive, setCpActive] = React.useState(panelState.cpActive || null);',
  'const [cpActive, setCpActive] = React.useState("1723654000000");',
  'const [cpList, setCpList] = React.useState(panelState.cpList || []);',
  'const [cpList, setCpList] = React.useState([{ id: "1723654000000", files: 3 }]);',
  'const [cpDiff, setCpDiff] = React.useState(panelState.cpDiff || null);',
  'const [cpDiff, setCpDiff] = React.useState({ summary: { files: 1, added: 3, removed: 1 }, files: [ { rel: "script.rpy", added: 3, removed: 1, lineTypes: [null, null, null, null, "mod", "mod", "mod"], hunks: [ { type: "mod", newStart: 4, newCount: 3, oldCount: 1 } ] } ] });'
];
let srcCp = srcWithData;
for (let i = 0; i < fakeCp.length; i += 2) srcCp = srcCp.replace(fakeCp[i], fakeCp[i + 1]);
// 打开 script.rpy 使 gutter 标记可见
srcCp = srcCp
  .replace('const [tabs, setTabs] = React.useState(panelState.tabs);', 'const [tabs, setTabs] = React.useState([{ name: "script.rpy", content: "label start:\\n    \\"v1\\"\\nlabel next:\\n    \\"y\\"\\n    \\"z\\"\\n    \\"w\\"\\n", dirty: false }]);')
  .replace('const [activeName, setActiveName] = React.useState(panelState.activeName);', 'const [activeName, setActiveName] = React.useState("script.rpy");');
let captured5 = null;
global.window.__ModuleLoader__.load = (m) => { captured5 = m.factory; };
require('vm').runInThisContext(srcCp, { filename: 'client-cp.js' });
const modCp = captured5((id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); });
let reg5 = null;
const slots5 = { inject: (n, fn) => { reg5 = fn; }, register: (o, c) => ({ opts: o, comp: c }) };
modCp.apply({ get: (n) => (n === 'slots' ? slots5 : undefined) });
const htmlCp = renderToString(reg5().comp({ sessionId: 's6', inputActions: undefined }));
console.log('检查点面板: 标题', htmlCp.indexOf('检查点修改') >= 0, '| 统计', htmlCp.indexOf('1 个文件') >= 0, '| +3', htmlCp.indexOf('+3') >= 0, '| -1', htmlCp.indexOf('-1') >= 0);
console.log('文件行: script.rpy', htmlCp.indexOf('script.rpy') >= 0, '| 通过按钮', htmlCp.indexOf('全部通过') >= 0, '| 撤回按钮', htmlCp.indexOf('全部撤回') >= 0);
console.log('对话页签检查点时间线: 持久检查点', htmlCp.indexOf('持久检查点') >= 0, '| 时间', htmlCp.indexOf('1723654000000'.replace('', '')) >= 0 || htmlCp.indexOf('●') >= 0);
console.log('gutter 标记: mod 蓝', htmlCp.indexOf('#569cd6') >= 0, '| 修改标记块', htmlCp.indexOf('19.5') >= 0);
console.log('工具栏修改按钮:', htmlCp.indexOf('修改') >= 0);

// 未保存修改条分支：dirty tab + savedSnap（a/b/c → a/X/c/d 应为 +2 -1）
const srcBar = srcWithData
  .replace('const [tabs, setTabs] = React.useState(panelState.tabs);', 'const [tabs, setTabs] = React.useState([{ name: "script.rpy", content: "a\\nX\\nc\\nd\\n", dirty: true }]);')
  .replace('const [activeName, setActiveName] = React.useState(panelState.activeName);', 'const [activeName, setActiveName] = React.useState("script.rpy");')
  .replace('const [savedSnap, setSavedSnap] = React.useState(panelState.savedSnap || null);', 'const [savedSnap, setSavedSnap] = React.useState({ name: "script.rpy", content: "a\\nb\\nc\\n" });');
let captured7 = null;
global.window.__ModuleLoader__.load = (m) => { captured7 = m.factory; };
require('vm').runInThisContext(srcBar, { filename: 'client-bar.js' });
const modBar = captured7((id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); });
let reg7 = null;
const slots7 = { inject: (n, fn) => { reg7 = fn; }, register: (o, c) => ({ opts: o, comp: c }) };
modBar.apply({ get: (n) => (n === 'slots' ? slots7 : undefined) });
const htmlBar = renderToString(reg7().comp({ sessionId: 's8', inputActions: undefined }));
console.log('未保存修改条: 标题', htmlBar.indexOf('未保存修改') >= 0, '| +2 行', htmlBar.indexOf('+2 行') >= 0, '| -1 行', htmlBar.indexOf('-1 行') >= 0, '| 保存', htmlBar.indexOf('保存') >= 0, '| 撤回修改', htmlBar.indexOf('撤回修改') >= 0);

// 编辑器增强分支：查找栏 + lint 下划线 + 补全面板 + 回退保存前
const srcEd = srcWithData
  .replace('const [findOpen, setFindOpen] = React.useState(false);', 'const [findOpen, setFindOpen] = React.useState(true);')
  .replace('const [findText, setFindText] = React.useState("");', 'const [findText, setFindText] = React.useState("label");')
  .replace('const [findReplace, setFindReplace] = React.useState("");', 'const [findReplace, setFindReplace] = React.useState("newlabel");')
  .replace('const [tabs, setTabs] = React.useState(panelState.tabs);', 'const [tabs, setTabs] = React.useState([{ name: "script.rpy", content: "label start:\\n    \\"hello label\\"\\nlabel next:\\n", dirty: false }]);')
  .replace('const [activeName, setActiveName] = React.useState(panelState.activeName);', 'const [activeName, setActiveName] = React.useState("script.rpy");')
  .replace('const [lintErrors, setLintErrors] = React.useState([]);', 'const [lintErrors, setLintErrors] = React.useState([{ file: "script.rpy", line: 2, msg: "test error" }]);')
  .replace('const [completions, setCompletions] = React.useState([]);', 'const [completions, setCompletions] = React.useState([{ label: "label", detail: "语句", kind: "stmt" }, { label: "menu:", detail: "选择菜单", kind: "snippet" }]);')
  .replace('const [compPos, setCompPos] = React.useState(null);', 'const [compPos, setCompPos] = React.useState({ left: 40, top: 120, h: 120 });')
  .replace('const [savedSnap, setSavedSnap] = React.useState(panelState.savedSnap || null);', 'const [savedSnap, setSavedSnap] = React.useState({ name: "script.rpy", content: "OLD" });')
  .replace('const [wsLock, setWsLock] = React.useState(panelState.wsLock || null);', 'const [wsLock, setWsLock] = React.useState({ file: "script.rpy", startLine: 2, endLine: 3, label: "" });')
  .replace('const [bracketMatch, setBracketMatch] = React.useState(null); // {open, close} 字符位置', 'const [bracketMatch, setBracketMatch] = React.useState({ open: 5, close: 11 }); // {open, close} 字符位置');
let captured6 = null;
global.window.__ModuleLoader__.load = (m) => { captured6 = m.factory; };
require('vm').runInThisContext(srcEd, { filename: 'client-ed.js' });
const modEd = captured6((id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); });
let reg6 = null;
const slots6 = { inject: (n, fn) => { reg6 = fn; }, register: (o, c) => ({ opts: o, comp: c }) };
modEd.apply({ get: (n) => (n === 'slots' ? slots6 : undefined) });
const htmlEd = renderToString(reg6().comp({ sessionId: 's7', inputActions: undefined }));
console.log('查找栏: 查找框', htmlEd.indexOf('查找…') >= 0, '| 替换框', htmlEd.indexOf('替换为…') >= 0, '| 全部替换', htmlEd.indexOf('全部替换') >= 0, '| 计数', htmlEd.indexOf('/') >= 0);
console.log('lint 下划线: 红线', htmlEd.indexOf('224,92,92') >= 0, '| 查找高亮', htmlEd.indexOf('229,192,123') >= 0);
console.log('补全面板: stmt 条目', htmlEd.indexOf('label') >= 0 && htmlEd.indexOf('语句') >= 0, '| snippet', htmlEd.indexOf('选择菜单') >= 0);
console.log('工作范围: 条', htmlEd.indexOf('工作范围') >= 0, '| L2-3', htmlEd.indexOf('L2-3') >= 0, '| 🎯按钮', htmlEd.indexOf('🎯') >= 0, '| 清除', htmlEd.indexOf('清除') >= 0 || htmlEd.indexOf('解除') >= 0, '| 图标文字按钮', htmlEd.indexOf('加载') >= 0 && htmlEd.indexOf('保存') >= 0);
console.log('编辑器第二批: 缩进线', htmlEd.indexOf('rgba(255,255,255,.07)') >= 0, '| 当前行高亮', htmlEd.indexOf('rgba(255,255,255,.035)') >= 0, '| 括号匹配高亮', htmlEd.indexOf('rgba(229,192,123,.45)') >= 0);

// 内联文本样式预览模式分支（Aa 预览 toggle：富文本化 + 降级提示条 + {font} 三态 + 字号真实渲染 + 行高放大）
const srcPrev = srcWithData
  .replace('const [stylePreview, setStylePreview] = React.useState(false);', 'const [stylePreview, setStylePreview] = React.useState(true);')
  .replace('const [tabs, setTabs] = React.useState(panelState.tabs);', 'const [tabs, setTabs] = React.useState([{ name: "script.rpy", content: "define e = Character(\\"艾琳\\")\\ne \\"分数 [points] 的{b}粗体{/b} {size=+10}大{/size} 和 {color=#ff0000}红{/color} 用{font=cn.ttf}字体{/font}。\\"\\n\\"旁白 {w} 等待\\"\\n", dirty: false }]);')
  .replace('const [activeName, setActiveName] = React.useState(panelState.activeName);', 'const [activeName, setActiveName] = React.useState("script.rpy");');
let captured9 = null;
global.window.__ModuleLoader__.load = (m) => { captured9 = m.factory; };
require('vm').runInThisContext(srcPrev, { filename: 'client-prev.js' });
const modPrev = captured9((id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); });
let reg9 = null;
const slots9 = { inject: (n, fn) => { reg9 = fn; }, register: (o, c) => ({ opts: o, comp: c }) };
modPrev.apply({ get: (n) => (n === 'slots' ? slots9 : undefined) });
const htmlPrev = renderToString(reg9().comp({ sessionId: 's10', inputActions: undefined }));
console.log('内联预览: 模式条', htmlPrev.indexOf('样式预览') >= 0, '| 降级提示条', htmlPrev.indexOf('降级提示') >= 0, '| 工具栏预览中', htmlPrev.indexOf('预览中') >= 0);
console.log('内联渲染: 粗体', htmlPrev.indexOf('font-weight:700') >= 0, '| 颜色红', htmlPrev.indexOf('#ff0000') >= 0, '| 插值占位', htmlPrev.indexOf('[points]') >= 0, '| 等待标记', htmlPrev.indexOf('⏸') >= 0);
console.log('内联字号: 真实渲染 font-size:24px（32×0.75）', htmlPrev.indexOf('font-size:24px') >= 0, '| 行高放大 34px', htmlPrev.indexOf('height:34px') >= 0);
console.log('内联降级: 插值提示', htmlPrev.indexOf('插值 [points] 在运行时求值') >= 0, '| 角色名保色', htmlPrev.indexOf('#dcdcaa') >= 0);
console.log('内联字体: 存在→加载中标记', htmlPrev.indexOf('字体 cn.ttf（加载中…）') >= 0, '| 不存在提示条移除(fontMap 命中)', htmlPrev.indexOf('字体文件不存在') < 0);

// 打字动画预览分支（出字速度/间隔：预览模式下点击 say 行播放）
const srcAnim = srcWithData
  .replace('const [stylePreview, setStylePreview] = React.useState(false);', 'const [stylePreview, setStylePreview] = React.useState(true);')
  .replace('const [animLine, setAnimLine] = React.useState(null); // 行号', 'const [animLine, setAnimLine] = React.useState(2); // 行号')
  .replace('const [tabs, setTabs] = React.useState(panelState.tabs);', 'const [tabs, setTabs] = React.useState([{ name: "script.rpy", content: "label start:\\n    e \\"你好{cps=40}快速{/cps} {w=1.0}等一秒\\"\\n", dirty: false }]);')
  .replace('const [activeName, setActiveName] = React.useState(panelState.activeName);', 'const [activeName, setActiveName] = React.useState("script.rpy");');
let capturedB = null;
global.window.__ModuleLoader__.load = (m) => { capturedB = m.factory; };
require('vm').runInThisContext(srcAnim, { filename: 'client-anim.js' });
const modAnim = capturedB((id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); });
let regB = null;
const slotsB = { inject: (n, fn) => { regB = fn; }, register: (o, c) => ({ opts: o, comp: c }) };
modAnim.apply({ get: (n) => (n === 'slots' ? slotsB : undefined) });
const htmlAnim = renderToString(regB().comp({ sessionId: 's12', inputActions: undefined }));
console.log('动画条: 标题', htmlAnim.indexOf('▶ 打字动画预览 L2') >= 0, '| 速度 40 字/秒', htmlAnim.indexOf('速度 40 字/秒') >= 0, '| 重播', htmlAnim.indexOf('重播') >= 0, '| 说明', htmlAnim.indexOf('{cps=} 控制出字速度') >= 0, '| 可拖动标题栏', htmlAnim.indexOf('cursor:move') >= 0);
console.log('动画条: 关闭', htmlAnim.indexOf('✕') >= 0, '| 初始态', htmlAnim.indexOf('准备播放') >= 0);

// 字体管理：导航第 5 标签 + 字体列表（assets.font）
const srcFonts = srcWithData
  .replace('const [navKind, setNavKind] = React.useState(panelState.navKind || "labels");', 'const [navKind, setNavKind] = React.useState("fonts");')
  .replace('const [previewFont, setPreviewFont] = React.useState(null); // 字体预览 {rel, size}', 'const [previewFont, setPreviewFont] = React.useState({ rel: "fonts/cn.ttf", size: 1024 });');
let capturedA = null;
global.window.__ModuleLoader__.load = (m) => { capturedA = m.factory; };
require('vm').runInThisContext(srcFonts, { filename: 'client-fonts.js' });
const modFonts = capturedA((id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); });
let regA = null;
const slotsA = { inject: (n, fn) => { regA = fn; }, register: (o, c) => ({ opts: o, comp: c }) };
modFonts.apply({ get: (n) => (n === 'slots' ? slotsA : undefined) });
const htmlFonts = renderToString(regA().comp({ sessionId: 's11', inputActions: undefined }));
console.log('字体导航: 第5标签', htmlFonts.indexOf('字体') >= 0 && htmlFonts.indexOf('🔤') >= 0, '| 列表项', htmlFonts.indexOf('cn.ttf') >= 0, '| 数量', htmlFonts.indexOf('1 个') >= 0);
console.log('字体浮窗: 标题', htmlFonts.indexOf('字体预览') >= 0, '| 示例文本', htmlFonts.indexOf('Font Preview') >= 0, '| 引擎用法提示', htmlFonts.indexOf('引擎用法') >= 0, '| 大小', htmlFonts.indexOf('1.0 KB') >= 0);

// GUI 定制面板分支（🎨 按钮 → 面板：分辨率/主题色/字号）
const srcGui = srcWithData
  .replace('const [guiOpen, setGuiOpen] = React.useState(false);', 'const [guiOpen, setGuiOpen] = React.useState(true);')
  .replace('const [guiForm, setGuiForm] = React.useState(null); // {width, height, vars: {name: value}}', 'const [guiForm, setGuiForm] = React.useState({ width: 1280, height: 720, vars: { "gui.accent_color": "#00b8c3", "gui.text_size": "33" } });');
let capturedG = null;
global.window.__ModuleLoader__.load = (m) => { capturedG = m.factory; };
require('vm').runInThisContext(srcGui, { filename: 'client-gui.js' });
const modGui = capturedG((id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); });
let regG = null;
const slotsG = { inject: (n, fn) => { regG = fn; }, register: (o, c) => ({ opts: o, comp: c }) };
modGui.apply({ get: (n) => (n === 'slots' ? slotsG : undefined) });
const htmlGui = renderToString(regG().comp({ sessionId: 's13', inputActions: undefined }));
console.log('GUI面板: 标题', htmlGui.indexOf('GUI 主题定制') >= 0, '| 分辨率', htmlGui.indexOf('gui.init') >= 0, '| 强调色', htmlGui.indexOf('accent_color') >= 0, '| 字号', htmlGui.indexOf('text_size') >= 0, '| 保存', htmlGui.indexOf('保存到 gui.rpy') >= 0, '| 工具栏🎨', htmlGui.indexOf('GUI') >= 0);

// 学习注释批量生成分支（📖 按钮：批量 AI 注释，无解释条残留）
const srcLearn = srcWithData
  .replace('const [tabs, setTabs] = React.useState(panelState.tabs);', 'const [tabs, setTabs] = React.useState([{ name: "script.rpy", content: "label start:\\n    e \\"你好\\"\\n    jump next\\nlabel next:\\n    return\\n", dirty: false }]);')
  .replace('const [activeName, setActiveName] = React.useState(panelState.activeName);', 'const [activeName, setActiveName] = React.useState("script.rpy");');
let capturedL = null;
global.window.__ModuleLoader__.load = (m) => { capturedL = m.factory; };
require('vm').runInThisContext(srcLearn, { filename: 'client-learn.js' });
const modLearn = capturedL((id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); });
let regL = null;
const slotsL = { inject: (n, fn) => { regL = fn; }, register: (o, c) => ({ opts: o, comp: c }) };
modLearn.apply({ get: (n) => (n === 'slots' ? slotsL : undefined) });
const htmlLearn = renderToString(regL().comp({ sessionId: 's14', inputActions: undefined }));
console.log('学习批量: 工具栏📖', htmlLearn.indexOf('学习注释') >= 0 || htmlLearn.indexOf('学习') >= 0, '| 无解释条残留', htmlLearn.indexOf('行下解释条') < 0 && htmlLearn.indexOf('点击解释条') < 0, '| 无 learnMode 开关文案', htmlLearn.indexOf('学习模式：代码行下显示教学解释') < 0);

// 学习注释批量确认弹窗（消耗 AI 资源需确认；targets 数组 + scopeLabel）
const srcConfirm = srcWithData
  .replace('const [learnConfirm, setLearnConfirm] = React.useState(null);', 'const [learnConfirm, setLearnConfirm] = React.useState({ targets: [{ line: 2, skill: "renpy-text", code: "e \\"你好\\"" }, { line: 3, skill: "renpy-core", code: "jump next" }], scopeLabel: "整个文件" });')
  .replace('const [tabs, setTabs] = React.useState(panelState.tabs);', 'const [tabs, setTabs] = React.useState([{ name: "script.rpy", content: "label start:\\n    e \\"你好\\"\\n    jump next\\n    return\\n", dirty: false }]);')
  .replace('const [activeName, setActiveName] = React.useState(panelState.activeName);', 'const [activeName, setActiveName] = React.useState("script.rpy");');
let capturedC = null;
global.window.__ModuleLoader__.load = (m) => { capturedC = m.factory; };
require('vm').runInThisContext(srcConfirm, { filename: 'client-confirm.js' });
const modConfirm = capturedC((id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); });
let regC = null;
const slotsC = { inject: (n, fn) => { regC = fn; }, register: (o, c) => ({ opts: o, comp: c }) };
modConfirm.apply({ get: (n) => (n === 'slots' ? slotsC : undefined) });
const htmlConfirm = renderToString(regC().comp({ sessionId: 's16', inputActions: undefined }));
console.log('学习确认: 批量弹窗', htmlConfirm.indexOf('批量生成 AI 学习注释') >= 0, '| 范围', htmlConfirm.indexOf('整个文件') >= 0 || htmlConfirm.indexOf('工作区域') >= 0, '| 行数', htmlConfirm.indexOf('2 条语句') >= 0, '| 消耗提示', htmlConfirm.indexOf('消耗 token') >= 0, '| 确认按钮', htmlConfirm.indexOf('确认生成') >= 0, '| 取消按钮', htmlConfirm.indexOf('取消') >= 0);

// 学习教学标签（teach:）只读 markdown 渲染分支
const srcTeach = srcWithData
  .replace('const [tabs, setTabs] = React.useState(panelState.tabs);', 'const [tabs, setTabs] = React.useState([{ name: "teach:script.rpy:2", content: "**标题**\\n- 列表项\\n\\n```rpy\\nlabel start:\\n```\\n", dirty: false, teach: true }]);')
  .replace('const [activeName, setActiveName] = React.useState(panelState.activeName);', 'const [activeName, setActiveName] = React.useState("teach:script.rpy:2");');
let capturedT = null;
global.window.__ModuleLoader__.load = (m) => { capturedT = m.factory; };
require('vm').runInThisContext(srcTeach, { filename: 'client-teach.js' });
const modTeach = capturedT((id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); });
let regT = null;
const slotsT = { inject: (n, fn) => { regT = fn; }, register: (o, c) => ({ opts: o, comp: c }) };
modTeach.apply({ get: (n) => (n === 'slots' ? slotsT : undefined) });
const htmlTeach = renderToString(regT().comp({ sessionId: 's15', inputActions: undefined }));
console.log('teach 标签: markdown 粗体', htmlTeach.indexOf('<strong>') >= 0 || htmlTeach.indexOf('<b>') >= 0, '| 列表', htmlTeach.indexOf('•') >= 0, '| 代码块', htmlTeach.indexOf('markdown-code-block') >= 0, '| 无 textarea', htmlTeach.indexOf('<textarea') < 0, '| 无 overlay', htmlTeach.indexOf('indentGuides') < 0);

// 报错诊断面板（ErrWindow）：右侧栏加入 err 面板 + 注入结构化报错数据
const srcErr = srcWithData
  .replace('const LAYOUT_DEFAULT = { left: { panels: ["files", "nav", "assets", "edits"] }, right: { panels: ["chat"] }, bottom: { panels: ["log"] } };',
    'const LAYOUT_DEFAULT = { left: { panels: ["files", "nav", "assets", "edits"] }, right: { panels: ["chat", "err"] }, bottom: { panels: ["log"] } };')
  .replace('const [data, setData] = React.useState(null);',
    'const [data, setData] = React.useState({ files: { traceback: true, errors: true, log: true }, traceback: { exception: { type: "ZeroDivisionError", message: "division by zero" }, rootFrame: { file: "game/script.rpy", line: 20, source: "x = 1 / 0" }, whileRunning: { file: "game/script.rpy", line: 21 }, frames: [ { file: "game/script.rpy", line: 21 }, { file: "renpy/ast.py", line: 1726 } ], version: "8.5.3.26051504" }, errors: { errors: [ { message: "label start 定义两次", file: "game/script.rpy", line: 5 } ] }, log: { errors: [ { kind: "Exception", message: "config 变量不存在", frames: [] } ] } });');
let capturedE = null;
global.window.__ModuleLoader__.load = (m) => { capturedE = m.factory; };
require('vm').runInThisContext(srcErr, { filename: 'client-err.js' });
const modErr = capturedE((id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); });
let regE = null;
const slotsE = { inject: (n, fn) => { regE = fn; }, register: (o, c) => ({ opts: o, comp: c }) };
modErr.apply({ get: (n) => (n === 'slots' ? slotsE : undefined) });
const htmlErr = renderToString(regE().comp({ sessionId: 's17', inputActions: undefined }));
console.log('报错面板: 标题', htmlErr.indexOf('报错诊断') >= 0, '| 崩溃', htmlErr.indexOf('崩溃 traceback') >= 0, '| 异常类型', htmlErr.indexOf('ZeroDivisionError') >= 0, '| 根因', htmlErr.indexOf('根因') >= 0, '| lint 错误', htmlErr.indexOf('lint 错误 1 条') >= 0, '| log 内嵌', htmlErr.indexOf('log 内嵌错误 1 段') >= 0, '| 空状态无残留', htmlErr.indexOf('暂无报错文件') < 0);
console.log('报错面板: 文件计数', htmlErr.indexOf('3/3 文件') >= 0, '| 刷新按钮', htmlErr.indexOf('重新读取报错文件') >= 0, '| 活动栏入口', htmlErr.indexOf('报错诊断面板') >= 0);

// 静态诊断面板（DiagWindow）：右侧栏加入 diag 面板 + 注入诊断数据
const srcDiag = srcWithData
  .replace('const LAYOUT_DEFAULT = { left: { panels: ["files", "nav", "assets", "edits"] }, right: { panels: ["chat"] }, bottom: { panels: ["log"] } };',
    'const LAYOUT_DEFAULT = { left: { panels: ["files", "nav", "assets", "edits"] }, right: { panels: ["chat", "diag"] }, bottom: { panels: ["log"] } };')
  .replace('const [data, setData] = React.useState(null);\n\t\t\tconst [busy, setBusy] = React.useState(false);\n\t\t\tconst load = React.useCallback(() => {\n\t\t\t\tif (!project) return;\n\t\t\t\tsetBusy(true);\n\t\t\t\tapi("diagnostics", {}, { project })',
    'const [data, setData] = React.useState({ files: 2, items: [ { kind: "invalid_jump", level: "error", file: "game/script.rpy", line: 9, target: "missing_label", msg: "jump 目标 label 未定义" }, { kind: "missing_asset", level: "warn", file: "game/script.rpy", line: 12, target: "bg castle", msg: "图像未定义且 images/ 无同名文件" } ] });\n\t\t\tconst [busy, setBusy] = React.useState(false);\n\t\t\tconst load = React.useCallback(() => {\n\t\t\t\tif (!project) return;\n\t\t\t\tsetBusy(true);\n\t\t\t\tapi("diagnostics", {}, { project })');
let capturedD = null;
global.window.__ModuleLoader__.load = (m) => { capturedD = m.factory; };
require('vm').runInThisContext(srcDiag, { filename: 'client-diag.js' });
const modDiag = capturedD((id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); });
let regD = null;
const slotsD = { inject: (n, fn) => { regD = fn; }, register: (o, c) => ({ opts: o, comp: c }) };
modDiag.apply({ get: (n) => (n === 'slots' ? slotsD : undefined) });
const htmlDiag = renderToString(regD().comp({ sessionId: 's18', inputActions: undefined }));
console.log('诊断面板: 标题', htmlDiag.indexOf('静态诊断') >= 0, '| 无效跳转', htmlDiag.indexOf('无效跳转') >= 0, '| 缺失资源', htmlDiag.indexOf('缺失资源') >= 0, '| 错误计数', htmlDiag.indexOf('错误 1') >= 0, '| 警告计数', htmlDiag.indexOf('警告 1') >= 0, '| 跳转目标', htmlDiag.indexOf('missing_label') >= 0, '| 空状态无残留', htmlDiag.indexOf('无诊断问题') < 0);
console.log('诊断面板: 扫描文件数', htmlDiag.indexOf('扫描 2 个文件') >= 0, '| 活动栏入口', htmlDiag.indexOf('静态诊断面板') >= 0);

// 写守卫确认弹层（guardPrompt：保存被守卫拦截 → 强制/取消）
const srcGuard = srcWithData
  .replace('const [guardPrompt, setGuardPrompt] = React.useState(null); // { errors: [{line,kind,msg}] }',
    'const [guardPrompt, setGuardPrompt] = React.useState({ errors: [ { line: 2, kind: "indent", msg: "label 块内语句未缩进" }, { line: 5, kind: "label_dup", msg: "label 重名" } ] });');
let capturedG2 = null;
global.window.__ModuleLoader__.load = (m) => { capturedG2 = m.factory; };
require('vm').runInThisContext(srcGuard, { filename: 'client-guard.js' });
const modGuard = capturedG2((id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); });
let regG2 = null;
const slotsG2 = { inject: (n, fn) => { regG2 = fn; }, register: (o, c) => ({ opts: o, comp: c }) };
modGuard.apply({ get: (n) => (n === 'slots' ? slotsG2 : undefined) });
const htmlGuard = renderToString(regG2().comp({ sessionId: 's19', inputActions: undefined }));
console.log('守卫弹层: 标题', htmlGuard.indexOf('写守卫拦截了保存') >= 0, '| 错误数', htmlGuard.indexOf('2 个确定问题') >= 0, '| 错误行', htmlGuard.indexOf('L2 [indent]') >= 0, '| 强制按钮', htmlGuard.indexOf('仍要保存（强制）') >= 0, '| 取消按钮', htmlGuard.indexOf('取消（先修正）') >= 0);

// 个性化设置面板（⚙ SettingsWindow）+ 编辑器应用（字号 16 + relative 行号）
const srcSettings = srcWithData
  .replace('const LAYOUT_DEFAULT = { left: { panels: ["files", "nav", "assets", "edits"] }, right: { panels: ["chat"] }, bottom: { panels: ["log"] } };',
    'const LAYOUT_DEFAULT = { left: { panels: ["files", "nav", "assets", "edits"] }, right: { panels: ["chat", "settings"] }, bottom: { panels: ["log"] } };')
  .replace('const [settings, setSettings] = React.useState({ global: {}, project: {}, merged: {} });',
    'const [settings, setSettings] = React.useState({ global: { "editor.fontSize": 16 }, project: {}, merged: { "editor.fontSize": 16, "editor.lineNumbers": "relative" } });')
  .replace('const [tabs, setTabs] = React.useState(panelState.tabs);',
    'const [tabs, setTabs] = React.useState([{ name: "script.rpy", content: "label start:\\n    e \\"hi\\"\\n", dirty: false }]);')
  .replace('const [activeName, setActiveName] = React.useState(panelState.activeName);',
    'const [activeName, setActiveName] = React.useState("script.rpy");')
  .replace('const [maximized, setMaximized] = React.useState(panelState.maximized || null); // panelId | null',
    'const [maximized, setMaximized] = React.useState("settings"); // panelId | null');
let capturedS = null;
global.window.__ModuleLoader__.load = (m) => { capturedS = m.factory; };
require('vm').runInThisContext(srcSettings, { filename: 'client-settings.js' });
const modSettings = capturedS((id) => { if (id === 'react') return react; if (id === 'react-dom') return reactDOM; throw new Error('unexpected require: ' + id); });
let regS = null;
const slotsS = { inject: (n, fn) => { regS = fn; }, register: (o, c) => ({ opts: o, comp: c }) };
modSettings.apply({ get: (n) => (n === 'slots' ? slotsS : undefined) });
const htmlSettings = renderToString(regS().comp({ sessionId: 's20', inputActions: undefined }));
console.log('设置面板: 标题', htmlSettings.indexOf('个性化设置') >= 0, '| 搜索', htmlSettings.indexOf('搜索设置') >= 0, '| 分组', htmlSettings.indexOf('字体') >= 0 && htmlSettings.indexOf('缩进') >= 0 && htmlSettings.indexOf('显示') >= 0, '| 全局/项目切换', htmlSettings.indexOf('全局（所有项目）') >= 0, '| 重置按钮', htmlSettings.indexOf('↺') >= 0);
console.log('设置面板: 字号控件值 16', htmlSettings.indexOf('value="16"') >= 0, '| 已修改标注', htmlSettings.indexOf('已修改') >= 0, '| 默认标注', htmlSettings.indexOf('默认') >= 0, '| 底部 VSCode 说明', htmlSettings.indexOf('VSCode') >= 0);
console.log('设置应用: gutter 字号 16px', htmlSettings.indexOf('font-size:16px') >= 0, '| 活动栏入口', htmlSettings.indexOf('个性化设置（最大化视图') >= 0);
console.log('设置最大化: 全屏覆盖层', htmlSettings.indexOf('✕ 关闭') >= 0, '| 三列分组卡片', htmlSettings.indexOf('min-width:320px') >= 0, '| 宽松控件高 28', htmlSettings.indexOf('height:28px') >= 0);

// 渲染 hideSidebar 变体
const el2 = comp({ sessionId: 's2', inputActions: undefined, hideSidebar: true });
const html2 = renderToString(el2);
console.log('hideSidebar variant OK:', html2.length > 0);
console.log('SMOKE PASS');
