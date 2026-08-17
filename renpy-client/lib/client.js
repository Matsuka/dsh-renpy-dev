// Ren'Py 开发模式 — 正式客户端 bundle v3（web profile）
// 多文件标签页（脏标记）、lint 错误跳转、原生叠加编辑器（行号+高亮）、模块级状态持久化。
window.__ModuleLoader__.load({
	id: "dsh-renpy-dev-client",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		const React = react;
		let react_dom = require("react-dom");
		const ReactDOM = react_dom;

		const name = "dsh-renpy-dev-client";
		const inject = [];

		// 模块级状态：切走/切回页签不丢（组件卸载时同步写回）。
		const panelState = { project: "", tabs: [], activeName: null, labels: [], files: [], routeWin: { open: false, x: 140, y: 90, w: 780, h: 520 }, shotWin: { open: false, x: 160, y: 100, w: 520, h: 420 }, varWin: { open: false, x: 180, y: 110, w: 460, h: 420 } };

		// 资源文件夹树：把分类下扁平 rel 路径构建为 {dirs, files} 树。
		// host 的 rel 是相对 game/ 的完整路径（含分类目录前缀，如 "audio/bgm/theme.ogg"），
		// 剥掉第一个前缀段后按子目录树展示。
		const buildAssetTree = (items) => {
			const root = { dirs: {}, files: [] };
			for (const it of items || []) {
				const parts = String(it.rel).split("/").filter(Boolean).slice(1);
				let node = root;
				for (let i = 0; i < parts.length - 1; i++) node = node.dirs[parts[i]] || (node.dirs[parts[i]] = { dirs: {}, files: [] });
				node.files.push(it);
			}
			return root;
		};
		const countFiles = (node) => (node ? node.files.length + Object.keys(node.dirs || {}).reduce((n, k) => n + countFiles(node.dirs[k]), 0) : 0);

		// 文件目录树（game/ 下 .rpy 相对路径 → {dirs, files} 树；files 存完整 rel，显示 basename）
		const buildFileTree = (items) => {
			const root = { dirs: {}, files: [] };
			for (const rel of items || []) {
				const parts = String(rel).split("/").filter(Boolean);
				if (!parts.length) continue;
				let node = root;
				for (let i = 0; i < parts.length - 1; i++) node = node.dirs[parts[i]] || (node.dirs[parts[i]] = { dirs: {}, files: [] });
				node.files.push(parts.join("/"));
			}
			return root;
		};

		// ── Ren'Py 语句 → Python 等价（引擎源码核验的映射，见 PLAN §21） ──
		const renpyToPython = (line) => {
			const L = String(line || "").trim();
			if (!L) return null;
			let m
			m = /^([A-Za-z_][\w.]*)\s+"((?:[^"\\]|\\.)*)"/.exec(L)
			if (m) return { py: m[1] + "(" + JSON.stringify(m[2]) + ")", note: "Character 调用 → renpy.say(" + m[1] + ", …)" }
			m = /^"((?:[^"\\]|\\.)*)"/.exec(L)
			if (m) return { py: 'renpy.say(None, ' + JSON.stringify(m[1]) + ')', note: "无角色旁白 → renpy.say(None, …)" }
			m = /^jump\s+(.+)$/.exec(L)
			if (m) return { py: 'renpy.jump("' + m[1] + '")', note: "无条件跳转（不返回）" }
			m = /^call\s+(\w+)(.*)$/.exec(L)
			if (m) { const args = m[2].trim().replace(/^\((.*)\)$/, "$1").trim(); return { py: "renpy.call(" + JSON.stringify(m[1]) + (args ? ", " + args : "") + ")", note: "压栈调用，return 回到 call 处" } }
			m = /^return(?:\s+(.+))?$/.exec(L)
			if (m) return { py: m[1] ? "renpy.return_(" + m[1] + ")" : "renpy.return_()", note: "弹栈返回" }
			m = /^scene\s+(.+)$/.exec(L)
			if (m) return { py: 'renpy.scene(); renpy.show("' + m[1] + '")', note: "清空当前层再显示" }
			m = /^show\s+(.+?)(?:\s+at\s+(.+))?$/.exec(L)
			if (m) return { py: 'renpy.show("' + m[1] + '"' + (m[2] ? ", at_list=[" + m[2] + "]" : "") + ")", note: "显示图像（tag 替换同名）" }
			m = /^hide\s+(.+)$/.exec(L)
			if (m) return { py: 'renpy.hide("' + m[1] + '")', note: "隐藏图像" }
			m = /^with\s+(.+)$/.exec(L)
			if (m) return { py: "renpy.with_statement(" + m[1] + ")", note: "应用过渡" }
			if (/^(define|default|image)\s/.test(L)) return { py: L.replace(/^(define|default|image)\s+/, ""), note: /^define/.test(L) ? "init 阶段赋值（常量）" : /^default/.test(L) ? "init 阶段默认值（可存档覆盖）" : "注册图像 → renpy.image(...)" }
			if (/^(if|elif|else|while|for)\b/.test(L)) return { py: L, note: "条件/循环本身是 Python" }
			if (/^\$/.test(L)) return { py: L.slice(1).trim(), note: "$ = 单行 Python" }
			if (/^menu\s*:/.test(L)) return { py: "renpy.menu([('选项', '值'), …])", note: "选择菜单（展示 + 交互）" }
			return null
		};

		// ── 学习用途自动注释：逐行生成教学解释（基于语句识别 + skill 知识点；纯函数可单测） ──
		// 输入整段代码，输出 [{line, code, note, kind}]——kind: stmt/text/label/control/comment/blank
		const renpyLearnNotes = (src) => {
			const lines = String(src || "").split("\n");
			const out = [];
			// 语句 → 官方文档页+锚点（SDK doc/ 本地 HTML）与 skill 节（学习深挖跳转）
			const DOC = {
				label: { doc: "label.html", skill: "renpy-core · 语句速查" },
				say: { doc: "dialogue.html", skill: "renpy-text · say 语句变体" },
				menu: { doc: "menus.html", skill: "renpy-core · menu" },
				jump: { doc: "label.html", skill: "renpy-core · 语句速查" },
				call: { doc: "label.html", skill: "renpy-core · call" },
				return: { doc: "label.html", skill: "renpy-core · return" },
				scene: { doc: "displaying_images.html", skill: "renpy-core · scene/show" },
				show: { doc: "displaying_images.html", skill: "renpy-core · scene/show" },
				hide: { doc: "displaying_images.html", skill: "renpy-core · hide" },
				with: { doc: "transitions.html", skill: "renpy-transitions · 用法" },
				define: { doc: "python_statements.html", skill: "renpy-core · define/default" },
				default: { doc: "python_statements.html", skill: "renpy-core · define/default" },
				image: { doc: "displaying_images.html", skill: "renpy-core · image" },
				transform: { doc: "transforms.html", skill: "renpy-atl · transform 定义" },
				screen: { doc: "screens.html", skill: "renpy-screen · screen 定义" },
				python: { doc: "python_statements.html", skill: "renpy-core · python" },
				dollar: { doc: "python_statements.html", skill: "renpy-core · $ 行" },
				if: { doc: "conditional_statements.html", skill: "renpy-core · if" },
				play: { doc: "audio.html", skill: "renpy-api · 音频" },
				pause: { doc: "audio.html", skill: "renpy-core · pause" },
				window: { doc: "dialogue.html", skill: "renpy-text · 对话窗口" },
				layeredimage: { doc: "layeredimage.html", skill: "renpy-layeredimage · 语句速查" },
				translate: { doc: "translation.html", skill: "renpy-l10n · translate 全族" },
				init: { doc: "python_statements.html", skill: "renpy-core · init" },
				comment: { doc: "language_basics.html", skill: "renpy-core · 注释" },
			};
			const sayNote = (who, what) => {
				if (who) return "角色对话：" + who + " 说出这段话（等待玩家点击继续——Ren'Py 的交互点）";
				return "旁白：无角色叙述（显示在对话窗口）";
			};
			for (let i = 0; i < lines.length; i++) {
				const raw = lines[i];
				const line = raw.trim();
				if (!line) { out.push({ line: i + 1, code: raw, note: "", kind: "blank" }); continue; }
				if (/^#/.test(line)) { out.push({ line: i + 1, code: raw, note: "注释：不执行，给人看的说明", kind: "comment", doc: DOC.comment.doc, skill: DOC.comment.skill }); continue; }
				let note = "", kind = "stmt", ref = null;
				// 语句识别（renpy-core 映射 + skill 知识点）
				let m;
				if (/^"[^"]*"\s*:\s*$/.test(line)) { note = "菜单选项「" + line.replace(/^"|":\s*$/g, "") + "」：玩家点击后进入该分支"; ref = DOC.menu; }
				else if ((m = /^label\s+([\w.]+)\s*:/.exec(line))) { note = "标签「" + m[1] + "」：跳转目标，不是函数——顺序执行到此处可被 jump/call 进入；label 全局唯一"; kind = "label"; ref = DOC.label; }
				else if ((m = /^([A-Za-z_][\w.]*)\s+"((?:[^"\\]|\\.)*)"/.exec(line))) { note = sayNote(m[1], m[2]); ref = DOC.say; }
				else if ((m = /^"((?:[^"\\]|\\.)*)"/.exec(line))) { note = sayNote(null, m[1]); ref = DOC.say; }
				else if (/^menu\s*:/.test(line)) { note = "选择菜单：显示选项并暂停，玩家选择后按 jump 分支（交互点）"; ref = DOC.menu; }
				else if ((m = /^jump\s+(.+)$/.exec(line))) { note = "无条件跳转到「" + m[1] + "」——不返回（不是函数调用）"; ref = DOC.jump; }
				else if ((m = /^call\s+(\w+)/.exec(line))) { note = "调用标签「" + m[1] + "」：压栈，被调处的 return 回到这里"; ref = DOC.call; }
				else if (/^return\b/.test(line)) { note = "返回：弹出调用栈（call 的配套；顶层 return 结束游戏）"; ref = DOC.return; }
				else if ((m = /^scene\s+(.+)$/.exec(line))) { note = "场景「" + m[1] + "」：清空当前层再显示（换背景）"; ref = DOC.scene; }
				else if ((m = /^show\s+(\S+)/.exec(line))) { note = "显示图像「" + m[1] + "」：同名 tag 替换；at 变换可加位置"; ref = DOC.show; }
				else if ((m = /^hide\s+(.+)$/.exec(line))) { note = "隐藏图像「" + m[1] + "」"; ref = DOC.hide; }
				else if ((m = /^with\s+(.+)$/.exec(line))) { note = "应用转场「" + m[1] + "」：过渡上一次 scene/show 的变化"; ref = DOC.with; }
				else if (/^define\s/.test(line)) { note = "define：init 阶段定义常量（游戏启动时执行一次）"; ref = DOC.define; }
				else if (/^default\s/.test(line)) { note = "default：init 阶段定义变量默认值（可被存档覆盖，玩家进度）"; ref = DOC.default; }
				else if (/^image\s/.test(line)) { note = "image：注册图像名 → 文件（show 时用名字引用）"; ref = DOC.image; }
				else if (/^transform\s/.test(line)) { note = "transform：定义 ATL 变换（位置/动画规则，show at 时应用）"; ref = DOC.transform; }
				else if (/^screen\s/.test(line)) { note = "screen：定义界面（声明式，每次交互重算渲染）"; ref = DOC.screen; }
				else if (/^python\s*:/.test(line)) { note = "python 块：整块 Python 代码"; ref = DOC.python; }
				else if (/^\$/.test(line)) { note = "$ 行：单行 Python"; ref = DOC.dollar; }
				else if (/^(if|elif|else|while|for)\b/.test(line)) { note = "条件/循环：本身就是 Python 语法"; ref = DOC.if; }
				else if ((m = /^play\s+(music|sound|voice)/.exec(line))) { note = "播放音频（" + m[1] + " 通道：背景乐/音效/语音）"; ref = DOC.play; }
				else if (/^pause\b/.test(line)) { note = "暂停等待（0/省略 = 等点击）"; ref = DOC.pause; }
				else if (/^window\b/.test(line)) { note = "对话窗口管理（show/hide/auto）"; ref = DOC.window; }
				else if (/^layeredimage\s/.test(line)) { note = "layeredimage：分层立绘定义（部件组合差分）"; ref = DOC.layeredimage; }
				else if (/^translate\s/.test(line)) { note = "translate：翻译块（覆盖源文本，查表生效）"; ref = DOC.translate; }
				else if (/^init\b/.test(line)) { note = "init：初始化阶段块（优先级数字控制顺序）"; ref = DOC.init; }
				else { note = "其他语句/表达式"; kind = "other"; }
				// 缩进提示（学习用途）
				if (/^\t|^    /.test(raw) && kind === "stmt" && note) note += "；缩进 = 属于上方块（Ren'Py 对缩进敏感）";
				out.push({ line: i + 1, code: raw, note, kind, doc: ref ? ref.doc : null, skill: ref ? ref.skill : null });
			}
			return out;
		};

		// ── 学习注释写入/清除（真正的注释：插入 # 📖 学习: 标记块到代码行上方；纯函数，可单测） ──
		// 标记行：# 📖 学习: renpy-core · 语句速查（L12）
		const LEARN_MARK = "# 📖 学习:";
		// 检测第 line 行上方是否已有教学注释块；返回注释块占用的行区间 [blockStart, blockEnd]（原文件行号），无则 null
		const findLearnBlock = (src, line) => {
			const lines = String(src).split("\n");
			if (line < 2 || line > lines.length) return null;
			let start = null;
			// 向上找标记行（从目标行上方第一行开始）：跳过中间的任何注释行，遇到非注释行/空行才停
			for (let i = line - 2; i >= 0; i--) {
				const t = lines[i].trim();
				if (t.indexOf(LEARN_MARK) === 0) { start = i; break; }
				if (t === "" || t.charAt(0) !== "#") break;
			}
			if (start === null) return null;
			// 向下延伸到连续注释行（到目标行上方，不含目标行）
			let end = start;
			for (let i = start + 1; i < line - 1; i++) {
				const t = lines[i].trim();
				if (t === "" || t.charAt(0) !== "#") break;
				end = i;
			}
			return { start: start + 1, end: end + 1 }; // 转 1-based
		};
		// 将教学文本转成注释行数组（每行加 # 前缀；代码块行保持内容）
		const learnCommentLines = (text, skill, line) => {
			const head = LEARN_MARK + " " + skill + "（L" + line + "）";
			const body = String(text || "").split("\n").map((l) => {
				const t = l.replace(/\s+$/, "");
				if (!t.trim()) return "#";
				return "# " + t;
			});
			return [head].concat(body);
		};
		// 插入学习注释块到第 line 行上方，返回新 src（纯函数）
		const insertLearnComment = (src, line, text, skill) => {
			const lines = String(src).split("\n");
			const idx = Math.max(0, Math.min(line - 1, lines.length));
			const block = learnCommentLines(text, skill, line);
			return lines.slice(0, idx).concat(block, lines.slice(idx)).join("\n");
		};
		// 清除第 line 行上方的学习注释块，返回新 src（纯函数）；无块则原样返回
		const stripLearnComment = (src, line) => {
			const blk = findLearnBlock(src, line);
			if (!blk) return src;
			const lines = String(src).split("\n");
			return lines.slice(0, blk.start - 1).concat(lines.slice(blk.end)).join("\n");
		};

		// ── Ren'Py 文本样式预览解析器（renpy-text skill 知识实现） ──
		// 输入 say 语句行（e "…" / "旁白"），输出 {ok, who, nodes, notes}
		// nodes: {t:'text'|'interp'|'pause'|'nw'|'fast'|'done'|'clear'|'space'|'vspace'|'image'|'err', …}
		// notes: 降级提示 [{kind, msg}]——预览无法真实模拟的部分必须有提示（用户要求）
		const renpyTextPreview = (line) => {
			// #rgb / #rgba / #rrggbb / #rrggbbaa → CSS 颜色
			const expandColor = (c) => {
				const m3 = /^#([0-9a-fA-F]{3})$/.exec(c);
				if (m3) return "#" + m3[1].split("").map(ch => ch + ch).join("");
				const m4 = /^#([0-9a-fA-F]{4})$/.exec(c);
				if (m4) return "rgba(" + [0, 1, 2].map(i => parseInt(m4[1][i] + m4[1][i], 16)).join(",") + "," + (parseInt(m4[1][3] + m4[1][3], 16) / 255).toFixed(3) + ")";
				const m6 = /^#([0-9a-fA-F]{6})$/.exec(c);
				if (m6) return "#" + m6[1];
				const m8 = /^#([0-9a-fA-F]{8})$/.exec(c);
				if (m8) return "rgba(" + [0, 2, 4].map(i => parseInt(m8[1].slice(i, i + 2), 16)).join(",") + "," + (parseInt(m8[1].slice(6, 8), 16) / 255).toFixed(3) + ")";
				return null;
			};
			// 解析 say 语句：角色 + 字符串（支持 r 前缀），返回 who/raw/rawFlag
			const m2 = /^([A-Za-z_][\w.]*)\s+(r?)"((?:[^"\\]|\\.)*)"/.exec(String(line || "").trim());
			let who = null, raw = "", isRaw = false;
			if (m2) { who = m2[1]; isRaw = !!m2[2]; raw = m2[3]; }
			else {
				const m1 = /^(r?)"((?:[^"\\]|\\.)*)"/.exec(String(line || "").trim());
				if (!m1) return null;
				isRaw = !!m1[1]; raw = m1[2];
			}
			// ① lexer 层（对齐 renpy/lexer.py string()）：空白折叠 → 转义展开（\{→{{、\[→[[、\%→%%、\n、\uXXXX、其余原样）
			let s = raw;
			if (!isRaw) {
				s = s.replace(/[ \n]+/g, " ");
				s = s.replace(/\\(u([0-9a-fA-F]{1,4})|.)/g, (mm, g1, g2) => {
					if (g1 === "{") return "{{";
					if (g1 === "[") return "[[";
					if (g1 === "%") return "%%";
					if (g1 === "n") return "\n";
					if (g1[0] === "u" && g2) return String.fromCharCode(parseInt(g2, 16));
					return g1;
				});
			}
			const notes = [];
			const note = (kind, msg) => { if (!notes.some(n => n.kind === kind && n.msg === msg)) notes.push({ kind, msg }); };
			const PAIR = ["b", "i", "u", "s", "plain", "color", "size", "font", "alpha", "k", "cps", "a", "rt", "rb", "art", "alt", "noalt", "outlinecolor", "vert", "horiz", "shader", "instance", ""];
			const SELF = ["w", "p", "nw", "fast", "done", "space", "vspace", "image", "clear"];
			// ②+③ 插值层（[expr]，[[ 转义）+ 标签层（{tag}，{{ 转义）单遍扫描，输出样式树
			const nodes = [];
			const stack = [{ tag: null, style: {} }];
			const cur = () => stack[stack.length - 1].style;
			let buf = "";
			const flush = () => { if (buf) { nodes.push({ t: "text", s: buf, style: cur() }); buf = ""; } };
			const push = (tag, patch) => stack.push({ tag, style: Object.assign({}, cur(), patch) });
			const close = (tag) => {
				let i = stack.length - 1;
				while (i > 0 && stack[i].tag !== tag) i--;
				if (i === 0) { note("mismatch", "关闭标签 {/" + tag + "} 没有对应的开标签"); return; }
				stack.length = i; // 弹出到匹配处（含自身）
			};
			const applyOpen = (tag, value) => {
				const st = cur();
				if (tag === "b") push("b", { bold: true });
				else if (tag === "i") push("i", { italic: true });
				else if (tag === "u") push("u", { underline: true });
				else if (tag === "s") push("s", { strikethrough: true });
				else if (tag === "plain") push("plain", { bold: false, italic: false, underline: false, strikethrough: false });
				else if (tag === "size") {
					let size = st.size !== undefined ? st.size : 22;
					if (/^[+-]/.test(value)) size = size + parseInt(value, 10);
					else if (/^\*/.test(value)) size = Math.round(size * parseFloat(value.slice(1)));
					else size = parseInt(value, 10);
					push("size", { size });
				}
				else if (tag === "color") { const css = expandColor(value); if (css) push("color", { color: css }); else note("color", "颜色 {color=" + value + "} 格式无效（需 #rgb/#rgba/#rrggbb/#rrggbbaa）"); }
				else if (tag === "alpha") {
					let a = st.alpha !== undefined ? st.alpha : 1;
					if (/^[+-]/.test(value)) a = a + parseFloat(value);
					else if (/^\*/.test(value)) a = a * parseFloat(value.slice(1));
					else a = parseFloat(value);
					push("alpha", { alpha: Math.max(0, Math.min(1, a)) });
				}
				else if (tag === "font") { push("font", { font: value }); note("font", "字体 {font=" + value + "} 需引擎加载，预览用默认字体"); }
				else if (tag === "k") push("k", { kerning: parseFloat(value) });
				else if (tag === "cps") {
					const base = st.cps !== undefined ? st.cps : 20;
					const cps = value[0] === "*" ? base * parseFloat(value.slice(1)) : parseFloat(value);
					push("cps", { cps });
					note("cps", "打字速度 {cps} 为时序效果——预览模式下点击该行可播放打字动画");
				}
				else if (tag === "a") push("a", { href: value });
				else if (tag === "rt" || tag === "art" || tag === "rb") { push(tag, { ruby: tag }); note("ruby", "注音标签 {" + tag + "} 需引擎 ruby 样式，预览标记显示"); }
				else if (tag === "alt") push("alt", { alt: true });
				else if (tag === "noalt") push("noalt", { noalt: true });
				else if (tag === "outlinecolor") note("outlinecolor", "描边 {outlinecolor} 预览不模拟（仅改现有描边色）");
				else if (tag === "vert" || tag === "horiz") note("vert", "竖排/横排切换 {" + tag + "} 预览不模拟");
				else if (tag === "shader") note("shader", "文本着色器 {shader} 预览不支持");
				else if (tag === "instance") push("instance", {});
				else if (tag === "") { push("=style", { styleName: value }); note("style", "样式 {=" + value + "} 需引擎样式表，预览仅标记"); }
				else if (tag.indexOf("feature:") === 0) note("feature", "OpenType 特性 {" + tag + "} 预览不支持");
				else if (tag.indexOf("axis:") === 0) push("axis", {});
				else if (tag[0] === "#") { /* 翻译消歧，忽略 */ }
				else if (PAIR.indexOf(tag) >= 0) push(tag, {});
				else { note("unknown", "未知文本标签 {" + tag + "}（渲染期会报错）"); nodes.push({ t: "err", s: "{" + tag + (value !== "" ? "=" + value : "") + "}", msg: "未知标签" }); }
			};
			const applySelf = (tag, value) => {
				if (tag === "w") nodes.push({ t: "pause", sec: value !== "" ? parseFloat(value) : null, kind: "w" });
				else if (tag === "p") nodes.push({ t: "pause", sec: value !== "" ? parseFloat(value) : null, kind: "p" });
				else if (tag === "nw") nodes.push({ t: "nw" });
				else if (tag === "fast") nodes.push({ t: "fast" });
				else if (tag === "done") nodes.push({ t: "done" });
				else if (tag === "clear") nodes.push({ t: "clear" });
				else if (tag === "space") nodes.push({ t: "space", n: parseFloat(value) || 0 });
				else if (tag === "vspace") nodes.push({ t: "vspace", n: parseFloat(value) || 0 });
				else if (tag === "image") { nodes.push({ t: "image", src: value }); note("image", "图片 {image=" + value + "} 需素材文件，预览用占位图标"); }
			};
			let pos = 0;
			while (pos < s.length) {
				const c = s[pos];
				if (c === "[") {
					if (s[pos + 1] === "[") { buf += "["; pos += 2; continue; } // [[ → 字面 [
					// 插值表达式：括号/引号/嵌套方括号计数（对齐 substitutions.parse）
					let j = pos + 1, parens = 0, brackets = 0, quote = null;
					for (; j < s.length; j++) {
						const cc = s[j];
						if (quote) { if (cc === "\\") { j++; continue; } if (cc === quote) quote = null; continue; }
						if (cc === '"' || cc === "'") quote = cc;
						else if (cc === "(") parens++;
						else if (cc === ")") { if (parens === 0) break; parens--; }
						else if (cc === "[") brackets++;
						else if (cc === "]") { if (brackets === 0) break; brackets--; }
					}
					const expr = s.slice(pos + 1, j);
					flush();
					nodes.push({ t: "interp", expr: expr, style: cur() });
					note("interp", "插值 [" + expr + "] 在运行时求值，预览显示占位");
					pos = j + 1;
					continue;
				}
				if (c === "{") {
					if (s[pos + 1] === "{") { buf += "{"; pos += 2; continue; } // {{ → 字面 {
					const end = s.indexOf("}", pos);
					if (end < 0) { buf += "{"; pos++; continue; }
					const inner = s.slice(pos + 1, end);
					const slash = inner[0] === "/";
					const content = slash ? inner.slice(1) : inner;
					const eq = content.indexOf("=");
					const tag = eq >= 0 ? content.slice(0, eq) : content;
					const value = eq >= 0 ? content.slice(eq + 1) : "";
					flush();
					if (slash) close(tag);
					else if (SELF.indexOf(tag) >= 0) applySelf(tag, value);
					else applyOpen(tag, value);
					pos = end + 1;
					continue;
				}
				buf += c;
				pos++;
			}
			flush();
			return { ok: true, who, nodes, notes };
		};

		// ── 项目文本速度配置解析（引擎源码核验：样式属性 slow_cps / slow_cps_multiplier；Character what_ 前缀参数） ──
		// 输入 [{name, content}]，输出 { charCps: {角色: {cps, mult, style}}, styleCps: {样式名: {cps, mult}}, globalCps }
		const parseTextCfg = (files) => {
			const charCps = {};
			const styleCps = {};
			for (const f of files) {
				const src = String(f.content || "");
				// define 角色 = Character(参数)
				const charRe = /define\s+([A-Za-z_][\w.]*)\s*=\s*Character\s*\(([\s\S]*?)\)/g;
				let m;
				while ((m = charRe.exec(src)) !== null) {
					const args = m[2];
					const arg = (k) => {
						const r = new RegExp("\\b" + k + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([0-9.]+))").exec(args);
						if (!r) return null;
						if (r[1] !== undefined) return r[1];
						if (r[2] !== undefined) return r[2];
						return r[3];
					};
					const cps = arg("what_slow_cps");
					const mult = arg("what_slow_cps_multiplier");
					const style = arg("what_style");
					if (cps !== null || mult !== null || style !== null) {
						charCps[m[1]] = { cps: cps !== null ? parseFloat(cps) : null, mult: mult !== null ? parseFloat(mult) : null, style };
					}
				}
				// 样式块：style 名字: ... slow_cps N / slow_cps_multiplier N（到空行/下一条语句/文件尾结束；属性需行首缩进，排除注释行）
				const styleRe = /style\s+([A-Za-z_][\w.]*)\s*:([\s\S]*?)(?=\n\s*\n|\n(?:style|define|init|label|image|default|transform)\s|$)/g;
				let sm;
				while ((sm = styleRe.exec(src)) !== null) {
					const block = sm[2];
					const cp = /^\s*slow_cps\s+(?:(\d+(?:\.\d+)?)|None|True)\s*$/m.exec(block);
					const mu = /^\s*slow_cps_multiplier\s+(\d+(?:\.\d+)?)\s*$/m.exec(block);
					if (cp || mu) styleCps[sm[1]] = { cps: cp && cp[1] ? parseFloat(cp[1]) : null, mult: mu ? parseFloat(mu[1]) : null };
				}
			}
			const say = styleCps["say_dialogue"];
			return { charCps, styleCps, globalCps: say && say.cps !== null ? say.cps * (say.mult || 1) : null };
		};

		// ── 自动缩进：回车后新行应带的前缀缩进（继承上一行；以 ":" 结尾的块开行 +4） ──
		const nextIndent = (line) => {
			let ind = /^[ \t]*/.exec(line)[0];
			if (/:\s*$/.test(line.trimEnd())) ind += "    ";
			return ind;
		};

		// ── 括号匹配：pos 处（或 pos-1）是括号则找配对，返回 {open, close} 字符位置；无配对 close/open 为 null ──
		const findMatchingBracket = (text, pos) => {
			const isB = (c) => c === "(" || c === ")" || c === "[" || c === "]" || c === "{" || c === "}";
			let p = -1;
			if (isB(text[pos])) p = pos;
			else if (isB(text[pos - 1])) p = pos - 1;
			else return null;
			const open = text[p];
			const close = { "(": ")", "[": "]", "{": "}", ")": "(", "]": "[", "}": "{" }[open];
			const isOpen = open === "(" || open === "[" || open === "{";
			let count = 1;
			if (isOpen) {
				for (let i = p + 1; i < text.length; i++) {
					const c = text[i];
					if (c === open) count++;
					else if (c === close) { count--; if (count === 0) return { open: p, close: i }; }
				}
				return { open: p, close: null };
			}
			for (let i = p - 1; i >= 0; i--) {
				const c = text[i];
				if (c === open) count++; // 同类闭括号（嵌套更深）
				else if (c === close) { count--; if (count === 0) return { open: i, close: p }; }
			}
			return { open: null, close: p };
		};

		// ── 匹配括号跳转目标：光标在开括号处 → 返回闭括号位置+1；否则返回开括号位置+1 ──
		const bracketJumpTarget = (bm, pos) => {
			if (!bm) return null;
			const atOpen = bm.open !== null && (pos - 1 === bm.open || pos === bm.open);
			const t = atOpen ? bm.close : bm.open;
			return t !== null ? t + 1 : null;
		};

		// ── GUI 定制：解析/改写 gui.rpy（renpy-gui skill 知识；纯函数可单测） ──
		// 解析：gui.init(W, H) + define gui.xxx = value → { width, height, vars: {name: value} }
		const parseGuiVars = (content) => {
			const src = String(content || "");
			const out = { width: null, height: null, vars: {} };
			const m = /gui\.init\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(src);
			if (m) { out.width = parseInt(m[1], 10); out.height = parseInt(m[2], 10); }
			const re = /^\s*define\s+(gui\.\w+)\s*=\s*(.+?)\s*$/gm;
			let x;
			while ((x = re.exec(src)) !== null) out.vars[x[1]] = x[2].replace(/^"(.*)"$/, "$1").replace(/'/g, "").trim();
			return out;
		};
		// 应用修改：替换 gui.init 参数 + define 行（不存在则追加到文件尾）
		const applyGuiChanges = (content, changes) => {
			let src = String(content || "");
			const { width, height, vars } = changes || {};
			if (width || height) {
				src = src.replace(/gui\.init\s*\(\s*\d+\s*,\s*\d+\s*\)/, "gui.init(" + width + ", " + height + ")");
			}
			const add = [];
			for (const [name, value] of Object.entries(vars || {})) {
				const re = new RegExp("^\\s*define\\s+" + name.replace(/\./g, "\\.") + "\\s*=\\s*[^\\n]*$", "m");
				if (re.test(src)) src = src.replace(re, "define " + name + " = " + value);
				else add.push("define " + name + " = " + value);
			}
			if (add.length) src = src.replace(/\s*$/, "") + "\n\n# GUI 定制面板追加\n" + add.join("\n") + "\n";
			return src;
		};
		// GUI 变量清单（补全用，renpy-gui skill 高频项）
		const GUI_VARS = ["accent_color", "idle_color", "idle_small_color", "hover_color", "selected_color", "insensitive_color", "interface_text_color", "text_color", "choice_button_text_idle_color", "choice_button_text_hover_color", "text_font", "interface_text_font", "system_font", "glyph_font", "text_size", "name_text_size", "interface_text_size", "label_text_size", "title_text_size", "notify_text_size"];

		// ── 原生对话机制复刻 ──
		// 轻量 Markdown → 受控 HTML（先整体转义，再插入白名单标签；代码块/粗体/斜体/行内代码/列表/引用/链接）
		const mdToHtml = (src) => {
			const escS = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
			const inline = (t) => {
				let s = escS(t);
				s = s.replace(/`([^`]+)`/g, '<code style="background:var(--dsw-alias-markdown-code-block);border-radius:4px;padding:1px 4px;font-family:var(--ds-font-family-code);font-size:11px;color:var(--dsw-alias-label-primary)">$1</code>');
				s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
				s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
				s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" style="color:var(--dsw-alias-brand-primary);text-decoration:underline">$1</a>');
				return s;
			};
			const CODEBLOCK = "background:var(--dsw-alias-markdown-code-block);border-radius:6px;padding:8px 10px;margin:6px 0;font-family:var(--ds-font-family-code);font-size:11px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary)";
			const ls = String(src).split("\n");
			const out = [];
			let inCode = false, buf = [];
			for (const l of ls) {
				if (/^```/.test(l)) {
					if (inCode) {
						out.push('<div style="' + CODEBLOCK + '">' + escS(buf.join("\n")) + "</div>");
						buf = [];
						inCode = false;
					} else inCode = true;
					continue;
				}
				if (inCode) { buf.push(l); continue; }
				if (/^\s*[-*]\s+/.test(l)) {
					out.push('<div style="padding-left:14px;text-indent:-14px;margin:2px 0">•&nbsp;' + inline(l.replace(/^\s*[-*]\s+/, "")) + "</div>");
					continue;
				}
				if (/^\s*>\s?/.test(l)) {
					out.push('<div style="border-left:3px solid var(--dsw-alias-border-l2);padding-left:8px;color:var(--dsw-alias-label-secondary);margin:4px 0">' + inline(l.replace(/^\s*>\s?/, "")) + "</div>");
					continue;
				}
				out.push("<div>" + inline(l) + "</div>");
			}
			if (inCode && buf.length) out.push('<div style="' + CODEBLOCK + '">' + escS(buf.join("\n")) + "</div>");
			return out.join("");
		};
		// 时钟：同日 HH:mm，跨日 M-D HH:mm（对齐原生 MessageIconActions）
		const fmtClock = (ts) => {
			if (!ts) return "";
			const d = new Date(ts);
			const p = (n) => (n < 10 ? "0" : "") + n;
			const now = new Date();
			const hm = p(d.getHours()) + ":" + p(d.getMinutes());
			const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
			return sameDay ? hm : (d.getMonth() + 1) + "-" + d.getDate() + " " + hm;
		};

		// 工作区域锁定判断：编辑"光标所在行"落在区域内即允许（区域内编辑产生的行位移随之扩展）（纯函数，可单测）
		const wsChangeInRange = (oldS, newS, startLine, endLine, cursorPos) => {
			let s = 0;
			const n = Math.min(oldS.length, newS.length);
			while (s < n && oldS[s] === newS[s]) s++;
			let e = 0;
			while (e < n - s && oldS[oldS.length - 1 - e] === newS[newS.length - 1 - e]) e++;
			if (s >= newS.length - e) return true; // 无变化
			const pos = cursorPos === undefined || cursorPos === null ? s : cursorPos;
			const cl = 1 + (newS.slice(0, pos).match(/\n/g) || []).length;
			return cl >= startLine && cl <= endLine;
		};

		// 行级 diff（与 host 同源实现）：返回 {hunks, added, removed}，用于"未保存修改"统计
		const lineDiff = (a, b) => {
			const n = a.length, m = b.length;
			let s = 0;
			while (s < n && s < m && a[s] === b[s]) s++;
			let e = 0;
			while (e < n - s && e < m - s && a[n - 1 - e] === b[m - 1 - e]) e++;
			const A = a.slice(s, n - e), B = b.slice(s, m - e);
			const ops = [];
			const ni = A.length, mi = B.length;
			if (ni > 0 || mi > 0) {
				if (ni * mi <= 2500000) {
					const W = mi + 1;
					const dp = new Uint32Array((ni + 1) * W);
					for (let i = ni - 1; i >= 0; i--) {
						for (let j = mi - 1; j >= 0; j--) {
							const idx = i * W + j;
							dp[idx] = A[i] === B[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
						}
					}
					let i = 0, j = 0;
					while (i < ni && j < mi) {
						if (A[i] === B[j]) { ops.push({ t: "eq" }); i++; j++; }
						else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) { ops.push({ t: "del" }); i++; }
						else { ops.push({ t: "add" }); j++; }
					}
					while (i < ni) { ops.push({ t: "del" }); i++; }
					while (j < mi) { ops.push({ t: "add" }); j++; }
				} else {
					for (let i = 0; i < ni; i++) ops.push({ t: "del" });
					for (let j = 0; j < mi; j++) ops.push({ t: "add" });
				}
			}
			let added = 0, removed = 0;
			for (const op of ops) { if (op.t === "add") added++; else if (op.t === "del") removed++; }
			return { added, removed };
		};

		// 路线图节点角色 → 颜色 / 中文标签（角色由分析器推断：start/choice/ending/dead_end/orphan/loop/scene）
		const ROLE_COLORS = {
			start: { fill: "#3a4a6a", stroke: "#6a9adf" },
			choice: { fill: "#3a2f4a", stroke: "#9a7adf" },
			ending: { fill: "#3a4a3a", stroke: "#6a9a6a" },
			dead_end: { fill: "#4a2f2f", stroke: "#d07a7a" },
			orphan: { fill: "#3a3a3a", stroke: "#8a8a8a" },
			loop: { fill: "#4a4430", stroke: "#c9b458" },
			scene: { fill: "#2f3a4a", stroke: "#5a6a8a" },
		};
		const ROLE_LABEL = { start: "起点", choice: "选择", ending: "结局", dead_end: "死路", orphan: "孤立", loop: "循环", scene: "场景" };

		// ── 路线图 Canvas 组件（状态机可视化 + 缩放平移 + 点击跳转） ──
		function RouteCanvas(props) {
			const { map, onNodeClick, currentId, focusNodes } = props;
			const canvasRef = React.useRef(null);
			const dragRef = React.useRef(null); // {sx, sy, ox, oy}
			const suppressClickRef = React.useRef(false); // 拖拽后抑制 click
			const [size, setSize] = React.useState({ w: 320, h: 480 });
			// 视图变换：scale 缩放倍数, ox/oy 平移偏移
			const [view, setView] = React.useState({ scale: 1, ox: 20, oy: 20 });
			const fitRef = React.useRef(null); // 已执行过 fit 的 layout（同一 layout 不重复 fit，保留用户手动缩放/平移）
			// 当前位置的联通区域（无向连通分量，含自身）——灰色描边 + 连线变色用
			const connSet = React.useMemo(() => {
				const set = new Set();
				if (!currentId || !map) return set;
				const adj = new Map();
				for (const t of map.transitions || []) {
					if (!t.from || !t.to) continue;
					if (!adj.has(t.from)) adj.set(t.from, []);
					adj.get(t.from).push(t.to);
					if (!adj.has(t.to)) adj.set(t.to, []);
					adj.get(t.to).push(t.from);
				}
				const q = [currentId];
				set.add(currentId);
				while (q.length) {
					const cur = q.shift();
					for (const nb of adj.get(cur) || []) {
						if (!set.has(nb)) { set.add(nb); q.push(nb); }
					}
				}
				return set;
			}, [map, currentId]);

			// 绘制（依赖 view/map/size 重绘）
			React.useEffect(() => {
				const cv = canvasRef.current;
				if (!cv) return;
				const parent = cv.parentElement;
				if (!parent) return;
				const w = parent.clientWidth || 320;
				const h = parent.clientHeight || 480;
				setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
				cv.width = w * 2;
				cv.height = h * 2;
				cv.style.width = w + "px";
				cv.style.height = h + "px";
				const ctx = cv.getContext("2d");
				ctx.setTransform(2, 0, 0, 2, 0, 0);
				ctx.clearRect(0, 0, w, h);
				ctx.fillStyle = props.BG;
				ctx.fillRect(0, 0, w, h);

				const { scale, ox, oy } = view;
				const layout = map.layout || { states: [], edges: [] };
				// 世界→屏幕：sx = x*scale + ox, sy = y*scale + oy
				const tx = (x) => x * scale + ox;
				const ty = (y) => y * scale + oy;
				const S = scale;

				// 节点（先画填充+边框；文字最后画，保证文字不被边线遮挡）
				const stateById = new Map((map.states || []).map((s) => [s.id, s]));
				for (const n of layout.states) {
					const st = stateById.get(n.id) || {};
					const role = st.role || "scene";
					const c = ROLE_COLORS[role] || ROLE_COLORS.scene;
					const isCur = currentId === n.id;             // 当前位置 → 黄色描边
					const isFocus = !!(focusNodes && focusNodes.has(n.id)); // 变量关联节点 → 紫色描边
					const isConn = connSet.has(n.id);            // 联通区域 → 灰色描边
					const x = tx(n.x), y = ty(n.y), ww = 120 * S, hh = 48 * S;
					ctx.fillStyle = c.fill;
					ctx.strokeStyle = isCur ? "#ffd75e" : (isFocus ? "#c586c0" : (isConn ? "#9a9a9a" : c.stroke));
					ctx.lineWidth = isCur ? 3.5 : (isFocus ? 2.6 : (isConn ? 2 : 1.5));
					roundRect(ctx, x, y, ww, hh, 8 * S);
					ctx.fill();
					ctx.stroke();
				}
				// 边（画在节点之上：线与箭头都不再被节点盖住；联通区域的边变亮蓝色；全线加粗）
				const edgeColor = (e) => (connSet.has(e.from) && connSet.has(e.to)) ? "rgba(96,165,250,.95)" : "rgba(150,150,150,.8)";
				for (const e of layout.edges) {
					ctx.strokeStyle = edgeColor(e);
					if (e.from === e.to) {
						const ln = layout.states.find((q) => q.id === e.from);
						if (!ln) continue;
						const lx = tx(ln.x), ly = ty(ln.y), lw = 120 * S, lh = 48 * S;
						ctx.lineWidth = 2.4;
						ctx.beginPath();
						ctx.arc(lx + lw + 16 * S, ly + lh / 2, 18 * S, 0, Math.PI * 2);
						ctx.stroke();
						continue;
					}
					const x1 = tx(e.x1), y1 = ty(e.y1), x2 = tx(e.x2), y2 = ty(e.y2);
					ctx.lineWidth = connSet.has(e.from) && connSet.has(e.to) ? 2.4 : 2;
					ctx.beginPath();
					ctx.moveTo(x1, y1);
					ctx.lineTo(x2, y2);
					ctx.stroke();
				}
				// 箭头（边线之上：普通箭头指向目标节点边界；自环箭头指向环的入口）
				for (const e of layout.edges) {
					ctx.fillStyle = edgeColor(e);
					let tipX, tipY, ang;
					if (e.from === e.to) {
						const ln = layout.states.find((q) => q.id === e.from);
						if (!ln) continue;
						const lx = tx(ln.x), ly = ty(ln.y), lw = 120 * S, lh = 48 * S;
						tipX = lx + lw - 2 * S; tipY = ly + lh / 2;
						ang = Math.PI;
					} else {
						tipX = tx(e.x2); tipY = ty(e.y2);
						ang = Math.atan2(tipY - ty(e.y1), tipX - tx(e.x1));
					}
					const AS = 11, AW = 6; // 箭头尺寸（屏幕坐标，不随缩放）
					ctx.beginPath();
					ctx.moveTo(tipX, tipY);
					ctx.lineTo(tipX - AS * Math.cos(ang) - AW * Math.sin(ang), tipY - AS * Math.sin(ang) + AW * Math.cos(ang));
					ctx.lineTo(tipX - AS * Math.cos(ang) + AW * Math.sin(ang), tipY - AS * Math.sin(ang) - AW * Math.cos(ang));
					ctx.closePath();
					ctx.fill();
				}
				// 文字（最后画：节点名+角色，永不被边线遮挡）
				for (const n of layout.states) {
					const st = stateById.get(n.id) || {};
					const role = st.role || "scene";
					const x = tx(n.x), y = ty(n.y), ww = 120 * S, hh = 48 * S;
					ctx.fillStyle = "#e8e8e8";
					ctx.font = Math.max(8, 12 * S) + "px sans-serif";
					ctx.textAlign = "center";
					ctx.fillText((st.name || n.name || "").slice(0, 14), x + ww / 2, y + hh * 0.4);
					ctx.font = Math.max(7, 10 * S) + "px sans-serif";
					ctx.fillStyle = "rgba(200,200,200,.7)";
					ctx.fillText(ROLE_LABEL[role] || role, x + ww / 2, y + hh * 0.75);
				}
			}, [view, map, props.BG, connSet, currentId, focusNodes]);

			// 启动/重载时自动缩放视野以露出全部元素（fit-to-view；同一 layout 只 fit 一次，保留用户手动缩放）
			React.useEffect(() => {
				const layout = map && map.layout;
				const cv = canvasRef.current;
				if (!layout || !cv) return;
				const parent = cv.parentElement;
				const W = (parent && parent.clientWidth) || 320;
				const H = (parent && parent.clientHeight) || 480;
				let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
				for (const n of layout.states) {
					minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
					maxX = Math.max(maxX, n.x + 120); maxY = Math.max(maxY, n.y + 48);
				}
				if (!isFinite(minX)) return;
				if (fitRef.current === layout) return;
				fitRef.current = layout;
				const pad = 50;
				const bw = Math.max(1, maxX - minX + pad * 2);
				const bh = Math.max(1, maxY - minY + pad * 2);
				const scale = Math.max(0.2, Math.min(3, Math.min(W / bw, H / bh)));
				const ox = (W - bw * scale) / 2 - minX * scale + pad * scale;
				const oy = (H - bh * scale) / 2 - minY * scale + pad * scale;
				setView({ scale, ox, oy });
			}, [map]);

			// 容器尺寸变化时重绘（弹出窗口拖拽缩放后画布跟随新尺寸）
			React.useEffect(() => {
				const cv = canvasRef.current;
				const parent = cv ? cv.parentElement : null;
				if (!parent) return;
				if (typeof ResizeObserver === "undefined") return;
				const ro = new ResizeObserver(() => setView((v) => ({ ...v }))); // 新对象触发绘制 effect 重测 parent 尺寸
				ro.observe(parent);
				return () => ro.disconnect();
			}, []);

			// 滚轮缩放（以鼠标为中心）
			const onWheel = (e) => {
				e.preventDefault();
				const cv = canvasRef.current;
				if (!cv) return;
				const rect = cv.getBoundingClientRect();
				const mx = e.clientX - rect.left, my = e.clientY - rect.top;
				const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
				setView((v) => {
					const ns = Math.min(3, Math.max(0.2, v.scale * factor));
					// 保持鼠标下的世界点不动：ox' = mx - (mx - ox) * ns / v.scale
					const k = ns / v.scale;
					return { scale: ns, ox: mx - (mx - v.ox) * k, oy: my - (my - v.oy) * k };
				});
			};

			// 拖拽平移（dragRef 记录起点；mouseup 时位移>5px 判定为拖拽，抑制 click）
			const onMouseDown = (e) => {
				dragRef.current = { sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy, moved: false };
				e.preventDefault();
			};
			const onMouseMove = (e) => {
				const d = dragRef.current;
				if (!d) return;
				const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
				if (Math.abs(dx) > 5 || Math.abs(dy) > 5) d.moved = true;
				setView((v) => ({ ...v, ox: d.ox + dx, oy: d.oy + dy }));
			};
			const onMouseUp = () => {
				const d = dragRef.current;
				if (d && d.moved) suppressClickRef.current = true;
				dragRef.current = null;
			};

			// 点击节点（应用视图变换反算；拖拽后不触发）
			const onCanvasClick = (e) => {
				if (suppressClickRef.current) { suppressClickRef.current = false; return; }
				if (dragRef.current) return;
				const cv = canvasRef.current;
				if (!cv) return;
				const rect = cv.getBoundingClientRect();
				const x = (e.clientX - rect.left - view.ox) / view.scale;
				const y = (e.clientY - rect.top - view.oy) / view.scale;
				const layout = map.layout || { states: [] };
				for (const n of layout.states) {
					if (x >= n.x && x <= n.x + 120 && y >= n.y && y <= n.y + 48) {
						onNodeClick && onNodeClick(n.id);
						return;
					}
				}
			};

			return React.createElement("canvas", {
				ref: canvasRef,
				onClick: onCanvasClick,
				onWheel: onWheel,
				onMouseDown: onMouseDown,
				onMouseMove: onMouseMove,
				onMouseUp: onMouseUp,
				onMouseLeave: onMouseUp,
				style: { display: "block", cursor: dragRef.current ? "grabbing" : "grab", touchAction: "none" },
			});
		}

		// ── 路线图弹出窗口（Portal 到 body：可拖可缩放，不受面板布局裁剪/祖先 transform 影响） ──
		function RouteWindow(props) {
			const { map, onNodeClick, currentId, focusNodes, win, onChange, onClose, TXT, TXT2, TXT3, ACCENT, BORDER, BG, GHOST, LAYER } = props;
			const dragRef = React.useRef(null);   // {sx, sy, ox, oy} 拖动
			const resizeRef = React.useRef(null); // {sx, sy, ow, oh} 缩放
			const [dragState, setDragState] = React.useState(null); // "move" | "resize" | null
			const winRef = React.useRef(win);
			winRef.current = win;

			const onBarDown = (e) => {
				e.preventDefault();
				dragRef.current = { sx: e.clientX, sy: e.clientY, ox: win.x, oy: win.y };
				setDragState("move");
			};
			const onResizeDown = (e) => {
				e.preventDefault();
				e.stopPropagation();
				resizeRef.current = { sx: e.clientX, sy: e.clientY, ow: win.w, oh: win.h };
				setDragState("resize");
			};
			// 窗口级 mousemove/mouseup：拖出窗口也能继续
			React.useEffect(() => {
				if (!dragState) return;
				const onMove = (e) => {
					const w = winRef.current;
					if (dragRef.current) {
						const d = dragRef.current;
						onChange({ ...w, x: Math.max(0, d.ox + e.clientX - d.sx), y: Math.max(0, d.oy + e.clientY - d.sy) });
					}
					if (resizeRef.current) {
						const r = resizeRef.current;
						onChange({ ...w, w: Math.max(360, r.ow + e.clientX - r.sx), h: Math.max(240, r.oh + e.clientY - r.sy) });
					}
				};
				const onUp = () => { dragRef.current = null; resizeRef.current = null; setDragState(null); };
				window.addEventListener("mousemove", onMove);
				window.addEventListener("mouseup", onUp);
				return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
			}, [dragState, onChange]);

			// Esc 关闭（焦点在输入框时不响应，避免误关弹窗）
			React.useEffect(() => {
				const onKey = (e) => {
					const t = e.target;
					if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
					if (e.key === "Escape") onClose();
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [onClose]);

			if (typeof document === "undefined" || !document.body) return null;
			const body = React.createElement("div", { style: { position: "fixed", left: win.x, top: win.y, width: win.w, height: win.h, zIndex: 10000, display: "flex", flexDirection: "column", background: BG, border: "1px solid " + BORDER, borderRadius: 10, boxShadow: "0 10px 40px rgba(0,0,0,.4)", overflow: "hidden", minWidth: 360, minHeight: 240 } },
				React.createElement("div", { onMouseDown: onBarDown, style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: LAYER, borderBottom: "1px solid " + BORDER, cursor: dragState === "move" ? "grabbing" : "grab", userSelect: "none", flexShrink: 0 } },
					React.createElement("span", { style: { fontSize: 13, fontWeight: 600, color: TXT } }, "🗺 路线图"),
					React.createElement("span", { style: { fontSize: 11, color: TXT2 } }, map ? ((map.states || []).length) + " 状态 / " + ((map.transitions || []).length) + " 转移" : "未加载"),
					React.createElement("span", { style: { fontSize: 11, color: TXT3, marginLeft: "auto", whiteSpace: "nowrap" } }, "拖动移动 · 右下角缩放 · Esc 关闭"),
					React.createElement("button", { onClick: onClose, title: "关闭 (Esc)", style: { width: 22, height: 22, flexShrink: 0, cursor: "pointer", background: "transparent", color: TXT2, border: "none", borderRadius: 5, fontSize: 13, lineHeight: 1 } }, "✕"),
				),
				React.createElement("div", { style: { flex: 1, minHeight: 0, position: "relative" } },
					map && map.layout
						? React.createElement(RouteCanvas, { map, onNodeClick, currentId, focusNodes, TXT, TXT2, ACCENT, BORDER, BG, GHOST })
						: React.createElement("div", { style: { color: TXT2, fontSize: 13, padding: "18px 6px", textAlign: "center" } }, "点击顶栏「🗺 路线图」按钮加载后在此显示分支结构"),
				),
				React.createElement("div", { onMouseDown: onResizeDown, title: "拖拽缩放", style: { position: "absolute", right: 0, bottom: 0, width: 18, height: 18, cursor: "nwse-resize", background: "linear-gradient(135deg, transparent 50%, rgba(128,128,128,.55) 50%)", borderBottomRightRadius: 10 } }),
			);
			return ReactDOM.createPortal(body, document.body);
		}

		// ── 游戏画面窗口（Portal 到 body：游戏内截图显示，可拖可缩放，3s 自动刷新） ──
		function ShotWindow(props) {
			const { project, api, win, onChange, onClose, TXT, TXT2, TXT3, BORDER, BG, LAYER, sessionId } = props;
			const [imgUrl, setImgUrl] = React.useState(null);
			const [loading, setLoading] = React.useState(false);
			const [lastAt, setLastAt] = React.useState(null);
			const [lastAct, setLastAct] = React.useState(null);
			const dragRef = React.useRef(null);
			const [dragState, setDragState] = React.useState(null);
			const winRef = React.useRef(win);
			winRef.current = win;
			const urlRef = React.useRef(null);

			const onBarDown = (e) => { e.preventDefault(); dragRef.current = { sx: e.clientX, sy: e.clientY, ox: win.x, oy: win.y, resize: false }; setDragState("move"); };
			const onResizeDown = (e) => { e.preventDefault(); e.stopPropagation(); dragRef.current = { sx: e.clientX, sy: e.clientY, ow: win.w, oh: win.h, resize: true }; setDragState("resize"); };
			React.useEffect(() => {
				if (!dragState) return;
				const onMove = (e) => {
					const w = winRef.current, d = dragRef.current;
					if (!d) return;
					if (d.resize) onChange({ ...w, w: Math.max(320, d.ow + e.clientX - d.sx), h: Math.max(240, d.oh + e.clientY - d.sy) });
					else onChange({ ...w, x: Math.max(0, d.ox + e.clientX - d.sx), y: Math.max(0, d.oy + e.clientY - d.sy) });
				};
				const onUp = () => { dragRef.current = null; setDragState(null); };
				window.addEventListener("mousemove", onMove);
				window.addEventListener("mouseup", onUp);
				return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
			}, [dragState, onChange]);
			React.useEffect(() => {
				const onKey = (e) => { const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return; if (e.key === "Escape") onClose(); };
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [onClose]);

			// 刷新：触发游戏截图 → 轮询拉取图片（给游戏截图+写盘留时间，最多 8 次 × 600ms）
			const refresh = () => {
				if (!project) return;
				setLoading(true);
				api("route-shot", {}, { project }).then(() => {
					let tries = 0;
					const shotUrl = "/renpy-dev/shot-image?project=" + encodeURIComponent(project) + "&session=" + encodeURIComponent(sessionId || "");
					const tryFetch = () => {
						tries++;
						fetch(shotUrl)
							.then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
							.then((b) => {
								if (urlRef.current) URL.revokeObjectURL(urlRef.current);
								const u = URL.createObjectURL(b);
								urlRef.current = u;
								setImgUrl(u);
								setLastAt(Date.now());
								setLoading(false);
							})
							.catch(() => { if (tries < 8) setTimeout(tryFetch, 600); else setLoading(false); });
					};
					setTimeout(tryFetch, 400);
				}).catch(() => setLoading(false));
			};
			// 打开时立即刷新 + 3s 自动刷新
			React.useEffect(() => {
				refresh();
				const t = setInterval(refresh, 3000);
				return () => { clearInterval(t); if (urlRef.current) URL.revokeObjectURL(urlRef.current); };
			}, [project]);

			// 简单交互：发送通用指令（dismiss 推进 / rollback 回滚 / click 点击）
			const sendAct = (action, label) => {
				if (!project) return;
				api("route-act", {}, { project, action }).then((r) => {
					setLastAct(label + (r && r.ok ? "" : "（失败）"));
				}).catch(() => setLastAct(label + "（请求失败）"));
			};
			// 点击画面：把 contain 显示下的点击位置反算成图像坐标（截图 = 虚拟分辨率，1:1 映射游戏）
			const onClickImg = (e) => {
				const img = e.currentTarget;
				const rect = img.getBoundingClientRect();
				const natW = img.naturalWidth || 800, natH = img.naturalHeight || 600;
				const ratio = Math.min(rect.width / natW, rect.height / natH);
				const dispW = natW * ratio, dispH = natH * ratio;
				const offX = (rect.width - dispW) / 2, offY = (rect.height - dispH) / 2;
				const x = Math.round((e.clientX - rect.left - offX) / ratio);
				const y = Math.round((e.clientY - rect.top - offY) / ratio);
				const cx = Math.max(0, Math.min(natW, x)), cy = Math.max(0, Math.min(natH, y));
				api("route-act", {}, { project, action: "click", x: cx, y: cy }).then((r) => {
					setLastAct("点击 (" + cx + "," + cy + ")" + (r && r.ok ? "" : "（失败）"));
				}).catch(() => setLastAct("点击请求失败"));
			};

			if (typeof document === "undefined" || !document.body) return null;
			const body = React.createElement("div", { style: { position: "fixed", left: win.x, top: win.y, width: win.w, height: win.h, zIndex: 10001, display: "flex", flexDirection: "column", background: BG, border: "1px solid " + BORDER, borderRadius: 10, boxShadow: "0 10px 40px rgba(0,0,0,.4)", overflow: "hidden", minWidth: 320, minHeight: 240 } },
				React.createElement("div", { onMouseDown: onBarDown, style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: LAYER, borderBottom: "1px solid " + BORDER, cursor: dragState === "move" ? "grabbing" : "grab", userSelect: "none", flexShrink: 0 } },
					React.createElement("span", { style: { fontSize: 13, fontWeight: 600, color: TXT } }, "🎬 游戏画面"),
					React.createElement("span", { style: { fontSize: 11, color: TXT3, marginLeft: "auto", whiteSpace: "nowrap" } }, lastAt ? "更新于 " + new Date(lastAt).toLocaleTimeString() : "未获取"),
					React.createElement("button", { onClick: refresh, title: "立即刷新截图（触发游戏截图并拉取）", style: { padding: "2px 8px", cursor: "pointer", background: "transparent", color: TXT2, border: "1px solid " + BORDER, borderRadius: 5, fontSize: 12 } }, loading ? "…" : "⟳ 刷新"),
					React.createElement("button", { onClick: onClose, title: "关闭 (Esc)", style: { width: 22, height: 22, flexShrink: 0, cursor: "pointer", background: "transparent", color: TXT2, border: "none", borderRadius: 5, fontSize: 13, lineHeight: 1 } }, "✕"),
				),
				React.createElement("div", { style: { flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#000", position: "relative" } },
					imgUrl ? React.createElement("img", { src: imgUrl, onClick: onClickImg, title: "点击画面 = 点击游戏（选项/按钮）", style: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", cursor: "crosshair" } })
						: React.createElement("span", { style: { color: TXT3, fontSize: 12 } }, "游戏运行后自动显示画面（无画面请点刷新）"),
				),
				React.createElement("div", { style: { flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderTop: "1px solid " + BORDER, background: LAYER } },
					React.createElement("button", { onClick: () => sendAct("rollback", "⟲ 回滚"), title: "回滚上一句", style: { padding: "2px 10px", cursor: "pointer", background: "transparent", color: TXT2, border: "1px solid " + BORDER, borderRadius: 5, fontSize: 12 } }, "⟲ 回滚"),
					React.createElement("button", { onClick: () => sendAct("dismiss", "⏩ 推进"), title: "推进对话/交互", style: { padding: "2px 10px", cursor: "pointer", background: "transparent", color: TXT2, border: "1px solid " + BORDER, borderRadius: 5, fontSize: 12 } }, "⏩ 推进"),
					React.createElement("span", { style: { width: 1, height: 16, background: BORDER, flexShrink: 0 } }),
					React.createElement("button", { onClick: () => api("route-act", {}, { project, action: "nav", dir: "up" }).then(() => setLastAct("↑ 菜单上移")).catch(() => setLastAct("↑ 失败")), title: "菜单选项上移（EVENTNAME 机制，headless 也可靠）", style: { padding: "2px 8px", cursor: "pointer", background: "transparent", color: TXT2, border: "1px solid " + BORDER, borderRadius: 5, fontSize: 12 } }, "↑"),
					React.createElement("button", { onClick: () => api("route-act", {}, { project, action: "nav", dir: "down" }).then(() => setLastAct("↓ 菜单下移")).catch(() => setLastAct("↓ 失败")), title: "菜单选项下移", style: { padding: "2px 8px", cursor: "pointer", background: "transparent", color: TXT2, border: "1px solid " + BORDER, borderRadius: 5, fontSize: 12 } }, "↓"),
					React.createElement("button", { onClick: () => api("route-act", {}, { project, action: "nav", select: true }).then(() => setLastAct("✓ 确认选择")).catch(() => setLastAct("✓ 失败")), title: "确认当前选项", style: { padding: "2px 8px", cursor: "pointer", background: "transparent", color: "#4caf50", border: "1px solid " + BORDER, borderRadius: 5, fontSize: 12 } }, "✓ 确定"),
					React.createElement("span", { style: { flex: 1 } }),
					React.createElement("span", { style: { fontSize: 10, color: TXT3 } }, lastAct ? "最近: " + lastAct : "点击画面可操作游戏"),
				),
				React.createElement("div", { onMouseDown: onResizeDown, title: "拖拽缩放", style: { position: "absolute", right: 0, bottom: 0, width: 18, height: 18, cursor: "nwse-resize", background: "linear-gradient(135deg, transparent 50%, rgba(128,128,128,.55) 50%)", borderBottomRightRadius: 10 } }),
			);
			return ReactDOM.createPortal(body, document.body);
		}

		// ── 变量监控窗口（Portal 到 body：运行时变量表 + 变化高亮 + 编辑器/路线图联动） ──
		function VarWindow(props) {
			const { vars, routeVars, win, onChange, onClose, onVarJump, onVarFocus, TXT, TXT2, TXT3, ACCENT, BORDER, BG, LAYER } = props;
			const [query, setQuery] = React.useState("");
			const dragRef = React.useRef(null);
			const [dragState, setDragState] = React.useState(null);
			const winRef = React.useRef(win);
			winRef.current = win;
			const prevVarsRef = React.useRef(null);
			const [changes, setChanges] = React.useState({}); // name -> 'add'|'mod'|'del'

			// 变化检测：对比上次快照（新增绿 / 修改蓝 / 删除红）
			React.useEffect(() => {
				const prev = prevVarsRef.current;
				const cur = vars || {};
				if (prev === null) { prevVarsRef.current = cur; setChanges({}); return; }
				const c = {};
				for (const k of Object.keys(cur)) {
					if (!(k in prev)) c[k] = "add";
					else if (JSON.stringify(prev[k]) !== JSON.stringify(cur[k])) c[k] = "mod";
				}
				for (const k of Object.keys(prev)) if (!(k in cur)) c[k] = "del";
				setChanges(c);
				prevVarsRef.current = cur;
			}, [vars]);

			const onBarDown = (e) => { e.preventDefault(); dragRef.current = { sx: e.clientX, sy: e.clientY, ox: win.x, oy: win.y, resize: false }; setDragState("move"); };
			const onResizeDown = (e) => { e.preventDefault(); e.stopPropagation(); dragRef.current = { sx: e.clientX, sy: e.clientY, ow: win.w, oh: win.h, resize: true }; setDragState("resize"); };
			React.useEffect(() => {
				if (!dragState) return;
				const onMove = (e) => {
					const w = winRef.current, d = dragRef.current;
					if (!d) return;
					if (d.resize) onChange({ ...w, w: Math.max(360, d.ow + e.clientX - d.sx), h: Math.max(280, d.oh + e.clientY - d.sy) });
					else onChange({ ...w, x: Math.max(0, d.ox + e.clientX - d.sx), y: Math.max(0, d.oy + e.clientY - d.sy) });
				};
				const onUp = () => { dragRef.current = null; setDragState(null); };
				window.addEventListener("mousemove", onMove);
				window.addEventListener("mouseup", onUp);
				return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
			}, [dragState, onChange]);
			React.useEffect(() => {
				const onKey = (e) => { const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return; if (e.key === "Escape") onClose(); };
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [onClose]);

			const routeVarNames = React.useMemo(() => new Set((routeVars || []).map((v) => v.name)), [routeVars]);
			const names = Object.keys(vars || {}).sort();
			const filtered = query ? names.filter((n) => n.indexOf(query) >= 0) : names;
			const valStr = (v) => {
				try { const s = JSON.stringify(v); if (s === undefined) return String(v); return s.length > 60 ? s.slice(0, 60) + "…" : s; } catch (e) { return String(v); }
			};
			const typeOf = (v) => v === null ? "null" : Array.isArray(v) ? "arr" : typeof v === "object" ? "obj" : typeof v;
			const stateColor = (n) => changes[n] === "add" ? "#4caf50" : changes[n] === "mod" ? "#569cd6" : changes[n] === "del" ? "#e05c5c" : TXT3;

			if (typeof document === "undefined" || !document.body) return null;
			const body = React.createElement("div", { style: { position: "fixed", left: win.x, top: win.y, width: win.w, height: win.h, zIndex: 10002, display: "flex", flexDirection: "column", background: BG, border: "1px solid " + BORDER, borderRadius: 10, boxShadow: "0 10px 40px rgba(0,0,0,.4)", overflow: "hidden", minWidth: 360, minHeight: 280 } },
				React.createElement("div", { onMouseDown: onBarDown, style: { display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: LAYER, borderBottom: "1px solid " + BORDER, cursor: dragState === "move" ? "grabbing" : "grab", userSelect: "none", flexShrink: 0 } },
					React.createElement("span", { style: { fontSize: 13, fontWeight: 600, color: TXT } }, "📊 变量监控"),
					React.createElement("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "过滤变量名…", style: { flex: 1, minWidth: 60, background: "rgba(128,128,128,.12)", color: TXT, border: "1px solid " + BORDER, borderRadius: 5, fontSize: 12, padding: "2px 7px", outline: "none" } }),
					React.createElement("span", { style: { fontSize: 11, color: TXT3, whiteSpace: "nowrap" } }, names.length + " 个"),
					React.createElement("button", { onClick: onClose, title: "关闭 (Esc)", style: { width: 22, height: 22, flexShrink: 0, cursor: "pointer", background: "transparent", color: TXT2, border: "none", borderRadius: 5, fontSize: 13, lineHeight: 1 } }, "✕"),
				),
				React.createElement("div", { style: { flex: 1, minHeight: 0, overflow: "auto", padding: "4px 6px" } },
					names.length === 0
						? React.createElement("div", { style: { color: TXT3, fontSize: 12, padding: "16px 8px", textAlign: "center" } }, "游戏运行后自动显示变量（无变量请确认游戏在跑且有桥接）")
						: filtered.map((n) => React.createElement("div", { key: n, title: "点击：编辑器跳转定义处 + 路线图高亮关联节点", onClick: () => { onVarJump && onVarJump(n); onVarFocus && onVarFocus(n); }, style: { display: "flex", alignItems: "center", gap: 8, padding: "3px 8px", borderRadius: 5, cursor: "pointer", border: "1px solid transparent", background: "transparent" }, onMouseEnter: (e) => { e.currentTarget.style.background = "rgba(128,128,128,.12)"; e.currentTarget.style.borderColor = BORDER; }, onMouseLeave: (e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; } },
							React.createElement("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: 12, color: routeVarNames.has(n) ? ACCENT : TXT } }, n),
							React.createElement("span", { style: { width: 26, flexShrink: 0, fontSize: 10, color: TXT3, textAlign: "center" } }, typeOf(vars[n])),
							React.createElement("span", { style: { flex: 1.4, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: 12, color: TXT2 } }, valStr(vars[n])),
							React.createElement("span", { style: { width: 30, flexShrink: 0, fontSize: 10, textAlign: "center", color: stateColor(n) } }, changes[n] === "add" ? "新增" : changes[n] === "mod" ? "变化" : changes[n] === "del" ? "删除" : ""),
						)),
				),
				React.createElement("div", { style: { flexShrink: 0, padding: "3px 10px", fontSize: 10, color: TXT3, borderTop: "1px solid " + BORDER } }, "点击变量行 → 编辑器跳定义 + 路线图高亮写入/读取该变量的节点；蓝=修改 绿=新增 红=删除"),
				React.createElement("div", { onMouseDown: onResizeDown, title: "拖拽缩放", style: { position: "absolute", right: 0, bottom: 0, width: 18, height: 18, cursor: "nwse-resize", background: "linear-gradient(135deg, transparent 50%, rgba(128,128,128,.55) 50%)", borderBottomRightRadius: 10 } }),
			);
			return ReactDOM.createPortal(body, document.body);
		}

		const roundRect = (ctx, x, y, w, h, r) => {
			ctx.beginPath();
			ctx.moveTo(x + r, y);
			ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
			ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
			ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
			ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
			ctx.closePath();
		};

		function RenpyPanel(props) {
			const sessionId = props && props.sessionId;
			const [sideOpen, setSideOpen] = React.useState(panelState.sideOpen !== undefined ? panelState.sideOpen : true);
			const [sideTab, setSideTab] = React.useState(panelState.sideTab || "chat");
			const [msg, setMsg] = React.useState("");
			const [composerFocus, setComposerFocus] = React.useState(false);
			const [project, setProject] = React.useState(panelState.project || (typeof localStorage !== "undefined" && localStorage.getItem("renpy-project")) || "");
			const [files, setFiles] = React.useState(panelState.files);
			const [tabs, setTabs] = React.useState(panelState.tabs);
			// 外部修改自动同步：ref 镜像 + 轮询（磁盘内容变化自动重载；有未保存修改不覆盖并提示）
			const tabsRef = React.useRef([]);
			tabsRef.current = tabs;
			const conflictRef = React.useRef(null);
			const syncExternalTimerRef = React.useRef(null);
			React.useEffect(() => {
				if (!project) return;
				const sync = async () => {
					try {
						for (const t of tabsRef.current) {
							if (!t || !t.name) continue;
							const r = await api("read-file", { path: project + "/game/" + t.name });
							const disk = String(r.content || "");
							if (disk !== t.content) {
								if (t.dirty || conflictRef.current === t.name) {
									if (conflictRef.current !== t.name) {
										conflictRef.current = t.name;
										addLog("⚠ 外部修改冲突（文件已在外部改动，你有未保存更改，保留本地；关闭标签重开可加载外部版本）：" + t.name);
									}
								} else {
									setTabs((old) => old.map((x) => (x.name === t.name ? Object.assign({}, x, { content: disk }) : x)));
									addLog("⟳ 已同步外部修改：" + t.name);
								}
							}
						}
					} catch (e) { /* 单次轮询失败忽略 */ }
				};
				sync();
				syncExternalTimerRef.current = setInterval(sync, 5000);
				return () => { if (syncExternalTimerRef.current) clearInterval(syncExternalTimerRef.current); };
			}, [project]);
			const [activeName, setActiveName] = React.useState(panelState.activeName);
			const [log, setLog] = React.useState("");
			const [lintErrors, setLintErrors] = React.useState([]);
			const [shot, setShot] = React.useState(null);
			const [routeMap, setRouteMap] = React.useState(panelState.routeMap || null);
			const [routeLoading, setRouteLoading] = React.useState(false);
			const [routeWin, setRouteWin] = React.useState(panelState.routeWin || { open: false, x: 140, y: 90, w: 780, h: 520 }); // 路线图弹出窗口 {open,x,y,w,h}
			const [shotWin, setShotWin] = React.useState(panelState.shotWin || { open: false, x: 160, y: 100, w: 520, h: 420 }); // 游戏画面窗口 {open,x,y,w,h}
			const [varWin, setVarWin] = React.useState(panelState.varWin || { open: false, x: 180, y: 110, w: 460, h: 420 }); // 变量监控窗口 {open,x,y,w,h}
			const [varFocus, setVarFocus] = React.useState(null); // 变量监控联动：当前关注的变量名（路线图高亮关联节点）
			const [routeStatus, setRouteStatus] = React.useState(null); // 调试位置回报（桥接 status.json 轮询）{running,label,file,line}
			const [labels, setLabels] = React.useState(panelState.labels);
			const [chars, setChars] = React.useState(panelState.chars || []);
			const [trans, setTrans] = React.useState(panelState.trans || []);
			const [vars, setVars] = React.useState(panelState.vars || []);
			const [navKind, setNavKind] = React.useState(panelState.navKind || "labels");
			const [assets, setAssets] = React.useState(panelState.assets || { image: [], audio: [], video: [], font: [], other: [] });
			const [expanded, setExpanded] = React.useState(panelState.expanded || {});
			const [histOpen, setHistOpen] = React.useState(false);
			const [histVersions, setHistVersions] = React.useState([]);
			const [histPreview, setHistPreview] = React.useState(null);
			const [cpList, setCpList] = React.useState(panelState.cpList || []);
			const [cpActive, setCpActive] = React.useState(panelState.cpActive || null);
			const [cpDiff, setCpDiff] = React.useState(panelState.cpDiff || null);
			const [cpOpen, setCpOpen] = React.useState(false);
			const [cpExpanded, setCpExpanded] = React.useState({});
			// ── 编辑器增强：查找/替换、补全、错误下划线、保存快照 ──
			const [findOpen, setFindOpen] = React.useState(false);
			const [findText, setFindText] = React.useState("");
			const [findReplace, setFindReplace] = React.useState("");
			const [findIdx, setFindIdx] = React.useState(0);
			// ── 编辑器第二批：括号匹配高亮 ──
			const [bracketMatch, setBracketMatch] = React.useState(null); // {open, close} 字符位置
			// ── 跳转落点闪烁高亮（路线图节点 / lint / 定义跳转）：{file, line, key}，2.2s 自动消失 ──
			const [jumpFlash, setJumpFlash] = React.useState(null);
			// ── GUI 定制面板（🎨 按钮打开；读 gui.rpy → 编辑 → 写回） ──
			const [guiOpen, setGuiOpen] = React.useState(false);
			const [guiForm, setGuiForm] = React.useState(null); // {width, height, vars: {name: value}}
			const guiVars = React.useMemo(() => {
				if (!guiForm) return null;
				return { width: guiForm.width, height: guiForm.height, vars: Object.assign({}, guiForm.vars) };
			}, [guiForm]);
			const openGuiPanel = () => {
				if (!project) return;
				api("read-file", { path: project + "/game/gui.rpy" }).then((r) => {
					const parsed = parseGuiVars(r.content || "");
					setGuiForm({ width: parsed.width, height: parsed.height, vars: parsed.vars });
					setGuiOpen(true);
				}).catch(() => {
					// 无 gui.rpy → 空表单（新建）
					setGuiForm({ width: 1280, height: 720, vars: {} });
					setGuiOpen(true);
				});
			};
			const saveGuiChanges = () => {
				if (!guiForm || !project) return;
				let next = null;
				api("read-file", { path: project + "/game/gui.rpy" }).then((r) => {
					next = applyGuiChanges(r.content || "", guiForm);
					return api("write-file", {}, { path: project + "/game/gui.rpy", content: next });
				}).then(() => {
					addLog("✅ GUI 定制已保存");
					// 若 gui.rpy 是打开标签则同步
					setTabs((old) => old.map((t) => (t.name === "gui.rpy" ? Object.assign({}, t, { content: next }) : t)));
				}).catch((e) => addLog("GUI 保存失败: " + String(e)));
			};
			const findInputRef = React.useRef(null);
			const overlayRef = React.useRef(null);
			const [completions, setCompletions] = React.useState([]);
			const [compSel, setCompSel] = React.useState(0);
			const [compPos, setCompPos] = React.useState(null); // {left, top}
			const [savedSnap, setSavedSnap] = React.useState(panelState.savedSnap || null);
			const [charW, setCharW] = React.useState(7.8); // 实测代码字体字符宽（px）
			const [wsLock, setWsLock] = React.useState(panelState.wsLock || null); // 工作区域 {file,startLine,endLine,label}
			const [previewImg, setPreviewImg] = React.useState(panelState.previewImg || null);
			const [previewAudio, setPreviewAudio] = React.useState(panelState.previewAudio || null);
			const [previewFont, setPreviewFont] = React.useState(null); // 字体预览 {rel, size}
			const [fontTick, setFontTick] = React.useState(0); // 字体加载完成后触发重渲染
			const loadedFontsRef = React.useRef({}); // family → true（已加载的 @font-face）
			// 项目字体映射：{font=} 参数（文件名或相对路径）→ 实际 rel
			const fontMap = React.useMemo(() => {
				const m = {};
				for (const f of assets.font || []) {
					const b = String(f.rel).split("/").pop();
					m[b] = f.rel;
					m[f.rel] = f.rel;
				}
				return m;
			}, [assets.font]);
			// 动态加载字体（FontFace API；成功后触发重渲染使 {font} 真实生效）
			const ensureFont = (rel) => {
				const base = String(rel).split("/").pop() || rel;
				const family = "rpy-font-" + base.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
				if (loadedFontsRef.current[family]) return family;
				try {
					if (typeof document === "undefined" || !document.fonts) return family;
					const f = new FontFace(family, "url(" + assetUrl(rel) + ")");
					f.load().then(() => {
						document.fonts.add(f);
						loadedFontsRef.current[family] = true;
						setFontTick((t) => t + 1);
					}).catch(() => { loadedFontsRef.current[family] = false; });
					loadedFontsRef.current[family] = "loading";
				} catch (e) { /* FontFace 不可用则保持标记 */ }
				return family;
			};
			const [busy, setBusy] = React.useState(false);
			const indexMapRef = React.useRef(panelState.indexMap || {});
			const reindexTimerRef = React.useRef(null);
			const taRef = React.useRef(null);
			const gutterRef = React.useRef(null);
			const preRef = React.useRef(null);
			const pendingJump = React.useRef(null);
			const jumpTimerRef = React.useRef(null); // 跳转落点闪烁的自动消失定时器
			const addLog = (s) => setLog((old) => (old ? old + "\n" : "") + s);

			// ── 侧边栏数据：宿主轮询（不依赖客户端会话钩子，兼容封装客户端） ──
			const [feed, setFeed] = React.useState({ chat: [], trail: [] });
			const feedTimerRef = React.useRef(null);
			const feedScrollRef = React.useRef(null);
			const seenTimeRef = React.useRef({}); // 消息 id → 首次看到时间戳
			const feedLenRef = React.useRef(0);
			// 智能自动滚动：贴底或有新条目才滚到底，上翻阅读时不打扰
			React.useEffect(() => {
				const el = feedScrollRef.current;
				if (!el) return;
				const len = feed.chat.length + feed.trail.length;
				const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
				if (nearBottom || len !== feedLenRef.current) el.scrollTop = el.scrollHeight;
				feedLenRef.current = len;
			}, [feed]);
			const fmtTime = (ts) => {
				if (!ts) return "";
				const d = new Date(ts);
				const p = (n) => (n < 10 ? "0" : "") + n;
				return p(d.getHours()) + ":" + p(d.getMinutes());
			};
			const copyText = (text) => {
				try {
					if (navigator.clipboard && navigator.clipboard.writeText) {
						navigator.clipboard.writeText(text).then(() => addLog("已复制到剪贴板"), () => addLog("复制失败"));
					} else {
						const ta = document.createElement("textarea");
						ta.value = text;
						document.body.appendChild(ta);
						ta.select();
						document.execCommand("copy");
						document.body.removeChild(ta);
						addLog("已复制到剪贴板");
					}
				} catch (e) { addLog("复制失败: " + String(e)); }
			};
			const fmtStamp = (t) => {
				const d = new Date(Number(t));
				if (isNaN(d.getTime())) return t;
				const p = (n) => (n < 10 ? "0" : "") + n;
				return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
			};
			const lastUserMsgRef = React.useRef("");
			const pollFeed = () => {
				if (!project) return;
				api("feed", {}, {}).then((r) => {
					if (r && (r.chat || r.trail)) {
						const now = Date.now();
						const seen = seenTimeRef.current;
						(r.chat || []).forEach((c) => { if (c.id && !seen[c.id]) seen[c.id] = now; });
						(r.trail || []).forEach((t) => { if (t.id && !seen[t.id]) seen[t.id] = now; });
						setFeed({ chat: r.chat || [], trail: r.trail || [] });
						detectTurnEnd(r.chat || []);
						refreshCpList(); // 对话页签检查点时间线
						// 兜底注入：面板活跃时检测到新的用户消息（无论从哪发的）且未注入 → 自动注入工作区域
						const chat = r.chat || [];
						if (pendingWsInjectRef.current) {
							let lastUser = "";
							for (let i = chat.length - 1; i >= 0; i--) {
								if (chat[i].t === "user") { lastUser = String(chat[i].id || chat[i].text || ""); break; }
							}
							if (lastUser && lastUser !== lastUserMsgRef.current) {
								lastUserMsgRef.current = lastUser;
								pendingWsInjectRef.current = false;
								api("workspace-inject", {}, { project }).then(() => {
									try { localStorage.setItem(wsInjKeyRef.current, String(wsVerRef.current)); } catch (e) { /* ignore */ }
								}).catch(() => { /* 注入失败不阻塞 */ });
							}
						} else {
							lastUserMsgRef.current = "";
						}
					}
				}).catch(() => { /* 静默 */ });
			};
			React.useEffect(() => {
				if (!project) return;
				pollFeed();
				feedTimerRef.current = setInterval(pollFeed, 3000);
				return () => { if (feedTimerRef.current) clearInterval(feedTimerRef.current); };
			}, [project]);

			// 修改面板打开时轮询 diff（agent 修改实时反映到 gutter 标记与统计）
			React.useEffect(() => {
				if (!cpOpen || !cpActive || !project) return;
				const t = setInterval(() => refreshCp(cpActive), 3000);
				return () => clearInterval(t);
			}, [cpOpen, cpActive, project]);

			// 卸载时清理防抖定时器
			React.useEffect(() => {
				return () => {
					if (reindexTimerRef.current) clearTimeout(reindexTimerRef.current);
					if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
				};
			}, []);

			// 每次渲染后把状态写回模块级（卸载时即持久）。
			React.useEffect(() => {
				panelState.project = project;
				panelState.routeWin = routeWin;
				panelState.shotWin = shotWin;
				panelState.varWin = varWin;
				panelState.files = files;
				panelState.tabs = tabs;
				panelState.activeName = activeName;
				panelState.labels = labels;
				panelState.chars = chars;
				panelState.trans = trans;
				panelState.vars = vars;
				panelState.navKind = navKind;
				panelState.indexMap = indexMapRef.current;
				panelState.assets = assets;
				panelState.expanded = expanded;
				panelState.previewImg = previewImg;
				panelState.previewAudio = previewAudio;
				panelState.sideOpen = sideOpen;
				panelState.sideTab = sideTab;
				panelState.cpList = cpList;
				panelState.cpActive = cpActive;
				panelState.cpDiff = cpDiff;
				panelState.savedSnap = savedSnap;
				panelState.wsLock = wsLock;
			});

			const active = tabs.find((t) => t.name === activeName) || null;
			// 只读视图标签（teach: AI 教学 / doc: 官方文档）：不渲染编辑器 overlay/textarea
			const isViewTab = !!(active && /^(teach|doc):/.test(active.name));
			const content = active ? active.content : "";

			const api = async (op, params, body) => {
				const qs = new URLSearchParams({ session: sessionId || "", ...(params || {}) }).toString();
				const url = "/renpy-dev/" + op + "?" + qs;
				if (body !== undefined) {
					const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
					return r.json();
				}
				const r = await fetch(url);
				return r.json();
			};

			// 加载路线图（route-map + 布局 + 元信息）
			const loadRouteMap = async () => {
				if (!project) return;
				setRouteLoading(true);
				try {
					const r = await api("route-map", {}, { project });
					if (r.error) { setLog("路线图加载失败: " + r.error); }
					else { setRouteMap(r); }
				} catch (e) { setLog("路线图请求失败: " + String(e)); }
				setRouteLoading(false);
			};

			// 顶栏「路线图」按钮：未加载则先加载，然后弹出窗口
			const openRouteWin = () => {
				if (!project) return;
				if (!routeMap) loadRouteMap();
				setRouteWin((w) => ({ ...w, open: true }));
			};

			// 点击路线图节点 → ① 内置编辑器跳转到对应文件:行（不依赖调试，始终可用）② 写桥接 warp 指令（游戏运行中即跳转）
			const jumpToState = async (stateId) => {
				if (!project || !stateId || !routeMap) return;
				const st = (routeMap.states || []).find((s) => s.id === stateId);
				if (!st) return;
				const fileShort = (st.file || "").replace(/^game\//, "") || "";
				const line = st.line || 1;
				// ① 内置编辑器：打开文件（已激活则直接跳）+ 落点闪烁
				if (fileShort) {
					if (fileShort === activeName) flashJumpToLine(line);
					else { pendingJump.current = { file: fileShort, line: line }; openFile(fileShort); }
					setLog("📂 " + (st.name || stateId) + " → " + fileShort + ":" + line);
				}
				// ② 调试衔接：写桥接指令（游戏未运行则无副作用；运行中由桥接执行 warp）
				try {
					const r = await api("route-jump", {}, { project, state: stateId, spec: fileShort + ":" + line });
					if (r && r.ok) setLog("🎮 warp 指令已写入，游戏运行中将跳转到 " + fileShort + ":" + line);
					else setLog("⚠ warp 指令写入失败: " + JSON.stringify(r || null));
				} catch (e) { setLog("⚠ route-jump 请求失败: " + String(e)); }
			};

			const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
			const fmtSize = (n) => {
				if (!n) return "0 B";
				if (n < 1024) return n + " B";
				if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
				return (n / 1024 / 1024).toFixed(1) + " MB";
			};

			// ── 官方来源的分色规则（parser.py @statement + renpy/common register_statement）──
			const C_STMT = "#569cd6"; // 语句关键字（蓝）
			const C_NAME = "#dcdcaa"; // 名称：label/define/image/角色（黄）
			const C_PY = "#c586c0"; // python 关键字（紫）
			const C_TAG = "#e5c07b"; // 字符串内 {text tag}（金）
			const C_CMT = "#6a9955"; // 注释（绿）
			const C_STR = "#ce9178"; // 字符串（橙）
			const C_NUM = "#b5cea8"; // 数字（青）
			const C_PLAIN = "#d4d4d4"; // 普通（灰）

			const STMT_WORDS = "if elif else while pass menu return jump call scene show hide with image define default transform python label init screen style testcase testsuite translate camera play queue stop pause window voice extend centered right left nvl monologue IF ELIF ELSE".split(" ");
			const STMT_PHRASES = ["show screen", "call screen", "hide screen", "window show", "window hide", "window auto", "show layer", "rpy python", "rpy monologue", "init offset", "init label"];
			const PY_WORDS = "if elif else for while def return import from class try except finally with as pass break continue and or not in is None True False global lambda raise assert yield del".split(" ");
			const NAME_AFTER_WORDS = "label screen transform image define default style".split(" ");

			const highlightLine = (line, pyIndent) => {
				let html = "";
				const n = line.length;
				let i = 0;
				const isId = (c) => /[A-Za-z0-9_]/.test(c);
				const isIdStart = (c) => /[A-Za-z_]/.test(c);
				const readWord = (start) => { let j = start; while (j < n && isId(line[j])) j++; return line.slice(start, j); };
				const span = (text, c) => '<span style="color:' + c + '">' + esc(text) + "</span>";

				// 缩进与 trim
				let ind = 0;
				while (ind < n && (line[ind] === " " || line[ind] === "\t")) ind++;
				const trimmed = line.slice(ind);
				const inPy = pyIndent !== null && ind > pyIndent && trimmed.length > 0;
				const firstWord = trimmed.length && isIdStart(trimmed[0]) ? readWord(ind) : "";
				const lineEndsMenu = /^"(?:[^"\\\n]|\\.)*"\s*:\s*$/.test(trimmed);
				// 角色说：行首标识符后跟字符串
				const sayMatch = /^([A-Za-z_][\w.]*)\s*("|')/.exec(trimmed);

				// 行首菜单项：整行字符串以冒号结尾 → 黄
				if (lineEndsMenu && /^"/.test(trimmed)) {
					let k = trimmed.indexOf('"');
					while (k >= 0) {
						const str = readStringAt(line, ind + k);
						html += span(line.slice(i, ind + k), C_PLAIN);
						html += highlightString(line.slice(ind + k, ind + k + str.len), true);
						i = ind + k + str.len;
						k = line.indexOf('"', i);
					}
					html += span(line.slice(i), C_PLAIN);
					return html;
				}

				while (i < n) {
					const c = line[i];
					if (c === "#") {
						html += span(line.slice(i), C_CMT);
						break;
					}
					if (c === '"' || c === "'") {
						const r = readStringAt(line, i);
						html += highlightString(line.slice(i, i + r.len), false);
						i += r.len;
						continue;
					}
					if (isIdStart(c)) {
						const word = readWord(i);
						// 语句短语（多词）优先
						let matched = false;
						for (let k = 0; k < STMT_PHRASES.length; k++) {
							const ph = STMT_PHRASES[k];
							if (line.slice(i, i + ph.length) === ph && (i + ph.length >= n || !isId(line[i + ph.length]))) {
								html += span(line.slice(i, i + ph.length), C_STMT);
								i += ph.length;
								matched = true;
								break;
							}
						}
						if (matched) continue;
						const lower = word.toLowerCase();
						if (inPy && PY_WORDS.indexOf(word) >= 0) {
							html += span(word, C_PY);
							i += word.length;
							continue;
						}
						if (STMT_WORDS.indexOf(lower) >= 0) {
							html += span(word, C_STMT);
							i += word.length;
							// 关键字后跟名称：label/define/image/screen...
							if (NAME_AFTER_WORDS.indexOf(lower) >= 0) {
								let j = i;
								while (j < n && (line[j] === " " || line[j] === "\t")) j++;
								if (j < n && isIdStart(line[j])) {
									const nm = readWord(j);
									html += span(line.slice(i, j), C_PLAIN);
									html += span(nm, C_NAME);
									i = j + nm.length;
								}
							}
							continue;
						}
						if (sayMatch && sayMatch[1] === word && i === ind) {
							html += span(word, C_NAME);
							i += word.length;
							continue;
						}
						html += esc(word);
						i += word.length;
						continue;
					}
					if (/[0-9]/.test(c) && (i === 0 || !isId(line[i - 1]))) {
						let j = i;
						while (j < n && /[0-9.]/.test(line[j])) j++;
						html += span(line.slice(i, j), C_NUM);
						i = j;
						continue;
					}
					html += esc(c);
					i++;
				}
				return html;
			};

			const readStringAt = (line, start) => {
				const q = line[start];
				let j = start + 1;
				let len = 0;
				while (j < line.length) {
					if (line[j] === "\\") { j += 2; continue; }
					if (line[j] === q) { len = j - start + 1; break; }
					j++;
				}
				if (!len) len = line.length - start;
				return { len };
			};

			const highlightString = (str, isMenu) => {
				// 字符串内的 {text tag} 用金色
				let out = "";
				let i = 0;
				const n = str.length;
				while (i < n) {
					const b = str.indexOf("{", i);
					if (b < 0) { out += esc(str.slice(i)); break; }
					const e = str.indexOf("}", b);
					if (e < 0) { out += esc(str.slice(i)); break; }
					out += esc(str.slice(i, b));
					out += '<span style="color:' + C_TAG + '">' + esc(str.slice(b, e + 1)) + "</span>";
					i = e + 1;
				}
				const c = isMenu ? C_NAME : C_STR;
				return '<span style="color:' + c + '">' + out + "</span>";
			};

			// ── 样式预览：say 语句引号内容 → 富文本 HTML ──
			// 行高不变原则：字号/字体等会改变行高的样式用"底色标记 + title 提示"而非实际变化（pre 与 textarea 必须逐行对齐）
			const sayStyledHtml = (trimmed) => {
				const r = renpyTextPreview(trimmed);
				if (!r) return null;
				const part = (n) => {
					const st = n.style || {};
					const css = [];
					if (st.bold) css.push("font-weight:700");
					if (st.italic) css.push("font-style:italic");
					const deco = [];
					if (st.underline) deco.push("underline");
					if (st.strikethrough) deco.push("line-through");
					if (deco.length) css.push("text-decoration:" + deco.join(" "));
					if (st.color) css.push("color:" + st.color);
					if (st.alpha !== undefined && st.alpha !== 1) css.push("opacity:" + st.alpha);
					if (st.kerning !== undefined) css.push("letter-spacing:" + st.kerning + "px");
					if (st.href) { css.push("color:#569cd6"); css.push("text-decoration:underline"); }
					// 字号真实渲染（预览模式行高放大到 34px 可容纳；0.75 缩放：引擎 22px 基线 → 预览 16.5px）
					if (st.size !== undefined && st.size !== 22) css.push("font-size:" + Math.round(st.size * 0.75) + "px");
					let fontTitle = null;
					if (st.font) {
						const rel = fontMap[st.font];
						const base = String(st.font).split("/").pop() || st.font;
						const family = "rpy-font-" + base.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
						const loaded = loadedFontsRef.current[family];
						if (rel && loaded === true) { css.push("font-family:'" + family + "'"); fontTitle = "字体 " + st.font; }
						else if (rel) { css.push("background:rgba(86,156,214,.22)"); fontTitle = "字体 " + st.font + "（加载中…）"; }
						else { css.push("background:rgba(224,92,92,.25)"); fontTitle = "字体文件不存在：" + st.font; }
					}
					if (st.styleName) css.push("outline:1px dashed #569cd6");
					if (st.ruby) css.push("background:rgba(180,120,255,.22)");
					if (st.alt) css.push("color:#9a9a9a");
					const title = st.size !== undefined && st.size !== 22 ? "字号 " + st.size : fontTitle !== null ? fontTitle : st.styleName ? "样式 " + st.styleName : undefined;
					const stl = css.join(";");
					if (n.t === "text") return '<span style="' + stl + '"' + (title ? ' title="' + esc(title) + '"' : "") + ">" + esc(n.s) + "</span>";
					if (n.t === "interp") return '<span style="background:rgba(212,172,200,.30);color:#c586c0;border-bottom:1px dashed #c586c0" title="运行时插值">' + esc("[" + n.expr + "]") + "</span>";
					if (n.t === "image") return '<span style="background:rgba(86,156,214,.18);color:#569cd6" title="图片 ' + esc(n.src) + '">' + esc("🖼 " + n.src) + "</span>";
					if (n.t === "pause") return '<span style="color:#9a9a9a;font-size:10px">' + (n.kind === "p" ? "⏸分段" : "⏸等" + (n.sec !== null ? n.sec + "s" : "")) + "</span>";
					if (n.t === "nw") return '<span style="color:#9a9a9a">↷</span>';
					if (n.t === "fast") return '<span style="color:#9a9a9a">⚡</span>';
					if (n.t === "done") return '<span style="color:#9a9a9a">✂</span>';
					if (n.t === "space") return '<span style="display:inline-block;width:' + (n.n * 0.55) + 'px"></span>';
					if (n.t === "vspace" || n.t === "clear") return "";
					if (n.t === "err") return '<span style="background:rgba(255,80,80,.25);color:#ff6b6b;text-decoration:line-through" title="未知文本标签（渲染期会报错）">' + esc(n.s) + "</span>";
					return "";
				};
				let html = "";
				for (const n of r.nodes) html += part(n);
				return { html, notes: r.notes };
			};

			// ── 打字动画预览：节点部分渲染（text 按 maxChars 截断，样式同 sayStyledHtml） ──
			const playNodeEl = (n, maxChars, key) => {
				const st = n.style || {};
				const css = {};
				if (st.bold) css.fontWeight = 700;
				if (st.italic) css.fontStyle = "italic";
				const deco = [];
				if (st.underline) deco.push("underline");
				if (st.strikethrough) deco.push("line-through");
				if (deco.length) css.textDecoration = deco.join(" ");
				if (st.color) css.color = st.color;
				if (st.alpha !== undefined && st.alpha !== 1) css.opacity = st.alpha;
				if (st.kerning !== undefined) css.letterSpacing = st.kerning + "px";
				if (st.size !== undefined && st.size !== 22) css.fontSize = Math.round(st.size * 0.75) + "px";
				if (st.href) { css.color = "#569cd6"; css.textDecoration = "underline"; }
				if (st.font) {
					const base = String(st.font).split("/").pop();
					const family = "rpy-font-" + base.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
					if (loadedFontsRef.current[family] === true) css.fontFamily = "'" + family + "'";
				}
				if (n.t === "text") return React.createElement("span", { key, style: css }, n.s.slice(0, maxChars));
				if (n.t === "interp") return React.createElement("span", { key, style: { ...css, background: "rgba(212,172,200,.30)", color: "#c586c0", borderBottom: "1px dashed #c586c0" } }, "[" + n.expr + "]");
				if (n.t === "pause") return React.createElement("span", { key, style: { ...css, color: "#e5c07b", fontSize: 11, margin: "0 4px" } }, n.sec !== null ? "⏸ " + n.sec + "s" : "⏸ 等待");
				if (n.t === "image") return React.createElement("span", { key, style: { ...css, color: "#569cd6" } }, "🖼 " + n.src);
				if (n.t === "space") return React.createElement("span", { key, style: { display: "inline-block", width: n.n * 0.55 } });
				if (n.t === "nw" || n.t === "fast" || n.t === "done") return React.createElement("span", { key, style: { ...css, color: "#9a9a9a", fontSize: 10 } }, n.t === "nw" ? "↷" : n.t === "fast" ? "⚡" : "✂");
				if (n.t === "err") return React.createElement("span", { key, style: { ...css, background: "rgba(255,80,80,.25)", color: "#ff6b6b", textDecoration: "line-through" } }, n.s);
				return null;
			};

			const highlightRpy = (src, previewMode) => {
				const lines = src.split("\n");
				let html = "";
				let pyIndent = null;
				for (let li = 0; li < lines.length; li++) {
					const line = lines[li];
					let ind = 0;
					while (ind < line.length && (line[ind] === " " || line[ind] === "\t")) ind++;
					const trimmed = line.slice(ind);
					// 样式预览模式：say 语句 → 引号内容富文本（角色名/引号保留语法色，尾部原样）
					if (previewMode) {
						const mRole = /^([A-Za-z_][\w.]*)\s+"((?:[^"\\]|\\.)*)"(.*)$/.exec(trimmed);
						let who = null, m1 = null;
						if (mRole) { who = mRole[1]; m1 = mRole; }
						else m1 = /^"((?:[^"\\]|\\.)*)"(.*)$/.exec(trimmed);
						if (m1) {
							const styled = sayStyledHtml(trimmed);
							if (styled) {
								html += esc(line.slice(0, ind));
								if (who) html += '<span style="color:' + C_NAME + '">' + esc(who) + "</span>";
								html += '<span style="color:' + C_STR + '">"</span>' + styled.html + '<span style="color:' + C_STR + '">"</span>';
								const tail = m1[m1.length - 1];
								if (tail) html += '<span style="color:' + C_PLAIN + '">' + esc(tail) + "</span>";
								html += "\n";
								continue;
							}
						}
					}
					const inPyNow = pyIndent !== null && ind > pyIndent && trimmed.length > 0;
					if (!inPyNow && trimmed.length === 0 && pyIndent !== null) { /* 空行保持 py 状态 */ }
					else if (trimmed.length > 0 && ind <= pyIndent && pyIndent !== null) pyIndent = null;
					// python: 开块
					if (/^python\s*:/.test(trimmed) || /^init\s+python\s*:/.test(trimmed) || /^rpy\s+python\s*:/.test(trimmed)) {
						pyIndent = ind;
					}
					// $ 单行 python：整行按 python 高亮（先按普通，再用 python 关键词覆盖）
					const isDollar = /^\$/.test(trimmed);
					html += highlightLine(line, inPyNow || isDollar ? Math.max(0, ind - 1) : pyIndent) + "\n";
				}
				return html;
			};

			const lineCount = content.split("\n").length;
			const lines = [];
			for (let i = 1; i <= lineCount; i++) lines.push(i);

			const syncScroll = () => {
				if (!taRef.current) return;
				if (gutterRef.current) gutterRef.current.scrollTop = taRef.current.scrollTop;
				if (preRef.current) preRef.current.scrollTop = taRef.current.scrollTop;
				// overlay 高亮层：整体 transform 反向平移，跟随 textarea 滚动（absolute 子块相对内容坐标）
				if (overlayRef.current) {
					overlayRef.current.style.transform = "translate(" + (-taRef.current.scrollLeft) + "px," + (-taRef.current.scrollTop) + "px)";
				}
			};
			const onKeyDown = (e) => {
				const ta = taRef.current;
				if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") { e.preventDefault(); saveFile(); return; }
				if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") { e.preventDefault(); setFindOpen(true); setTimeout(function () { if (findInputRef.current) findInputRef.current.focus(); }, 30); return; }
				if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "/") { e.preventDefault(); toggleComment(); return; }
				if (e.ctrlKey && !e.altKey && e.key === " ") { e.preventDefault(); openCompletions(); return; }
				// 补全列表导航
				if (completions.length) {
					if (e.key === "ArrowDown") { e.preventDefault(); setCompSel((s) => (s + 1) % completions.length); return; }
					if (e.key === "ArrowUp") { e.preventDefault(); setCompSel((s) => (s - 1 + completions.length) % completions.length); return; }
					if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applyCompletion(); return; }
					if (e.key === "Escape") { setCompletions([]); return; }
				}
				if (e.key === "Tab") {
					e.preventDefault();
					if (!ta) return;
					const start = ta.selectionStart;
					const end = ta.selectionEnd;
					const next = content.slice(0, start) + "    " + content.slice(end);
					onChange(next);
					requestAnimationFrame(function () { ta.selectionStart = ta.selectionEnd = start + 4; });
					return;
				}
				// 自动缩进：回车继承上一行缩进；上一行以 ":" 结尾（Ren'Py 块开）则 +4
				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					if (!ta) return;
					const start = ta.selectionStart;
					const end = ta.selectionEnd;
					const lineStart = content.lastIndexOf("\n", start - 1) + 1;
					const curLine = content.slice(lineStart, start);
					const indent = nextIndent(curLine);
					const next = content.slice(0, start) + "\n" + indent + content.slice(end);
					onChange(next);
					requestAnimationFrame(function () { ta.selectionStart = ta.selectionEnd = start + 1 + indent.length; });
					return;
				}
				// 括号自动补全：输入开括号自动补配对闭括号（无选区时）
				const CLOSE_OF = { "(": ")", "[": "]", "{": "}" };
				if (!e.ctrlKey && !e.altKey && CLOSE_OF[e.key]) {
					const start = ta.selectionStart;
					const end = ta.selectionEnd;
					if (start === end) {
						e.preventDefault();
						const next = content.slice(0, start) + e.key + CLOSE_OF[e.key] + content.slice(end);
						onChange(next);
						requestAnimationFrame(function () { ta.selectionStart = ta.selectionEnd = start + 1; });
						return;
					}
				}
				// 右括号跳过：光标后已是配对右括号 → 直接跳过（不重复输入）
				if (!e.ctrlKey && !e.altKey && (e.key === ")" || e.key === "]" || e.key === "}")) {
					const start = ta.selectionStart;
					if (start === ta.selectionEnd && content[start] === e.key) {
						e.preventDefault();
						requestAnimationFrame(function () { ta.selectionStart = ta.selectionEnd = start + 1; });
						return;
					}
				}
				// 成对删除：Backspace 删开括号时若紧跟配对闭括号则一起删
				if (e.key === "Backspace" && !e.ctrlKey && !e.altKey) {
					const start = ta.selectionStart;
					if (start === ta.selectionEnd && start > 0) {
						const open = content[start - 1];
						const close = CLOSE_OF[open];
						if (close && content[start] === close) {
							e.preventDefault();
							onChange(content.slice(0, start - 1) + content.slice(start + 1));
							requestAnimationFrame(function () { ta.selectionStart = ta.selectionEnd = start - 1; });
							return;
						}
					}
				}
				// 跳转匹配括号：Ctrl+Shift+\
				if (e.ctrlKey && e.shiftKey && e.key === "\\") {
					e.preventDefault();
					if (!ta || !bracketMatch) return;
					const target = bracketJumpTarget(bracketMatch, ta.selectionStart);
					if (target !== null) {
						ta.setSelectionRange(target, target);
						trackCursor();
						addLog("⇄ 跳转匹配括号 @" + target);
					}
				}
			};

			// ── 行/列 → 像素（编辑器 13px/1.5，行高 19.5；字符宽用 canvas 实测 + CJK 双宽） ──
			const CHAR_W = charW;
			// 行高：预览模式 34px 容纳 say 字号差异
			const LINE_H = () => (stylePreview ? 34 : 19.5);
			// 实测代码字体字符宽（等宽字体；pre 挂载后测量一次）
			React.useEffect(() => {
				const pre = preRef.current;
				if (!pre) return;
				try {
					const cv = document.createElement("canvas");
					const ctx = cv.getContext("2d");
					const fs = window.getComputedStyle(pre).fontFamily;
					const fz = window.getComputedStyle(pre).fontSize || "13px";
					ctx.font = fz + " " + fs;
					const w = ctx.measureText("0123456789").width / 10;
					if (w > 4 && w < 20) setCharW(w);
				} catch (e) { /* 保持默认 */ }
			}, [activeName]);
			const textWidth = (s) => {
				let w = 0;
				for (const ch of String(s)) w += ch.charCodeAt(0) > 0x2e7f ? CHAR_W * 2 : CHAR_W;
				return w;
			};
			const offsetToPos = (text, offset) => {
				const before = text.slice(0, offset);
				const ls = before.split("\n");
				return { line: ls.length, col: ls[ls.length - 1].length };
			};

			// ── 括号匹配 → 屏幕位置（供 overlay 高亮；无 stylePreview 依赖可留此处） ──
			const bracketRects = React.useMemo(() => {
				if (!bracketMatch) return null;
				const of = (p) => {
					const before = content.slice(0, p);
					const ls = before.split("\n");
					const line = ls.length;
					const col = ls[ls.length - 1].length;
					return { line, left: textWidth(ls[ls.length - 1]) };
				};
				const o = bracketMatch.open !== null ? of(bracketMatch.open) : null;
				const c = bracketMatch.close !== null ? of(bracketMatch.close) : null;
				return { open: o, close: c };
			}, [bracketMatch, content]);

			// ── 注释切换：选区涉及的整行加/去 # ──
			const toggleComment = () => {
				const ta = taRef.current;
				if (!ta) return;
				const start = ta.selectionStart;
				const end = ta.selectionEnd;
				const ls = content.split("\n");
				let sLine = 0, acc = 0;
				for (let i = 0; i < ls.length; i++) {
					if (acc + ls[i].length >= start) { sLine = i; break; }
					acc += ls[i].length + 1;
				}
				let eLine = sLine, acc2 = 0;
				for (let i = 0; i < ls.length; i++) {
					if (acc2 + ls[i].length >= Math.max(start, end - 1)) { eLine = i; break; }
					acc2 += ls[i].length + 1;
				}
				const allCommented = (() => {
					for (let i = sLine; i <= eLine; i++) if (!/^\s*#/.test(ls[i])) return false;
					return true;
				})();
				const next = ls.map((l, i) => {
					if (i < sLine || i > eLine) return l;
					const ind = l.match(/^\s*/)[0];
					const rest = l.slice(ind.length);
					if (allCommented) return ind + rest.replace(/^#\s?/, "");
					return ind + "# " + rest;
				}).join("\n");
				onChange(next);
			};

			// ── 代码补全：语句/短语 + 索引符号 + 角色 + 资源 + 片段 ──
			const SNIPPETS = [
				{ label: "menu:", detail: "选择菜单", insert: "menu:\n    \"选项\":\n        pass\n" },
				{ label: "if condition:", detail: "条件分支", insert: "if condition:\n    pass\n" },
				{ label: "elif condition:", detail: "分支", insert: "elif condition:\n    pass\n" },
				{ label: "while condition:", detail: "循环", insert: "while condition:\n    pass\n" },
				{ label: "label name:", detail: "标签", insert: "label name:\n    pass\n" },
				{ label: "define name =", detail: "定义常量", insert: "define name = value\n" },
				{ label: "image name =", detail: "定义图片", insert: "image name = \"path.png\"\n" },
				{ label: "scene", detail: "切换场景", insert: "scene bg name\n    with fade\n" },
				{ label: "show", detail: "显示图片", insert: "show sprite name\n" },
				{ label: "play music", detail: "播放音乐", insert: "play music \"audio.ogg\"\n" },
				{ label: "character:", detail: "定义角色", insert: "define name = Character(\"显示名\")\n" },
				{ label: "transform:", detail: "变换", insert: "transform name:\n    pass\n" },
				{ label: "python:", detail: "Python 块", insert: "python:\n    pass\n" },
				{ label: "text tag {b}", detail: "加粗", insert: "{b}text{/b}" },
				{ label: "text tag {i}", detail: "斜体", insert: "{i}text{/i}" },
				{ label: "text tag {size=}", detail: "字号", insert: "{size=24}text{/size}" },
				{ label: "text tag {color=}", detail: "颜色", insert: "{color=#fff}text{/color}" },
			];
			const buildCompletions = (prefix, forceAll) => {
				const p = (prefix || "").toLowerCase();
				const out = [];
				const push = (label, detail, kind, insert) => {
					if (forceAll || !p || label.toLowerCase().indexOf(p) >= 0) out.push({ label, detail, kind, insert: insert === undefined ? label : insert });
				};
				for (const w of STMT_WORDS) push(w, "语句", "stmt");
				for (const ph of STMT_PHRASES) push(ph, "语句", "stmt");
				for (const s of SNIPPETS) push(s.label, s.detail, "snippet", s.insert);
				const map = indexMapRef.current || {};
				for (const name of Object.keys(map)) push(name, map[name].kind === "characters" ? "人物" : "定义", "ref");
				for (const ch of (chars || [])) push(ch.name, "角色", "char");
				for (const a of (assets.image || [])) push(String(a.rel).split("/").pop(), "图片", "asset");
				for (const a of (assets.audio || [])) push(String(a.rel).split("/").pop(), "音频", "asset");
				for (const gv of GUI_VARS) push("gui." + gv, "GUI 变量", "stmt");
				return out.slice(0, 40);
			};
			// 补全：基于最新文本内容计算（text 由 onChange 传入，避免读 React state 滞后）
			const openCompletionsWith = (text, forceAll) => {
				const ta = taRef.current;
				if (!ta || !active) { setCompletions([]); return; }
				const cur = text === undefined ? ta.value : text;
				const pos = ta.selectionStart;
				let s = pos;
				while (s > 0 && /[A-Za-z0-9_.]/.test(cur[s - 1])) s--;
				const prefix = cur.slice(s, pos);
				if (!prefix && !forceAll) { setCompletions([]); return; }
				const list = buildCompletions(prefix, forceAll);
				if (!list.length) { setCompletions([]); return; }
				const { line, col } = offsetToPos(cur, pos);
				const scroll = ta.scrollTop || 0;
				const cursorY = line * LINE_H() - scroll + 6;
				const h = Math.min(list.length * 22 + 8, 240);
				const top = cursorY + 24 > (ta.clientHeight || 400) - h ? Math.max(6, cursorY - h - 6) : cursorY + 24;
				setCompPos({ left: 8 + col * CHAR_W, top: Math.max(6, top), h });
				setCompletions(list);
				setCompSel(0);
			};
			// 输入/删除/粘贴后防抖触发（用 onChange 的新文本，稳定可靠；setTimeout 而非 rAF——后台/无头环境也执行）
			const compTimerRef = React.useRef(null);
			const scheduleCompletions = (text) => {
				if (compTimerRef.current) clearTimeout(compTimerRef.current);
				compTimerRef.current = setTimeout(function () {
					compTimerRef.current = null;
					openCompletionsWith(text, false);
				}, 0);
			};
			const openCompletions = () => openCompletionsWith(undefined, true); // Ctrl+Space：空前缀也显示全部
			const applyCompletion = () => {
				const ta = taRef.current;
				if (!ta) return;
				const item = completions[compSel];
				if (!item) { setCompletions([]); return; }
				const pos = ta.selectionStart;
				let s = pos;
				while (s > 0 && /[A-Za-z0-9_.]/.test(content[s - 1])) s--;
				const next = content.slice(0, s) + item.insert + content.slice(pos);
				onChange(next);
				setCompletions([]);
				requestAnimationFrame(function () {
					try { ta.focus(); ta.setSelectionRange(s + item.insert.length, s + item.insert.length); } catch (err) { /* ignore */ }
				});
			};

			// ── 查找/替换：匹配计算 + 导航 + 替换 ──
			const findMatches = (() => {
				const list = [];
				if (findText && content) {
					let i = 0;
					while ((i = content.toLowerCase().indexOf(findText.toLowerCase(), i)) >= 0) {
						list.push({ start: i, end: i + findText.length });
						i += Math.max(1, findText.length);
					}
				}
				return list;
			})();
			const findNext = () => { if (findMatches.length) { setFindIdx((findIdx + 1) % findMatches.length); scrollToMatch((findIdx + 1) % findMatches.length); } };
			const findPrev = () => { if (findMatches.length) { const n = (findIdx - 1 + findMatches.length) % findMatches.length; setFindIdx(n); scrollToMatch(n); } };
			const scrollToMatch = (i) => {
				const m = findMatches[i];
				if (!m) return;
				const { line } = offsetToPos(content, m.start);
				jumpToLine(line);
			};
			const doReplace = () => {
				if (!findMatches.length) return;
				const m = findMatches[findIdx];
				const next = content.slice(0, m.start) + findReplace + content.slice(m.end);
				onChange(next);
				// 替换后匹配自动重算；保持当前位置附近
				setTimeout(function () { setFindIdx(Math.max(0, Math.min(findIdx, Math.max(0, findMatches.length - 1)))); }, 0);
			};
			const doReplaceAll = () => {
				if (!findText) return;
				const next = content.split(findText).join(findReplace);
				onChange(next);
			};

			const jumpToLine = (line) => {
				const ta = taRef.current;
				if (!ta) return;
				const ls = ta.value.split("\n");
				let offset = 0;
				for (let i = 0; i < Math.min(line - 1, ls.length); i++) offset += ls[i].length + 1;
				try {
					ta.focus();
					ta.setSelectionRange(offset, offset);
					ta.scrollTop = Math.max(0, (line - 3)) * (ta.scrollHeight / Math.max(1, ls.length));
					if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
					if (preRef.current) preRef.current.scrollTop = ta.scrollTop;
				} catch (e) { /* ignore */ }
			};
			// 跳行 + 落点闪烁高亮（2.2s 后自动消失；记录所属文件，防止切页后闪错文件）
			const flashJumpToLine = (line) => {
				jumpToLine(line);
				setJumpFlash({ file: active ? active.name : null, line, key: Date.now() });
				if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
				jumpTimerRef.current = setTimeout(() => setJumpFlash(null), 2200);
			};

			const parseLintErrors = (output) => {
				const out = [];
				const re = /File\s+"([^"]+)",\s+line\s+(\d+)(?::\s*(.*))?/g;
				let m;
				const seen = {};
				while ((m = re.exec(output))) {
					const key = m[1] + ":" + m[2];
					if (seen[key]) continue;
					seen[key] = true;
					out.push({ file: m[1], line: parseInt(m[2], 10), msg: (m[3] || "").trim() });
				}
				return out.slice(0, 100);
			};

			React.useEffect(() => {
				if (!panelState.project) {
					api("info").then((r) => {
						if (r.sdkPath) {
							const p = r.sdkPath + "/the_question";
							setProject(p);
							loadFiles(p);
							loadAssets(p);
						}
					}).catch((e) => addLog("info error: " + String(e)));
				} else if (!panelState.files.length) {
					loadFiles(panelState.project);
					loadAssets(panelState.project);
				}
				// 打开面板自动索引（若本项目尚未索引）
				api("info").then((r) => {
					if (r.sdkPath) ensureIndex(r.sdkPath + "/the_question");
				}).catch(() => { /* ignore */ });
			}, []);

			// 索引守卫：同一项目只跑一次完整索引（避免切文件重复触发 15s 引擎启动）
			const projectIndexedRef = React.useRef(panelState.projectIndexed || null);
			const ensureIndex = (p) => {
				const target = p || project;
				if (!target) return;
				if (projectIndexedRef.current === target) return;
				projectIndexedRef.current = target;
				doIndex(target);
			};

			const loadFiles = (p) => {
				setBusy(true);
				api("list-files", { project: p }).then((r) => { setFiles(r.files || []); setBusy(false); }).catch((e) => { setBusy(false); addLog("list error: " + String(e)); });
			};

			const loadAssets = (p) => {
				api("assets", {}, { project: p }).then((r) => { setAssets(r || { image: [], audio: [], video: [], font: [], other: [] }); }).catch((e) => addLog("assets error: " + String(e)));
			};

			const assetUrl = (rel) => "/renpy-dev/asset?project=" + encodeURIComponent(project) + "&path=" + encodeURIComponent(rel) + "&session=" + encodeURIComponent(sessionId || "");

			// 项目路径提交：回车/失焦时自动加载、清空旧标签、重新索引；forceP 用于程序化切换工程
			const commitProject = (forceP) => {
				const p = (forceP || project).trim();
				if (!p) return;
				try { if (typeof localStorage !== "undefined") localStorage.setItem("renpy-project", p); } catch (e) { /* ignore */ }
				if (p !== panelState.project) {
					setTabs([]);
					setActiveName(null);
					setLabels([]);
					setLintErrors([]);
					indexMapRef.current = {};
					projectIndexedRef.current = null;
					ensureIndex(p);
				}
				loadFiles(p);
				loadAssets(p);
			};

			// 首次挂载：项目框为空（无本地持久化值）时，用 host 配置的默认工程（renpy.config.json 的 defaultProject）
			React.useEffect(() => {
				if (project) return;
				api("info").then((r) => {
					const d = r && r.defaultProject;
					if (!d) return;
					setProject(d);
					try { if (typeof localStorage !== "undefined") localStorage.setItem("renpy-project", d); } catch (e) { /* ignore */ }
					loadFiles(d);
					loadAssets(d);
				}).catch(() => { /* 静默 */ });
			}, []);

			const openFile = (nm, onLoaded) => {
				ensureIndex(project);
				const existing = tabs.find((t) => t.name === nm);
				if (existing) { setActiveName(nm); if (onLoaded) onLoaded(); return; }
				const path = project + "/game/" + nm;
				setBusy(true);
				api("read-file", { path }).then((r) => {
					setTabs((old) => [...old, { name: nm, content: r.content || "", dirty: false }]);
					setActiveName(nm);
					setBusy(false);
					if (onLoaded) onLoaded();
				}).catch((e) => { setBusy(false); addLog("read error: " + String(e)); });
			};
			// 打开官方文档标签（学习注释跳转）：doc:<page> 特殊标签，显示纯文本
			const openDocTab = (page) => {
				const nm = "doc:" + page;
				const existing = tabs.find((t) => t.name === nm);
				if (existing) { setActiveName(nm); return; }
				setBusy(true);
				api("doc", { page }).then((r) => {
					setBusy(false);
					if (!r.ok) { addLog("文档打开失败: " + (r.error || page)); return; }
					setTabs((old) => [...old, { name: nm, content: r.text || "", dirty: false }]);
					setActiveName(nm);
					addLog("📄 官方文档：" + page + "（" + r.full + " 字符，截取前 12000）");
				}).catch((e) => { setBusy(false); addLog("doc error: " + String(e)); });
			};

			// ── 学习用途 AI 注释（📖 按钮）：批量给当前文件（或工作区域限定范围）的语句行生成 # 📖 学习: 注释
			// 无工作区域 → 整文件；有（wsLock 匹配当前文件）→ 限定 startLine-endLine。消耗 AI 资源 → 弹确认
			const [learnConfirm, setLearnConfirm] = React.useState(null); // {targets, scopeLabel} 待确认
			const [learnBusy, setLearnBusy] = React.useState(false);
			const [learnResult, setLearnResult] = React.useState(null); // {added, failed, scopeLabel}
			// 校验位置在工作区域内（区域含 targetLine 且块不越界）
			const learnInRange = (targetLine, blockLines) => {
				if (!(wsLock && wsLock.file === activeName)) return true;
				return targetLine >= wsLock.startLine && targetLine + (blockLines || 0) - 1 <= wsLock.endLine;
			};
			// 收集目标行：learnNotes 中非注释/空行 + 无既有注释块 + 在范围内
			const collectLearnTargets = () => {
				if (!active || !learnNotes) return { targets: [], scopeLabel: "" };
				const inWs = !!(wsLock && wsLock.file === activeName);
				const lines = String(active.content).split("\n");
				const targets = [];
				for (const n of learnNotes) {
					if (!n.note || n.kind === "comment" || n.kind === "blank") continue;
					if (n.kind === "other") continue; // 无法识别语句不给 AI 注释
					if (inWs && (n.line < wsLock.startLine || n.line > wsLock.endLine)) continue;
					if (findLearnBlock(active.content, n.line)) continue; // 已有注释跳过
					targets.push({
						line: n.line,
						code: lines[n.line - 1],
						skill: n.skill ? n.skill.split("·")[0].trim() : "",
						context: lines.slice(Math.max(0, n.line - 3), Math.min(lines.length, n.line + 2)).join("\n"),
					});
				}
				const scopeLabel = inWs ? ("工作区域 L" + wsLock.startLine + "-" + wsLock.endLine) : "整个文件";
				return { targets, scopeLabel };
			};
			const startTeach = () => {
				if (!active || learnBusy) return;
				const { targets, scopeLabel } = collectLearnTargets();
				if (!targets.length) { addLog("📖 没有可注释的语句行（区域内均已注释或无可识别语句）"); return; }
				setLearnResult(null);
				setLearnConfirm({ targets, scopeLabel });
			};
			const cancelTeach = () => setLearnConfirm(null);
			const confirmTeach = () => {
				if (!learnConfirm) return;
				const { targets, scopeLabel } = learnConfirm;
				setLearnConfirm(null);
				setLearnBusy(true);
				addLog("📖 正在为 " + scopeLabel + " 生成 " + targets.length + " 条 AI 学习注释…");
				api("teach-file", {}, { file: active.name, lines: targets }).then((r) => {
					setLearnBusy(false);
					if (!r.ok) { addLog("AI 教学失败: " + (r.error || "?")); return; }
					// 从下往上插入（行号从大到小，避免偏移）
					const okResults = (r.results || []).filter((x) => x.ok);
					const failResults = (r.results || []).filter((x) => !x.ok);
					okResults.sort((a, b) => b.line - a.line);
					// 基于原 content，从下往上逐行插入（后面的插入不影响已插入的下面行）
					let curContent = String(active.content);
					let added = 0;
					for (const x of okResults) {
						curContent = insertLearnComment(curContent, x.line, x.text || "", x.skill || "renpy");
						added++;
					}
					onChange(curContent);
					const failMsg = failResults.length ? ("；失败 " + failResults.length + " 条" + (failResults[0] && failResults[0].error ? "（例：" + failResults[0].error.slice(0, 80) + "）" : "")) : "";
					addLog("✅ 已写入 " + added + " 条学习注释（" + scopeLabel + failMsg + "）");
					setLearnResult({ added, failed: failResults.length, scopeLabel });
				}).catch((e) => { setLearnBusy(false); addLog("teach-file error: " + String(e)); });
			};
			// 清除当前文件（或区域内）全部学习注释
			const clearLearnAll = () => {
				if (!active || learnBusy) return;
				const inWs = !!(wsLock && wsLock.file === activeName);
				const lines = String(active.content).split("\n");
				const toStrip = [];
				for (let i = 0; i < lines.length; i++) {
					if (lines[i].trim().indexOf(LEARN_MARK) !== 0) continue;
					if (inWs && (i + 1 < wsLock.startLine || i + 1 > wsLock.endLine)) continue;
					toStrip.push(i + 1);
				}
				if (!toStrip.length) { addLog("🗑 没有可清除的学习注释" + (inWs ? "（区域内）" : "")); return; }
				let cur = String(active.content);
				for (let i = toStrip.length - 1; i >= 0; i--) cur = stripLearnComment(cur, toStrip[i]);
				onChange(cur);
				addLog("🗑 已清除 " + toStrip.length + " 条学习注释" + (inWs ? "（区域内）" : ""));
				setLearnResult(null);
			};

			const closeTab = (nm) => {
				if (conflictRef.current === nm) conflictRef.current = null;
				setTabs((old) => {
					const i = old.findIndex((t) => t.name === nm);
					if (i < 0) return old;
					const next = old.filter((t) => t.name !== nm);
					if (activeName === nm) {
						const neighbor = next[Math.max(0, i - 1)] || next[0] || null;
						setActiveName(neighbor ? neighbor.name : null);
					}
					return next;
				});
			};

			const onChange = (v) => {
				// 工作区域锁定：编辑光标所在行在区域外则拒绝（保持旧内容）
				const curPos = taRef.current ? taRef.current.selectionStart : 0;
				if (wsLock && wsLock.file === activeName && !wsChangeInRange(content, v, wsLock.startLine, wsLock.endLine, curPos)) {
					setCompletions([]);
					addLog("🎯 修改超出工作范围（L" + wsLock.startLine + "-" + wsLock.endLine + "），已阻止");
					return; // 不更新 tabs → 文本恢复旧值
				}
				setTabs((old) => old.map((t) => (t.name === activeName ? { ...t, content: v, dirty: true } : t)));
				scheduleCompletions(v); // 输入/删除/粘贴后按最新文本触发补全
			};

			const saveFile = () => {
				if (!active || isViewTab) return; // teach:/doc: 只读视图标签不可保存
				setBusy(true);
				setSavedSnap({ name: active.name, content: content }); // 保存前快照：可回退到保存前
				api("write-file", {}, { path: project + "/game/" + active.name, content: content }).then((r) => {					setBusy(false);
					setTabs((old) => old.map((t) => (t.name === activeName ? { ...t, dirty: false } : t)));
					addLog("saved " + active.name);
					autoCp("手动保存"); // 手动修改后自动更新检查点基线
					// 保存后防抖重新索引（连续保存合并为一次）
					if (reindexTimerRef.current) clearTimeout(reindexTimerRef.current);
					reindexTimerRef.current = setTimeout(function () {
						projectIndexedRef.current = null;
						ensureIndex(project);
					}, 2000);
				}).catch((e) => { setBusy(false); addLog("save error: " + String(e)); });
			};

			// 撤回未保存的修改：恢复到上次保存（savedSnap）的内容
			const revertUnsaved = () => {
				if (!active) return;
				const base = (savedSnap && savedSnap.name === activeName) ? savedSnap.content : "";
				setTabs((old) => old.map((t) => (t.name === activeName ? { ...t, content: base, dirty: false } : t)));
				setCompletions([]);
				addLog("已撤回未保存的修改");
			};

			// ── 工作区域：锁定编辑范围（选区→区域；区域外只读）+ 对话注入 ──
			const offsetLine = (text, offset) => 1 + (text.slice(0, offset).match(/\n/g) || []).length;
			const lockWorkspace = () => {
				const ta = taRef.current;
				if (!ta || !active || !project) return;
				const s = Math.min(ta.selectionStart, ta.selectionEnd);
				const e = Math.max(ta.selectionStart, ta.selectionEnd);
				const startLine = offsetLine(content, s);
				const endLine = e > s ? offsetLine(content, e - 1) : startLine;
				api("workspace-set", {}, { project, file: active.name, startLine, endLine }).then((r) => {
					setWsLock(r.workspace || { file: active.name, startLine, endLine });
					addLog("🎯 已设定工作范围: " + active.name + " L" + startLine + "-" + endLine + "（修改限定在此范围内，已通知 agent）");
				}).catch((e) => addLog("workspace error: " + String(e)));
			};
			const clearWorkspace = () => {
				if (!project) return;
				api("workspace-clear", {}, { project }).then((r) => {
					setWsLock(null);
					addLog("工作范围已清除");
				}).catch((e) => addLog("workspace error: " + String(e)));
			};
			// 加载项目时恢复工作区域 UI；不主动注入——首次发送对话时才注入（延迟注入）
			const pendingWsInjectRef = React.useRef(false);
			const wsInjKeyRef = React.useRef("");
			const wsVerRef = React.useRef("");
			React.useEffect(() => {
				if (!project) return;
				api("workspace-get", {}, { project }).then((r) => {
					const w = r && r.workspace;
					if (w && w.active) setWsLock({ file: w.file, startLine: w.startLine, endLine: w.endLine, label: w.label || "" });
					try {
						const key = "renpy-ws-inj-" + (sessionId || "") + "-" + project;
						const last = localStorage.getItem(key);
						const ver = (w && w.active) ? String(w.updatedAt || "") : "cleared";
						wsInjKeyRef.current = key;
						wsVerRef.current = ver;
						pendingWsInjectRef.current = !!(w && w.active) && last !== ver;
					} catch (e) { pendingWsInjectRef.current = false; }
				}).catch(() => { /* 静默 */ });
			}, [project]);

			// ── 检查点（自动、持久）：每个对话/手动保存建一个，全部保留，用于恢复 ──
			const refreshCp = (id) => {
				const target = id || cpActive;
				if (!target || !project) return;
				api("checkpoint-diff", {}, { project, id: target }).then((r) => {
					setCpDiff(r || { files: [], summary: { files: 0, added: 0, removed: 0 } });
				}).catch((e) => addLog("checkpoint diff error: " + String(e)));
			};
			// 只刷新检查点列表（不刷 diff，供对话页签时间线轮询）
			const refreshCpList = () => {
				if (!project) return;
				api("checkpoint-list", {}, { project }).then((r) => {
					setCpList(r || []);
				}).catch(() => { /* 静默 */ });
			};
			const loadCpList = () => {
				api("checkpoint-list", {}, { project }).then((r) => {
					const list = r || [];
					setCpList(list);
					if (list.length) {
						const cur = cpActive && list.some((c) => c.id === cpActive) ? cpActive : list[0].id;
						setCpActive(cur);
						refreshCp(cur);
					} else {
						setCpActive(null);
						setCpDiff(null);
					}
				}).catch((e) => addLog("checkpoint list error: " + String(e)));
			};
			// 自动检查点：防抖 1.5s 合并；对话结束或手动保存后触发（持久保留全部）
			const autoCpTimerRef = React.useRef(null);
			const autoCp = (why) => {
				if (!project) return;
				if (autoCpTimerRef.current) clearTimeout(autoCpTimerRef.current);
				autoCpTimerRef.current = setTimeout(() => {
					api("checkpoint-create", {}, { project }).then((r) => {
						setCpList((prev) => [{ id: r.id, files: r.files }, ...(prev || []).filter((c) => c.id !== r.id)]);
						setCpActive(r.id);
						refreshCp(r.id);
						addLog("检查点已建立（" + why + "）：" + r.files + " 个文件");
					}).catch((e) => addLog("checkpoint auto error: " + String(e)));
				}, 1500);
			};
			// 对话回合结束检测：feed 最后一条是助手消息且连续 3 次轮询（约 9s）未变 → 视为对话结束（
			// 只对 assistant 计稳定：注入的工作区域/用户消息等 user 消息不触发检查点）
			const lastChatKeyRef = React.useRef("");
			const chatStableRef = React.useRef(0);
			const detectTurnEnd = (chat) => {
				const last = chat && chat.length ? chat[chat.length - 1] : null;
				if (!last || last.t !== "assistant") { lastChatKeyRef.current = ""; chatStableRef.current = 0; return; }
				const key = String(last.id || last.text || "");
				if (!key) return;
				if (key !== lastChatKeyRef.current) {
					lastChatKeyRef.current = key;
					chatStableRef.current = 0;
					return;
				}
				chatStableRef.current++;
				if (chatStableRef.current >= 3) {
					chatStableRef.current = -1000000; // 同一消息只触发一次
					autoCp("对话结束");
				}
			};
			const openCpPanel = () => {
				if (!project) return;
				setCpOpen(true);
				loadCpList();
			};
			const pickCp = (id) => {
				setCpActive(id);
				setCpExpanded({});
				refreshCp(id);
			};
			const acceptCp = (rel) => {
				if (!cpActive) return;
				setBusy(true);
				api("checkpoint-accept", {}, { project, id: cpActive, rel: rel || undefined }).then((r) => {
					setBusy(false);
					addLog(rel ? ("已通过 " + rel) : "已全部通过修改");
					refreshCp(cpActive);
				}).catch((e) => { setBusy(false); addLog("accept error: " + String(e)); });
			};
			const revertCp = (rel) => {
				if (!cpActive) return;
				setBusy(true);
				api("checkpoint-revert", {}, { project, id: cpActive, rel: rel || undefined }).then((r) => {
					setBusy(false);
					addLog(rel ? ("已撤回 " + rel) : "已全部撤回修改");
					const name = rel || activeName;
					if (name && tabs.some((t) => t.name === name)) {
						api("read-file", { path: project + "/game/" + name }).then((rr) => {
							setTabs((old) => old.map((t) => (t.name === name ? { ...t, content: rr.content || "", dirty: false } : t)));
						}).catch((e) => addLog("reload error: " + String(e)));
					}
					refreshCp(cpActive);
				}).catch((e) => { setBusy(false); addLog("revert error: " + String(e)); });
			};
			const jumpCpFile = (rel, line) => {
				const fileShort = rel.replace(/^game\//, "");
				if (fileShort !== activeName) {
					pendingJump.current = line;
					openFile(fileShort);
				} else {
					flashJumpToLine(line);
				}
			};
			// 轨迹编辑条目 → 打开左侧编辑器并定位到修改位置（edit 用 old_string 首行定位）
			const jumpTrailEdit = (t) => {
				if (!t.file || !project) return;
				const fileShort = String(t.file).replace(/^game\//, "").replace(/\\/g, "/");
				const doOpen = (line) => {
					const target = line || 1;
					if (fileShort !== activeName) { pendingJump.current = target; openFile(fileShort); }
					else jumpToLine(target);
				};
				if (t.kind === "edit" && t.args) {
					const m = /"old_string"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(t.args);
					if (m) {
						const needle = m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\").slice(0, 300);
						api("read-file", { path: project + "/game/" + fileShort }).then((r) => {
							const c = (r && r.content) || "";
							const idx = needle ? c.indexOf(needle) : -1;
							doOpen(idx >= 0 ? 1 + (c.slice(0, idx).match(/\n/g) || []).length : 1);
						}).catch(() => doOpen(1));
						return;
					}
				}
				doOpen(1);
			};
			// ── 保存历史：打开列表 / 预览版本 / 一键恢复 ──
			const openHistory = () => {
				if (!active || !project) return;
				setBusy(true);
				api("history", {}, { project, rel: active.name }).then((r) => {
					setBusy(false);
					setHistVersions(r.versions || []);
					setHistPreview(null);
					setHistOpen(true);
				}).catch((e) => { setBusy(false); addLog("history error: " + String(e)); });
			};
			const previewHistory = (time) => {
				api("history-read", {}, { project, rel: active.name, time }).then((r) => {
					setHistPreview({ time, content: r.content || "" });
				}).catch((e) => addLog("preview error: " + String(e)));
			};
			const restoreHistory = (time) => {
				setBusy(true);
				api("restore", {}, { project, rel: active.name, time }).then((r) => {
					setBusy(false);
					addLog("已恢复 " + active.name + " → " + fmtStamp(time));
					setHistOpen(false);
					setHistPreview(null);
					// 强制重新读取恢复后的内容
					api("read-file", { path: project + "/game/" + active.name }).then((rr) => {
						setTabs((old) => old.map((t) => (t.name === active.name ? { ...t, content: rr.content || "", dirty: false } : t)));
					}).catch((e) => addLog("reload error: " + String(e)));
					if (reindexTimerRef.current) clearTimeout(reindexTimerRef.current);
					reindexTimerRef.current = setTimeout(function () {
						projectIndexedRef.current = null;
						ensureIndex(project);
					}, 2000);
				}).catch((e) => { setBusy(false); addLog("restore error: " + String(e)); });
			};

			const doLint = () => {
				setBusy(true);
				api("lint", {}, { project }).then((r) => {
					setBusy(false);
					addLog("lint exit=" + String(r.exitCode));
					const errs = parseLintErrors(r.output || "");
					setLintErrors(errs);
					setLog((old) => old + "\n" + String(r.output || "").slice(0, 4000));
				}).catch((e) => { setBusy(false); addLog("lint error: " + String(e)); });
			};
			// 自动化测试（rpytest）：跑项目 test suite，解析结果
			const [testReport, setTestReport] = React.useState(null); // {status, passed, failed, output}
			// ── 学习用途 AI 注释（📖 按钮：批量生成 # 📖 学习: 注释，受工作区域限制） ──
			const learnNotes = React.useMemo(() => {
				if (!active) return null;
				return renpyLearnNotes(active.content);
			}, [active]);
			const doTest = () => {
				setBusy(true);
				setTestReport(null);
				api("test", {}, { project }).then((r) => {
					setBusy(false);
					setTestReport({ status: r.status, passed: r.passed, failed: r.failed, output: r.output || "" });
					addLog("test: " + (r.status || "?") + (r.passed !== null ? " (" + r.passed + " passed" + (r.failed ? ", " + r.failed + " failed" : "") + ")" : ""));
				}).catch((e) => { setBusy(false); addLog("test error: " + String(e)); });
			};

			const doRun = () => api("run", {}, { project }).then((r) => addLog("run: " + String(r.started ? "started" : "?"))).catch((e) => addLog("run error: " + String(e)));

			const sendMsg = () => {
				const text = msg.trim();
				if (!text || !props.inputActions) return;
				const doSend = () => {
					try {
						props.inputActions.setDraft(text);
						props.inputActions.submit();
						setMsg("");
					} catch (e) { addLog("发送失败: " + String((e && e.message) || e)); }
				};
				// 延迟注入：新会话不主动发初始信息，发送第一条消息时先注入工作区域约束
				if (pendingWsInjectRef.current) {
					pendingWsInjectRef.current = false;
					api("workspace-inject", {}, { project }).then(() => {
						try { localStorage.setItem(wsInjKeyRef.current, String(wsVerRef.current)); } catch (e) { /* ignore */ }
						doSend();
					}).catch(() => doSend()); // 注入失败不阻塞发送
				} else {
					doSend();
				}
			};
			const doStop = () => api("stop", {}, { project }).then((r) => addLog("stop: " + String(r.stopped ? "stopped" : "none"))).catch((e) => addLog("stop error: " + String(e)));
			const doShot = () => {
				setBusy(true);
				api("screenshot", {}, {}).then((r) => { setBusy(false); if (r.error) { addLog(r.error); return; } setShot(r.dataBase64 || null); addLog("screenshot -> " + String(r.file)); }).catch((e) => { setBusy(false); addLog("shot error: " + String(e)); });
			};
			const doIndex = (p) => {
				const target = p || project;
				setBusy(true);
				api("index", {}, { project: target }).then((r) => {
					setBusy(false);
					if (r.error) { addLog("index error: " + r.error); return; }
					setLabels(r.labels || []);
					setChars(r.characters || []);
					setTrans(r.transitions || []);
					setVars(r.variables || []);
					const map = {};
					["labels", "characters", "transitions", "variables", "screens"].forEach((kind) => {
						(r[kind] || []).forEach((e) => { map[e.name] = { file: e.file, line: e.line, kind: kind }; });
					});
					indexMapRef.current = map;
					const c = r.counts || {};
					addLog("索引完成: " + String(c.labels || 0) + " labels, " + String(c.characters || 0) + " 人物, " + String(c.transitions || 0) + " 转场, " + String(c.variables || 0) + " 变量");
				}).catch((e) => { setBusy(false); addLog("index error: " + String(e)); });
			};
			const jumpFromError = (e) => {
				const fileShort = e.file.replace(/^game\//, "");
				if (fileShort !== activeName) {
					pendingJump.current = e.line;
					openFile(fileShort);
				} else {
					flashJumpToLine(e.line);
				}
			};
			const jumpFromLabel = (l) => {
				const fileShort = l.file.replace(/^game\//, "");
				if (fileShort !== activeName) {
					pendingJump.current = l.line;
					openFile(fileShort);
				} else {
					flashJumpToLine(l.line);
				}
			};

			// 通用跳转：条目 {file, line}
			const jumpEntry = (e) => {
				const fileShort = e.file.replace(/^game\//, "");
				if (fileShort !== activeName) {
					pendingJump.current = e.line;
					openFile(fileShort);
				} else {
					flashJumpToLine(e.line);
				}
			};

			// Ctrl+点击：取光标处单词 → 索引查找 → 跳定义
			const wordAt = (text, pos) => {
				if (!text || pos < 0 || pos > text.length) return null;
				let s = pos, e = pos;
				while (s > 0 && /[A-Za-z0-9_.]/.test(text[s - 1])) s--;
				while (e < text.length && /[A-Za-z0-9_.]/.test(text[e])) e++;
				const w = text.slice(s, e);
				return w && w.length ? w : null;
			};
			const onEditorMouseUp = (e) => {
				if (!e.ctrlKey) {
					// 样式预览模式：点击 say 行 → 播放打字动画预览（出字速度/间隔）
					if (stylePreview) {
						const ta = taRef.current;
						if (ta) {
							const lineNo = offsetLine(content, ta.selectionStart);
							const r = renpyTextPreview((content.split("\n")[lineNo - 1] || "").trim());
							if (r) { setAnimLine(lineNo); setAnimSeq((s) => s + 1); }
						}
					}
					return;
				}
				const ta = taRef.current;
				if (!ta) return;
				const pos = ta.selectionStart;
				const w = wordAt(content, pos);
				if (!w) return;
				const hit = indexMapRef.current[w];
				if (hit) {
					addLog("跳转 " + w + " -> " + hit.file + ":" + hit.line);
					jumpEntry(hit);
				} else {
					addLog("未找到定义: " + w);
				}
			};

			// 打开新标签后执行待跳转（pendingJump 可为行号数字或 {file, line}；目标文件未激活则等待）
			React.useEffect(() => {
				if (pendingJump.current && active) {
					const jl = pendingJump.current;
					if (typeof jl === "object" && jl.file !== active.name) return; // 目标文件尚未激活，等它激活再闪
					pendingJump.current = null;
					flashJumpToLine(typeof jl === "object" ? jl.line : jl);
				}
			}, [activeName]);

			// DSH 主题变量（亮暗自适应，原生 token）
			const tv = (n) => "var(" + n + ")";
			const UI = tv("--dsw-font-family");
			const CODE = tv("--ds-font-family-code");
			const BORDER = tv("--dsw-alias-border-l1");
			const BORDER2 = tv("--dsw-alias-border-l2");
			const TXT = tv("--dsw-alias-label-primary");
			const TXT2 = tv("--dsw-alias-label-secondary");
			const TXT3 = tv("--dsw-alias-label-tertiary");
			const ACCENT = tv("--dsw-alias-brand-primary");
			const BG = tv("--dsw-alias-bg-base");
			const LAYER = tv("--dsw-alias-bg-layer-1");
			const LAYER2 = tv("--dsw-alias-bg-layer-2");
			const SIDEFILL = tv("--dsw-specific-sidebar-fill");
			const GHOST = tv("--dsw-alias-button-ghost-active-fill");
			const HOVER = tv("--dsw-alias-interactive-bg-hover");
			const BUBBLE = tv("--dsw-specific-bubble");
			const INPUTBG = tv("--dsw-specific-input-major");
			const CODEBLK = tv("--dsw-alias-markdown-code-block");
			const SUCCESS = tv("--dsw-alias-state-success-primary");
			const ERRCOL = tv("--dsw-alias-state-error-primary");
			const BUSCOL = tv("--dsw-alias-state-business-primary");

			const [hoverRow, setHoverRow] = React.useState(null);
			const [hoverMsgId, setHoverMsgId] = React.useState(null);
			const [expandedReason, setExpandedReason] = React.useState({});
			const composerRef = React.useRef(null);
			// ── 类 VSCode 布局：活动视图切换 + 光标位置（状态栏） ──
			const [activeView, setActiveView] = React.useState("files");
			const [expandedFiles, setExpandedFiles] = React.useState({}); // 文件树目录展开态
			const [cursorPos, setCursorPos] = React.useState({ line: 1, col: 1 });
			// 素材预览浮窗拖动
			const [floatPos, setFloatPos] = React.useState(null); // {x, y} 相对面板
			const floatRef = React.useRef(null);
			const rootRef = React.useRef(null);
			const colRRef = React.useRef(null);
			const dragRef = React.useRef(null);
			// Ren'Py 语句 → Python 等价（编辑器内转换浮窗）
			const [pyConv, setPyConv] = React.useState(null); // {rpy, py, note}
			// 文本样式预览模式（所见即所得：编辑器内 say 文本直接显示样式）+ 降级提示汇总
			const [stylePreview, setStylePreview] = React.useState(false);
			// 打字动画预览（出字速度/间隔）：预览模式下点击 say 行播放
			const [animLine, setAnimLine] = React.useState(null); // 行号
			const [animSeq, setAnimSeq] = React.useState(0); // 重播计数
			const [animProg, setAnimProg] = React.useState(null); // {ni, ci} 播放进度
			const animTimerRef = React.useRef(null);
			// 动画浮窗：可拖动 + 初始定位到编辑器区域（colR）
			const [animPos, setAnimPos] = React.useState(null); // {x, y} 相对面板
			const animRef = React.useRef(null);
			const animDragRef = React.useRef(null);
			React.useEffect(() => {
				if (animLine === null || animPos !== null) return;
				const colR = colRRef.current;
				const root = rootRef.current;
				if (colR && root) {
					const cr = colR.getBoundingClientRect();
					const rr = root.getBoundingClientRect();
					const x = Math.max(cr.left - rr.left + 4, cr.right - rr.left - 444);
					const y = Math.max(cr.top - rr.top + 52, cr.bottom - rr.top - 340);
					setAnimPos({ x, y });
				}
			}, [animLine, animPos]);
			const onAnimDown = (e) => {
				const el = animRef.current;
				const root = rootRef.current;
				if (!el || !root) return;
				e.preventDefault();
				const rootRect = root.getBoundingClientRect();
				const rect = el.getBoundingClientRect();
				animDragRef.current = { startX: e.clientX, startY: e.clientY, left: rect.left - rootRect.left, top: rect.top - rootRect.top };
				const move = (ev) => {
					if (!animDragRef.current) return;
					setAnimPos({ x: animDragRef.current.left + (ev.clientX - animDragRef.current.startX), y: animDragRef.current.top + (ev.clientY - animDragRef.current.startY) });
				};
				const up = () => {
					animDragRef.current = null;
					document.removeEventListener("mousemove", move);
					document.removeEventListener("mouseup", up);
				};
				document.addEventListener("mousemove", move);
				document.addEventListener("mouseup", up);
			};
			// 动画预览数据：当前行解析 + 默认速度（项目配置：角色 what_slow_cps > what_style 样式 > say_dialogue > 20）
			const [textCfg, setTextCfg] = React.useState(null); // parseTextCfg 结果
			const textCfgScannedRef = React.useRef(null);
			React.useEffect(() => {
				if (!project || textCfgScannedRef.current === project) return;
				textCfgScannedRef.current = project;
				api("list-files", { project }).then((r) => {
					const names = (r.files || []).slice(0, 200);
					return Promise.all(names.map((nm) => api("read-file", { path: project + "/game/" + nm }).then((rr) => ({ name: nm, content: rr.content || "" })).catch(() => null))).then((fs) => {
						setTextCfg(parseTextCfg(fs.filter(Boolean)));
					});
				}).catch(() => { /* 扫描失败保持默认 */ });
			}, [project]);
			const resolveDefaultCps = (who) => {
				const cfg = textCfg;
				if (cfg) {
					const c = who ? cfg.charCps[who] : null;
					if (c && c.cps !== null) return c.cps * (c.mult || 1);
					const style = c && c.style ? cfg.styleCps[c.style] : cfg.styleCps["say_dialogue"];
					if (style && style.cps !== null) return style.cps * (style.mult || 1);
					if (cfg.globalCps !== null) return cfg.globalCps;
				}
				return 20;
			};
			const animData = React.useMemo(() => {
				if (animLine === null) return null;
				const line = (content.split("\n")[animLine - 1] || "").trim();
				const r = renpyTextPreview(line);
				if (!r) return null;
				const cpsNode = r.nodes.find((n) => n.style && n.style.cps);
				const def = resolveDefaultCps(r.who);
				const src = cpsNode ? "标签 {cps}" : textCfg && (textCfg.charCps[r.who] || textCfg.styleCps["say_dialogue"]) ? "项目配置" : "默认 20";
				return { nodes: r.nodes, cps: cpsNode ? cpsNode.style.cps : def, src, who: r.who };
			}, [animLine, content, textCfg]);
			const previewNotes = React.useMemo(() => {
				if (!stylePreview) return [];
				const seen = {};
				const out = [];
				for (const line of content.split("\n")) {
					const r = renpyTextPreview(line.trim());
					if (!r) continue;
					for (const n of r.notes) {
						// 字体：项目内有该文件 → 真实渲染（不再提示降级）；没有 → 明确"文件不存在"
						let msg = n.msg;
						if (n.kind === "font") {
							const fm = /font=([^}]+)/.exec(n.msg);
							const name = fm ? fm[1] : "";
							if (fontMap[name]) continue;
							msg = "字体文件不存在于项目：" + name;
						}
						const key = n.kind + "|" + msg;
						if (!seen[key]) { seen[key] = true; out.push(Object.assign({}, n, { msg })); }
					}
				}
				return out;
			}, [content, stylePreview, fontMap]);
			// 预览模式下收集 {font=} 引用 → 后台加载字体（加载完成 setFontTick 触发重渲染，{font} 变为真实字体）
			const fontsNeeded = React.useMemo(() => {
				if (!stylePreview) return [];
				const out = [];
				for (const line of content.split("\n")) {
					const r = renpyTextPreview(line.trim());
					if (!r) continue;
					for (const n of r.nodes) {
						const f = n.style && n.style.font;
						if (f && fontMap[f] && out.indexOf(fontMap[f]) < 0) out.push(fontMap[f]);
					}
				}
				return out;
			}, [content, stylePreview, fontMap]);
			React.useEffect(() => {
				if (!stylePreview) return;
				for (const rel of fontsNeeded) ensureFont(rel);
			}, [fontsNeeded, stylePreview]);
			// 打字动画播放器：逐字显示（text 段按 cps 速度；pause 段按 {w}/{p} 秒数停顿）
			React.useEffect(() => {
				if (animLine === null) return;
				const line = (content.split("\n")[animLine - 1] || "").trim();
				const r = renpyTextPreview(line);
				if (!r) { setAnimLine(null); return; }
				const nodes = r.nodes;
				let ni = 0, ci = 0, cancelled = false;
				setAnimProg({ ni: 0, ci: 0 });
				const step = () => {
					if (cancelled) return;
					while (ni < nodes.length) {
						const n = nodes[ni];
						if (n.t === "text") {
							if (ci < n.s.length) {
								ci++;
								setAnimProg({ ni, ci });
								const cps = (n.style && n.style.cps) || 20;
								animTimerRef.current = setTimeout(step, Math.max(20, 1000 / cps));
								return;
							}
							ci = 0; ni++;
						} else if (n.t === "pause") {
							setAnimProg({ ni, ci: 0 });
							const ms = n.sec !== null ? n.sec * 1000 : 500;
							ni++;
							animTimerRef.current = setTimeout(step, ms);
							return;
						} else {
							setAnimProg({ ni, ci: 0 });
							ni++;
							animTimerRef.current = setTimeout(step, 30);
							return;
						}
					}
					// 播放完成：保留完整文本（ni = 节点总数），渲染层据此显示全量 + ✓ 标记
					setAnimProg({ ni: nodes.length, ci: 0 });
				};
				step();
				return () => { cancelled = true; if (animTimerRef.current) clearTimeout(animTimerRef.current); };
			}, [animLine, animSeq, content]);
			// 初始定位到编辑器区域（colR）右下角，而不是整个面板最右（避免落在对话侧栏上方）
			React.useEffect(() => {
				if (!(previewImg || previewAudio || previewFont) || floatPos !== null) return;
				const colR = colRRef.current;
				const root = rootRef.current;
				if (colR && root) {
					const cr = colR.getBoundingClientRect();
					const rr = root.getBoundingClientRect();
					const x = Math.max(cr.left - rr.left + 4, cr.right - rr.left - 334);
					const y = Math.max(cr.top - rr.top + 4, cr.bottom - rr.top - 300);
					setFloatPos({ x, y });
				}
			}, [previewImg, previewAudio, previewFont, floatPos]);
			const onFloatDown = (e) => {
				const el = floatRef.current;
				const root = rootRef.current;
				if (!el || !root) return;
				e.preventDefault();
				const rootRect = root.getBoundingClientRect();
				const rect = el.getBoundingClientRect();
				dragRef.current = { startX: e.clientX, startY: e.clientY, left: rect.left - rootRect.left, top: rect.top - rootRect.top };
				const move = (ev) => {
					if (!dragRef.current) return;
					setFloatPos({ x: dragRef.current.left + (ev.clientX - dragRef.current.startX), y: dragRef.current.top + (ev.clientY - dragRef.current.startY) });
				};
				const up = () => {
					dragRef.current = null;
					document.removeEventListener("mousemove", move);
					document.removeEventListener("mouseup", up);
				};
				document.addEventListener("mousemove", move);
				document.addEventListener("mouseup", up);
			};
			const trackCursor = () => {
				const ta = taRef.current;
				if (!ta) return;
				const pos = ta.selectionStart;
				const before = ta.value.slice(0, pos);
				const ls = before.split("\n");
				setCursorPos({ line: ls.length, col: ls[ls.length - 1].length + 1 });
				// 括号匹配：光标旁是括号 → 找配对（trackCursor 无事件参数，用 ta.value 而非 content state）
				const mm = findMatchingBracket(ta.value, pos);
				if (mm) {
					setBracketMatch(mm);
				} else if (bracketMatch) {
					setBracketMatch(null);
				}
			};
			// 转换光标所在行的 Ren'Py 语句 → Python 等价
			const convertCurrentLine = () => {
				const ta = taRef.current;
				if (!ta || !active) return;
				const pos = ta.selectionStart;
				const lineNo = offsetLine(content, pos);
				const line = (content.split("\n")[lineNo - 1] || "").trim();
				const conv = renpyToPython(line);
				if (!conv) { setPyConv(null); addLog("当前行不是可转换的 Ren'Py 语句: " + line); return; }
				setPyConv({ rpy: line, py: conv.py, note: conv.note, line: lineNo });
			};

			// 资源文件夹树：分类根（key 无 "/"）默认展开，子目录默认折叠
			const assetCats = [["image", "图片"], ["audio", "音频"], ["video", "视频"], ["font", "字体"], ["other", "其他"]];
			const assetTrees = React.useMemo(() => {
				const t = {};
				for (const [c] of assetCats) t[c] = buildAssetTree(assets[c] || []);
				return t;
			}, [assets]);
			const isOpen = (key) => (expanded[key] !== undefined ? expanded[key] : key.indexOf("/") < 0);
			const toggleTree = (key) => setExpanded((prev) => {
				const n = { ...prev };
				n[key] = !(prev[key] !== undefined ? prev[key] : key.indexOf("/") < 0);
				return n;
			});

			// 滚动分离：每个区域独立 overflow，父链全部 minHeight:0 允许收缩。
			// 关键：外层 flex-basis 必须为 0（不能 height:100% / basis auto）——
			// 宿主 active 阶段 viewArea 是 min-height:auto（高度由内容决定），
			// height:100% 在那里退化为 auto，面板会被内容撑开导致整页一起滚。
			const row = { display: "flex", gap: 8, padding: "7px 12px", alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid " + BORDER, background: LAYER, color: TXT };
			const colL = { width: 200, flexShrink: 0, minHeight: 0, borderRight: "1px solid " + BORDER, overflow: "auto", padding: 4, background: LAYER, color: TXT };
			const colR = { flex: "1 1 0", minWidth: 0, minHeight: 0, maxWidth: "100%", display: "flex", flexDirection: "column", background: BG, color: TXT, overflow: "hidden" };
			const btn = { padding: "3px 10px", cursor: "pointer", background: "transparent", color: TXT, border: "1px solid " + BORDER, borderRadius: 6, fontSize: 13, lineHeight: 1.5, whiteSpace: "nowrap", fontFamily: "inherit" };
			const btnPrimary = { padding: "3px 12px", cursor: "pointer", background: ACCENT, color: "#fff", border: "1px solid " + ACCENT, borderRadius: 6, fontSize: 13, lineHeight: 1.5, whiteSpace: "nowrap", fontFamily: "inherit" };
			const iconBtn = { padding: "4px 9px", cursor: "pointer", background: "transparent", color: TXT2, border: "1px solid transparent", borderRadius: 6, fontSize: 14, lineHeight: 1, whiteSpace: "nowrap" };
			const iconBtnAct = { ...iconBtn, background: GHOST, color: ACCENT, border: "1px solid " + BORDER };
			// 图标 + 简短文字
			const iconBtnText = { display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", cursor: "pointer", background: "transparent", color: TXT2, border: "1px solid transparent", borderRadius: 6, fontSize: 12, lineHeight: 1.4, whiteSpace: "nowrap" };
			// 工作范围强调按钮（单独放大）
			const wsBtn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 16px", cursor: "pointer", background: "rgba(100,160,255,.14)", color: "#fff", border: "1px solid rgba(100,160,255,.5)", borderRadius: 9, fontSize: 13, fontWeight: 600, lineHeight: 1.4, whiteSpace: "nowrap", boxShadow: "0 1px 6px rgba(100,160,255,.25)" };
			const pre = { fontFamily: CODE, fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0, padding: 6, maxHeight: 140, overflow: "auto", borderTop: "1px solid " + BORDER, background: CODEBLK, color: TXT2 };
			const editorWrap = { display: "flex", flex: 1, minHeight: 0, maxWidth: "100%", borderTop: "1px solid " + BORDER, background: "#1e1e1e", overflow: "hidden" };
			// 行高：预览模式 34px（容纳 say 字号差异）；pre/ta/gutter 必须一致
			const ED_LH = stylePreview ? 34 : 19.5;
			// ── 缩进线：按行缩进档位画垂直虚线（overlay 内容坐标；依赖 stylePreview 的 LINE_H，故置于此） ──
			const indentGuides = React.useMemo(() => {
				const lines = content.split("\n");
				const guide = {}; // x → {first, last}
				for (let i = 0; i < lines.length; i++) {
					const m = /^[ \t]*/.exec(lines[i]);
					const raw = m[0].replace(/\t/g, "    ");
					const n = raw.length;
					if (n <= 0) continue;
					// 档位边界：4 空格一档（Ren'Py 惯例），只画有实际缩进内容的档位边界
					const key = Math.floor(n / 4) * 4;
					if (key <= 0) continue;
					if (!guide[key]) guide[key] = { first: i, last: i };
					else { guide[key].first = Math.min(guide[key].first, i); guide[key].last = Math.max(guide[key].last, i); }
				}
				return Object.keys(guide).map((k) => ({ x: parseInt(k, 10) * CHAR_W, top: guide[k].first * LINE_H(), h: (guide[k].last - guide[k].first + 1) * LINE_H() }));
			}, [content, charW, stylePreview]);
			const gutterStyle = { position: "relative", width: 44, flexShrink: 0, overflow: "hidden", padding: "4px 6px 4px 4px", textAlign: "right", fontFamily: CODE, fontSize: 13, lineHeight: ED_LH + "px", color: "rgba(128,128,128,.65)", userSelect: "none", background: "#252526" };
			const preStyle = { position: "absolute", inset: 0, margin: 0, padding: 4, fontFamily: CODE, fontSize: 13, lineHeight: ED_LH + "px", whiteSpace: "pre", overflow: "hidden", color: "#d4d4d4", pointerEvents: "none" };
			const taStyle = { position: "absolute", inset: 0, margin: 0, padding: 4, fontFamily: CODE, fontSize: 13, lineHeight: ED_LH + "px", whiteSpace: "pre", overflow: "auto", background: "transparent", color: "transparent", caretColor: "#e0e0e0", outline: "none", border: "none", resize: "none" };
			const editorBox = { position: "relative", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" };
			const tabBar = { display: "flex", gap: 2, padding: "4px 8px", overflowX: "auto", borderBottom: "1px solid " + BORDER, minHeight: 30, alignItems: "center", background: LAYER };
			const tabStyle = (act) => ({ padding: "3px 10px", cursor: "pointer", background: act ? GHOST : "transparent", border: "1px solid " + (act ? BORDER : "transparent"), borderRadius: 6, fontSize: 13, whiteSpace: "nowrap", color: act ? ACCENT : TXT, fontFamily: "inherit" });
			const sideBtn = { padding: "3px 10px", cursor: "pointer", background: sideOpen ? GHOST : "transparent", color: sideOpen ? ACCENT : TXT, border: "1px solid " + (sideOpen ? BORDER : BORDER), borderRadius: 6, fontSize: 13, fontFamily: "inherit" };
			const statusText = active ? active.name + (active.dirty ? " ●" : "") + "（" + String(lineCount) + " 行）" : "从左侧选择 .rpy 文件打开";
			const itemRow = (active2) => ({ padding: "3px 8px", fontSize: 13, cursor: "pointer", background: active2 ? GHOST : "transparent", color: TXT, borderRadius: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "inherit" });

			// 当前编辑文件相对激活检查点的行级修改标记
			const curDiff = cpDiff ? (cpDiff.files.find((f) => f.rel === activeName) || null) : null;
			const cpChanged = !!(cpDiff && cpDiff.summary && cpDiff.summary.files > 0);

			// 未保存修改统计（相对上次保存内容）：+N -M 行
			const diffStats = (() => {
				if (!active || !active.dirty) return { added: 0, removed: 0, hasBase: false };
				if (savedSnap && savedSnap.name === activeName) {
					const d = lineDiff(String(savedSnap.content || "").split("\n"), content.split("\n"));
					return { added: d.added, removed: d.removed, hasBase: true };
				}
				return { added: 0, removed: 0, hasBase: false }; // 从未保存过：无可比基线
			})();

			// 查找匹配的像素位置（内容坐标，overlay transform 层内定位）
			const matchRects = (() => {
				if (!findText || !content) return [];
				const ls = content.split("\n");
				return findMatches.map((m, i) => {
					const { line, col } = offsetToPos(content, m.start);
					const lineText = ls[line - 1] || "";
					return { i, line, col, len: m.end - m.start, left: 4 + textWidth(lineText.slice(0, col)), width: Math.max(4, textWidth(content.slice(m.start, m.end))) };
				});
			})();
			// 当前文件的 lint 错误行（编辑器内下划线）
			const curLintLines = (() => {
				if (!activeName) return [];
				return lintErrors.filter((e) => e.file.replace(/^game\//, "").replace(/\\/g, "/") === activeName).map((e) => e.line);
			})();

			// 递归渲染资源目录树（dirs 在上、files 在下，缩进 14px/层）
			const renderAssetDir = (cat, dir, depth, path) => {
				const kids = [];
				Object.keys(dir.dirs).sort().forEach((name) => {
					const key = path + name;
					const open = isOpen(key);
					const sub = dir.dirs[name];
					kids.push(React.createElement("div", { key: "d" + key },
						React.createElement("div", { style: { ...itemRow(false), display: "flex", alignItems: "center", gap: 4, paddingLeft: 8 + depth * 14, color: TXT2 }, onMouseEnter: () => setHoverRow(key), onMouseLeave: () => setHoverRow(null), onClick: () => toggleTree(key) },
							React.createElement("span", { style: { width: 12, flexShrink: 0, fontSize: 10, color: TXT3 } }, open ? "▾" : "▸"),
							React.createElement("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 } }, name),
							React.createElement("span", { style: { flexShrink: 0, fontSize: 11, color: TXT3 } }, String(countFiles(sub))),
						),
						open ? React.createElement("div", { key: "c" + key }, renderAssetDir(cat, sub, depth + 1, key + "/")) : null,
					));
				});
				dir.files.forEach((f) => {
					const base = String(f.rel).split("/").pop();
					const isPrev = (cat === "image" && previewImg === f.rel) || (cat === "audio" && previewAudio === f.rel);
					const onOpen = cat === "image" ? () => { setPreviewImg(f.rel); setPreviewAudio(null); }
						: cat === "audio" ? () => { setPreviewAudio(f.rel); setPreviewImg(null); }
						: () => { setPreviewImg(null); setPreviewAudio(null); };
					kids.push(React.createElement("div", { key: "f" + path + f.rel, style: { ...itemRow(false), display: "flex", alignItems: "center", gap: 4, paddingLeft: 8 + (depth + 1) * 14, color: isPrev ? SUCCESS : TXT }, onMouseEnter: () => setHoverRow(f.rel), onMouseLeave: () => setHoverRow(null), onClick: onOpen },
						React.createElement("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, base),
						React.createElement("span", { style: { flexShrink: 0, fontSize: 11, color: TXT3 } }, fmtSize(f.size)),
					));
				});
				return kids;
			};

			// 文件目录树渲染（VSCode 资源管理器风格：📁 目录 / 📄 文件，缩进层级，可折叠）
			const renderFileTree = (dir, depth, prefix) => {
				const kids = [];
				Object.keys(dir.dirs).sort().forEach((name) => {
					const key = prefix + name;
					const open = !!expandedFiles[key];
					const sub = dir.dirs[name];
					kids.push(React.createElement("div", { key: "d" + key },
						React.createElement("div", { style: { ...itemRow(false), display: "flex", alignItems: "center", gap: 4, paddingLeft: 6 + depth * 14, color: TXT2 }, onMouseEnter: () => setHoverRow(key), onMouseLeave: () => setHoverRow(null), onClick: () => setExpandedFiles((prev) => { const n = { ...prev }; n[key] = !open; return n; }) },
							React.createElement("span", { style: { width: 12, flexShrink: 0, fontSize: 10, color: TXT3 } }, open ? "▾" : "▸"),
							React.createElement("span", { style: { flexShrink: 0, fontSize: 12 } }, "📁"),
							React.createElement("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, name),
							React.createElement("span", { style: { flexShrink: 0, fontSize: 11, color: TXT3 } }, String(countFiles(sub))),
						),
						open ? React.createElement("div", { key: "c" + key }, renderFileTree(sub, depth + 1, key + "/")) : null,
					));
				});
				dir.files.sort().forEach((rel) => {
					const base = String(rel).split("/").pop();
					const isAct = rel === activeName;
					kids.push(React.createElement("div", { key: "f" + rel, style: { ...itemRow(isAct), display: "flex", alignItems: "center", gap: 4, paddingLeft: 6 + (depth + 1) * 14, background: hoverRow === rel ? HOVER : (isAct ? GHOST : "transparent"), color: isAct ? ACCENT : TXT }, onMouseEnter: () => setHoverRow(rel), onMouseLeave: () => setHoverRow(null), onClick: () => openFile(rel) },
						React.createElement("span", { style: { flexShrink: 0, fontSize: 12 } }, "📄"),
						React.createElement("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, base),
					));
				});
				return kids;
			};
			const NAV_ICONS = { labels: "🏷", chars: "👤", trans: "🔄", vars: "📦", fonts: "🔤" };

			// ── 路线图当前位置：调试中（桥接回报新鲜）取游戏位置，否则取编辑器光标所在 label ──
			const routeCurrentId = (() => {
				if (!routeMap) return null;
				const match = (file, line) => {
					const fs = String(file || "").replace(/^game\//, "");
					const sts = (routeMap.states || []).filter((s) => String(s.file || "").replace(/^game\//, "") === fs);
					if (!sts.length) return null;
					let best = null;
					for (const s of sts) if ((s.line || 0) <= line && (!best || s.line > best.line)) best = s;
					return best ? best.id : null;
				};
				if (routeStatus && routeStatus.running && routeStatus.file && routeStatus.line) {
					const id = match(routeStatus.file, routeStatus.line);
					if (id) return id;
				}
				if (active && active.name) return match(active.name, cursorPos.line);
				return null;
			})();

			// 变量监控 → 路线图联动：当前关注变量写入/读取的节点集合（紫色高亮）
			const varNodes = (() => {
				if (!varFocus || !routeMap) return null;
				const v = (routeMap.variables || []).find((x) => x.name === varFocus);
				if (!v) return null;
				const set = new Set();
				for (const id of v.writtenIn || []) set.add(id);
				for (const id of v.readIn || []) set.add(id);
				return set;
			})();

			// 变量监控 → 编辑器联动：跳转变量定义处（route-map 的 definedAt）
			const jumpToVarDef = (name) => {
				if (!routeMap || !project) return;
				const v = (routeMap.variables || []).find((x) => x.name === name);
				if (!v || !v.definedAt || !v.definedAt.file) { setLog("⚠ 未找到变量定义处: " + name); return; }
				const fileShort = String(v.definedAt.file).replace(/^game\//, "");
				const line = Number(v.definedAt.line) || 1;
				if (fileShort === activeName) flashJumpToLine(line);
				else { pendingJump.current = { file: fileShort, line: line }; openFile(fileShort); }
				setLog("📂 变量 " + name + " 定义 → " + fileShort + ":" + line);
			};

			// 轮询调试位置回报（路线图或变量窗口打开时，2s；无回报视为未在调试）
			React.useEffect(() => {
				if ((!routeWin.open && !varWin.open) || !project) { setRouteStatus(null); return; }
				const poll = () => {
					api("route-status", {}, { project }).then((r) => {
						setRouteStatus(r && r.running ? r : null);
					}).catch(() => setRouteStatus(null));
				};
				poll();
				const t = setInterval(poll, 2000);
				return () => clearInterval(t);
			}, [routeWin.open, varWin.open, project]);

			// 活动栏图标按钮（规范 §2：40×36、圆角 6、hover/激活态、可禁用降透明度）
			const abIcon = (icon, label, onClick, opts) => React.createElement("div", { key: label, title: label, onClick: onClick, style: { position: "relative", width: 40, height: 36, marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: opts && opts.opacity } },
				React.createElement("div", { style: { width: 34, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, background: opts && opts.active ? GHOST : "transparent", color: (opts && opts.color) || TXT2, border: "1px solid " + (opts && opts.active ? BORDER : "transparent") } }, icon),
			);

			return React.createElement("div", { ref: rootRef, style: { position: "relative", display: "flex", flexDirection: "column", flex: "1 1 0", minWidth: 0, minHeight: 0, maxWidth: "100%", overflow: "hidden", background: BG, color: TXT, fontFamily: UI, fontSize: 13 } },
				// ── 路线图弹出窗口（Portal 到 body，可拖可缩放） ──
				routeWin.open ? React.createElement(RouteWindow, { map: routeMap, onNodeClick: jumpToState, currentId: routeCurrentId, focusNodes: varNodes, win: routeWin, onChange: setRouteWin, onClose: () => setRouteWin((w) => ({ ...w, open: false })), TXT, TXT2, TXT3, ACCENT, BORDER, BG, GHOST, LAYER }) : null,
				// ── 游戏画面窗口（Portal 到 body，可拖可缩放） ──
				shotWin.open ? React.createElement(ShotWindow, { project, api, win: shotWin, onChange: setShotWin, onClose: () => setShotWin((w) => ({ ...w, open: false })), TXT, TXT2, TXT3, BORDER, BG, LAYER, sessionId }) : null,
				// ── 变量监控窗口（Portal 到 body，可拖可缩放） ──
				varWin.open ? React.createElement(VarWindow, { vars: (routeStatus && routeStatus.vars) || {}, routeVars: (routeMap && routeMap.variables) || [], win: varWin, onChange: setVarWin, onClose: () => setVarWin((w) => ({ ...w, open: false })), onVarJump: jumpToVarDef, onVarFocus: setVarFocus, TXT, TXT2, TXT3, ACCENT, BORDER, BG, LAYER }) : null,
				// ── 顶栏（类 VSCode：项目输入 + 图标+文字操作 + 强调工作范围 + 对话） ──
				React.createElement("div", { style: { ...row, gap: 6, flexWrap: "wrap" } },
					React.createElement("span", { style: { color: TXT2, fontSize: 13, flexShrink: 0 } }, "项目"),
					React.createElement("input", { style: { flex: 1, minWidth: 120, maxWidth: 340, fontFamily: CODE, fontSize: 12, background: INPUTBG, color: TXT, border: "1px solid " + BORDER, borderRadius: 5, padding: "2px 7px", outline: "none" }, value: project, onChange: (e) => setProject(e.target.value), onBlur: commitProject, onKeyDown: (e) => { if (e.key === "Enter") { e.target.blur(); commitProject(); } }, placeholder: "项目目录绝对路径" }),
					React.createElement("button", { title: "切到 host 配置的默认工程（renpy.config.json defaultProject）", style: { ...iconBtnText, fontSize: 12 }, onClick: () => { api("info").then((r) => { const d = r && r.defaultProject; if (!d) { addLog("host 未配置默认工程"); return; } setProject(d); try { if (typeof localStorage !== "undefined") localStorage.setItem("renpy-project", d); } catch (e) { /* ignore */ } commitProject(d); addLog("已切换到默认工程: " + d); }).catch((e) => addLog("读取默认工程失败: " + String(e))); } }, "⟳ 默认工程"),
					React.createElement("div", { style: { flex: 1 } }),
					// ── 工作范围（强调：单独放大） ──
					React.createElement("button", { style: wsBtn, onClick: lockWorkspace, disabled: !active, title: "用编辑器选区/光标行设定工作范围（区域外只读，agent 越界会先询问）" },
						React.createElement("span", { style: { fontSize: 17 } }, "🎯"),
						React.createElement("span", {}, "工作范围"),
					),
					(wsLock && wsLock.file === activeName) ? React.createElement("button", { style: { ...wsBtn, background: "transparent", color: SUCCESS, border: "1px solid " + SUCCESS }, onClick: clearWorkspace, title: "清除工作范围" },
						React.createElement("span", { style: { fontSize: 15 } }, "✖"),
						React.createElement("span", {}, "清除"),
					) : null,
					!props.hideSidebar ? React.createElement("button", { style: sideBtn, onClick: () => setSideOpen(!sideOpen) }, "💬 对话") : null,
					busy ? React.createElement("span", { style: { color: TXT2 } }, "…") : null,
				),
				React.createElement("div", { style: { display: "flex", flex: 1, minHeight: 0, maxWidth: "100%", minWidth: 0 } },
					// ── 活动栏（类 VSCode：视图切换 + 运行 + 工具，图标导航，规范 §2） ──
					React.createElement("div", { style: { width: 44, flexShrink: 0, borderRight: "1px solid " + BORDER, background: LAYER, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 6, overflowY: "auto", overflowX: "hidden" } },
						[["files", "📄", "文件"], ["assets", "🖼", "资源"], ["edits", "✎", "修改"]].map(([k, icon, label]) => React.createElement("div", { key: k, title: label, onClick: () => setActiveView(k), style: { position: "relative", width: 40, height: 36, marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" } },
							React.createElement("div", { style: { width: 34, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: activeView === k ? GHOST : "transparent", color: activeView === k ? ACCENT : TXT2, border: "1px solid " + (activeView === k ? BORDER : "transparent") } }, icon),
							React.createElement("span", { style: { position: "absolute", left: 0, top: 4, bottom: 4, width: 2, borderRadius: 1, background: activeView === k ? ACCENT : "transparent" } }),
						)),
						React.createElement("div", { style: { width: 28, height: 1, background: BORDER, margin: "4px 0 6px" } }),
						// 运行组
						abIcon("▶", "运行游戏", doRun, { color: ACCENT }),
						abIcon("■", "停止游戏", doStop),
						React.createElement("div", { style: { width: 28, height: 1, background: BORDER, margin: "4px 0 6px" } }),
						// 工具组（项目类）
						abIcon("⟳", "加载项目", () => loadFiles(project)),
						abIcon("⚠", "Lint 检查", doLint),
						abIcon("🧪", "自动化测试（rpytest）", doTest),
						abIcon("💾", "保存 (Ctrl+S)", saveFile, { opacity: active ? 1 : .4 }),
						abIcon("📷", "截图", doShot),
						abIcon("🕘", "保存历史与回滚", openHistory, { opacity: active ? 1 : .4 }),
						React.createElement("div", { style: { width: 28, height: 1, background: BORDER, margin: "4px 0 6px" } }),
						// 调试工具组（弹窗）
						abIcon("🗺", "路线图（弹窗，点击节点跳转）", openRouteWin, { opacity: project ? 1 : .4 }),
						abIcon("🎬", "游戏画面（弹窗，截图交互）", () => setShotWin((w) => ({ ...w, open: true })), { opacity: project ? 1 : .4 }),
						abIcon("📊", "变量监控（弹窗，变化高亮）", () => setVarWin((w) => ({ ...w, open: true })), { opacity: project ? 1 : .4 }),
						React.createElement("div", { style: { width: 28, height: 1, background: BORDER, margin: "4px 0 6px" } }),
						// 编辑器工具组
						abIcon("📖", "学习注释（AI 逐行讲解）", startTeach, { active: !!learnResult, color: learnResult ? SUCCESS : undefined, opacity: active && !learnBusy ? 1 : .4 }),
						abIcon("🎨", "GUI 主题定制（gui.rpy）", openGuiPanel, { opacity: active ? 1 : .4 }),
						abIcon("⇄", "Ren'Py ↔ Python 等价", convertCurrentLine, { opacity: active ? 1 : .4 }),
						abIcon("Aa", "文本样式预览", () => { if (active) setStylePreview((v) => !v); }, { active: stylePreview, color: stylePreview ? ACCENT : undefined, opacity: active ? 1 : .4 }),
						abIcon("✎", "修改（相对基线）", openCpPanel, { active: cpChanged, color: cpChanged ? ACCENT : undefined }),
					),
					React.createElement("div", { style: { ...colL, overflow: "hidden", padding: 0, display: "flex", flexDirection: "column" } },
						activeView === "files" ? React.createElement("div", { style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } },
							React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4, padding: "5px 8px", borderBottom: "1px solid " + BORDER, background: LAYER, flexShrink: 0 } },
								React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: TXT } }, "📄 文件 (" + (files || []).length + ")"),
								React.createElement("span", { style: { flex: 1 } }),
								React.createElement("span", { style: { fontSize: 12, color: TXT2, cursor: "pointer", padding: "1px 5px", borderRadius: 4 }, onClick: () => loadFiles(project), title: "刷新文件列表" }, "⟳"),
								React.createElement("span", { style: { fontSize: 12, color: TXT2, cursor: "pointer", padding: "1px 5px", borderRadius: 4 }, onClick: () => setExpandedFiles({}), title: "折叠全部" }, "▾"),
							),
							React.createElement("div", { style: { flex: 1, minHeight: 0, overflow: "auto", padding: "4px 4px 10px" } },
								renderFileTree(buildFileTree(files || []), 0, ""),
								React.createElement("div", { style: { fontWeight: 600, padding: "10px 8px 3px", fontSize: 12, color: TXT3 } }, "导航"),
								React.createElement("div", { style: { display: "flex", gap: 2, padding: "0 8px 4px", flexWrap: "wrap" } },
									[["labels", "标签"], ["chars", "人物"], ["trans", "转场"], ["vars", "变量"], ["fonts", "字体"]].map(([k, label]) => React.createElement("span", {
										key: k,
										style: { padding: "2px 8px", fontSize: 12, cursor: "pointer", background: navKind === k ? GHOST : "transparent", border: "1px solid " + (navKind === k ? BORDER : "transparent"), borderRadius: 6, color: navKind === k ? ACCENT : TXT2 },
										onClick: () => setNavKind(k),
									}, label)),
								),
								navKind === "fonts" ? React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 1, padding: "2px 0 6px" } },
									React.createElement("div", { style: { fontSize: 10, color: TXT3, padding: "2px 8px 4px" } }, "🔤 项目字体（" + (assets.font || []).length + " 个，点击预览；预览模式中 {font=} 自动真实渲染）"),
									(assets.font || []).length ? assets.font.map((f) => React.createElement("div", { key: f.rel, style: { ...itemRow(false), display: "flex", alignItems: "center", gap: 5 }, onMouseEnter: () => setHoverRow("font:" + f.rel), onMouseLeave: () => setHoverRow(null), onClick: () => { ensureFont(f.rel); setPreviewFont(f); } },
										React.createElement("span", { style: { fontSize: 11, flexShrink: 0 } }, "🔤"),
										React.createElement("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: CODE, fontSize: 12 } }, String(f.rel).split("/").pop()),
										React.createElement("span", { style: { flexShrink: 0, fontSize: 10, color: TXT3 } }, fmtSize(f.size)),
									)) : React.createElement("div", { style: { color: TXT2, fontSize: 12, padding: "2px 8px" } }, "暂无字体 — 把 .ttf/.otf 放进项目 game/ 目录后点 ⟳ 加载"),
								) : (navKind === "labels" ? labels : navKind === "chars" ? chars : navKind === "trans" ? trans : vars).map((l) => React.createElement("div", { key: l.name, style: { ...itemRow(false), display: "flex", alignItems: "center", gap: 5, color: ACCENT }, onMouseEnter: () => setHoverRow(l.name), onMouseLeave: () => setHoverRow(null), onClick: () => jumpEntry(l) },
									React.createElement("span", { style: { fontSize: 11, flexShrink: 0 } }, NAV_ICONS[navKind]),
									React.createElement("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, l.name),
									React.createElement("span", { style: { flexShrink: 0, fontSize: 10, color: TXT3 } }, "@" + l.line),
								)),
							),
						) : activeView === "assets" ? React.createElement("div", { style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } },
							React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4, padding: "5px 8px", borderBottom: "1px solid " + BORDER, background: LAYER, flexShrink: 0 } },
								React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: TXT } }, "🖼 资源 (" + assetCats.reduce((n, [c]) => n + (assets[c] || []).length, 0) + ")"),
								React.createElement("span", { style: { flex: 1 } }),
								React.createElement("span", { style: { fontSize: 12, color: TXT2, cursor: "pointer", padding: "1px 5px", borderRadius: 4 }, onClick: () => loadAssets(project), title: "刷新资源" }, "⟳"),
							),
							React.createElement("div", { style: { flex: 1, minHeight: 0, overflow: "auto", padding: "4px 4px 10px" } },
								assetCats.map(([cat, label]) => {
									const open = isOpen(cat);
									const total = countFiles(assetTrees[cat]);
									if (!total) return null;
									return React.createElement("div", { key: cat },
										React.createElement("div", { style: { ...itemRow(false), display: "flex", alignItems: "center", gap: 4, color: TXT2, fontWeight: 600 }, onMouseEnter: () => setHoverRow(cat), onMouseLeave: () => setHoverRow(null), onClick: () => toggleTree(cat) },
											React.createElement("span", { style: { width: 12, flexShrink: 0, fontSize: 10, color: TXT3 } }, open ? "▾" : "▸"),
											React.createElement("span", { style: { flexShrink: 0, fontSize: 12 } }, cat === "image" ? "🖼" : cat === "audio" ? "🎵" : cat === "video" ? "🎬" : cat === "font" ? "🔤" : "📦"),
											React.createElement("span", { style: { flex: 1, minWidth: 0 } }, label),
											React.createElement("span", { style: { flexShrink: 0, fontSize: 11, color: TXT3 } }, String(total)),
										),
										open ? React.createElement("div", null, renderAssetDir(cat, assetTrees[cat], 1, cat + "/")) : null,
									);
								}),
							),
						) : React.createElement("div", { style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } },
							React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4, padding: "5px 8px", borderBottom: "1px solid " + BORDER, background: LAYER, flexShrink: 0 } },
								React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: TXT } }, "✎ 修改 (" + (cpDiff && cpDiff.files ? cpDiff.files.length : 0) + ")"),
								React.createElement("span", { style: { flex: 1 } }),
								React.createElement("span", { style: { fontSize: 12, color: TXT2, cursor: "pointer", padding: "1px 5px", borderRadius: 4 }, onClick: () => openCpPanel(), title: "打开修改面板" }, "↗"),
							),
							React.createElement("div", { style: { flex: 1, minHeight: 0, overflow: "auto", padding: "4px 4px 10px" } },
								(cpDiff && cpDiff.files.length) ? cpDiff.files.map((f) => React.createElement("div", { key: f.rel, style: { ...itemRow(false), display: "flex", alignItems: "center", gap: 5 }, onClick: () => openCpPanel() },
									React.createElement("span", { style: { fontSize: 11, flexShrink: 0 } }, "✎"),
									React.createElement("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, f.rel),
									React.createElement("span", { style: { flexShrink: 0, fontSize: 10, color: SUCCESS } }, "+" + f.added),
									React.createElement("span", { style: { flexShrink: 0, fontSize: 10, color: ERRCOL } }, "-" + f.removed),
								)) : React.createElement("div", { style: { color: TXT2, fontSize: 12, padding: 8 } }, "暂无修改 — 点顶栏 ✎ 打开修改面板"),
							),
						),
					),
					React.createElement("div", { ref: colRRef, style: colR },
						React.createElement("div", { style: tabBar },
							(tabs || []).map((t) => React.createElement("span", { key: t.name, style: tabStyle(t.name === activeName), onClick: () => setActiveName(t.name) },
								t.name + (t.dirty ? " ●" : ""),
								React.createElement("span", { style: { marginLeft: 6, color: "rgba(200,80,80,.9)", cursor: "pointer" }, onClick: (ev) => { ev.stopPropagation(); closeTab(t.name); } }, "✕"),
							)),
						),
						React.createElement("div", { style: { padding: "4px 10px", fontSize: 12, color: TXT3 } }, statusText),
						// ── 查找/替换栏（Ctrl+F） ──
						findOpen ? React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", padding: "5px 8px", borderBottom: "1px solid " + BORDER, background: LAYER, flexWrap: "wrap" } },
							React.createElement("input", { ref: findInputRef, value: findText, onChange: (e) => { setFindText(e.target.value); setFindIdx(0); }, onKeyDown: (e) => { if (e.key === "Enter") { e.shiftKey ? findPrev() : findNext(); } if (e.key === "Escape") setFindOpen(false); }, placeholder: "查找…", style: { width: 170, background: INPUTBG, color: TXT, border: "1px solid " + BORDER, borderRadius: 6, fontSize: 12, padding: "2px 8px", outline: "none" } }),
							React.createElement("span", { style: { fontSize: 11, color: TXT3, minWidth: 30 } }, findMatches.length ? ((Math.min(findIdx, findMatches.length - 1) + 1) + "/" + findMatches.length) : "0/0"),
							React.createElement("button", { style: { ...btn, padding: "1px 8px", fontSize: 12 }, onClick: findPrev, disabled: !findMatches.length, title: "上一个 (Shift+Enter)" }, "↑"),
							React.createElement("button", { style: { ...btn, padding: "1px 8px", fontSize: 12 }, onClick: findNext, disabled: !findMatches.length, title: "下一个 (Enter)" }, "↓"),
							React.createElement("input", { value: findReplace, onChange: (e) => setFindReplace(e.target.value), placeholder: "替换为…", style: { width: 150, background: INPUTBG, color: TXT, border: "1px solid " + BORDER, borderRadius: 6, fontSize: 12, padding: "2px 8px", outline: "none" } }),
							React.createElement("button", { style: { ...btn, padding: "1px 8px", fontSize: 12 }, onClick: doReplace, disabled: !findMatches.length }, "替换"),
							React.createElement("button", { style: { ...btn, padding: "1px 8px", fontSize: 12 }, onClick: doReplaceAll, disabled: !findText }, "全部替换"),
							React.createElement("button", { style: { ...btn, padding: "1px 8px", fontSize: 12 }, onClick: () => setFindOpen(false), title: "关闭 (Esc)" }, "✕"),
						) : null,
						// ── 样式预览模式提示条（降级项汇总，黄色） ──
						stylePreview ? React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderBottom: "1px solid " + BORDER, background: previewNotes.length ? "rgba(229,192,123,.12)" : "rgba(100,160,255,.08)", fontSize: 11, flexShrink: 0, flexWrap: "wrap" } },
							React.createElement("span", { style: { color: previewNotes.length ? "#e5c07b" : "#569cd6", fontWeight: 600 } }, previewNotes.length ? "⚠ 样式预览降级提示" : "✓ 样式预览模式"),
							previewNotes.length ? previewNotes.slice(0, 6).map((n, i) => React.createElement("span", { key: i, style: { color: "#e5c07b" } }, "• " + n.msg)) : React.createElement("span", { style: { color: TXT2 } }, "say 文本已按样式渲染（粗/斜/下/删/色/透明所见即所得；字号/字体/插值以底色标记，悬停看详情）"),
							previewNotes.length > 6 ? React.createElement("span", { style: { color: "#e5c07b" } }, "… 共 " + previewNotes.length + " 条") : null,
						) : null,
						React.createElement("div", { style: editorWrap },
							React.createElement("div", { style: gutterStyle, ref: gutterRef },
								// 检查点修改标记与行号同行渲染（随滚动天然对齐；绿=新增 蓝=修改 红=删除）
								lines.map((n) => {
									const t = curDiff ? curDiff.lineTypes[n] : null;
									const color = t === "add" ? "#4caf50" : t === "del" ? "#e05c5c" : t === "mod" ? "#569cd6" : "transparent";
									return React.createElement("div", { key: n, title: t ? (t === "add" ? "新增" : t === "del" ? "删除" : "修改") : "", style: { display: "flex", alignItems: "center", height: LINE_H() } },
										React.createElement("span", { style: { width: 4, flexShrink: 0, height: LINE_H(), background: color, marginRight: 2 } }),
										React.createElement("span", { style: { flex: 1, textAlign: "right" } }, n),
									);
								}),
							),
							React.createElement("div", { style: editorBox },
								// 学习教学标签（teach:）：markdown 渲染；官方文档标签（doc:）：纯文本只读；其余为代码编辑器
								(active && /^teach:/.test(active.name)) ? React.createElement("div", { style: { position: "absolute", inset: 0, overflow: "auto", padding: "10px 14px", fontSize: 13, lineHeight: 1.65, color: TXT } },
									(/^⏳/.test(content) || /^❌/.test(content)) ? React.createElement("span", { style: { color: /^❌/.test(content) ? ERRCOL : TXT2, fontSize: 12 } }, content)
										: React.createElement("div", { dangerouslySetInnerHTML: { __html: mdToHtml(content) } }),
								) : (active && /^doc:/.test(active.name)) ? React.createElement("pre", { style: { position: "absolute", inset: 0, overflow: "auto", margin: 0, padding: "10px 14px", fontFamily: CODE, fontSize: 12, lineHeight: 1.6, color: TXT, whiteSpace: "pre-wrap", wordBreak: "break-word" } }, content)
								: React.createElement("pre", { ref: preRef, style: preStyle, dangerouslySetInnerHTML: { __html: highlightRpy(content, stylePreview) } }),
								// 查找高亮 + lint 下划线（内容坐标；滚动时 transform 反向平移对齐）
								!isViewTab ? React.createElement("div", { style: { position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 1 } },
									React.createElement("div", { ref: overlayRef, style: { position: "absolute", top: 0, left: 0, width: 1, height: 1, transform: "translate(0,0)" } },
										// 缩进线（最底：垂直虚线，随缩进档位）
										indentGuides.map((g) => React.createElement("div", { key: "ig" + g.x, style: { position: "absolute", top: g.top, left: g.x, width: 1, height: g.h, background: "rgba(255,255,255,.07)", boxShadow: "inset 1px 0 0 rgba(255,255,255,.03)" } })),
										// 当前行高亮（光标所在行整行浅背景）
										(active && cursorPos.line >= 1) ? React.createElement("div", { key: "curline", style: { position: "absolute", top: (cursorPos.line - 1) * LINE_H(), left: 0, width: 4000, height: LINE_H(), background: "rgba(255,255,255,.035)" } }) : null,
										// 跳转落点闪烁高亮（路线图节点 / lint / 定义跳转；仅当前文件，2.2s 后消失）
										(jumpFlash && jumpFlash.file === activeName) ? React.createElement("div", { key: "jf" + jumpFlash.key, title: "跳转落点", style: { position: "absolute", top: (jumpFlash.line - 1) * LINE_H(), left: 0, width: 4000, height: LINE_H(), background: "rgba(86,156,214,.22)", boxShadow: "inset 3px 0 0 rgba(86,156,214,.85)" } }) : null,
										// 括号匹配高亮（配对括号字符块）
										bracketRects ? React.createElement(React.Fragment, null,
											bracketRects.open ? React.createElement("div", { key: "bo", title: "匹配括号", style: { position: "absolute", top: (bracketRects.open.line - 1) * LINE_H() + 2, left: bracketRects.open.left, width: CHAR_W, height: LINE_H() - 4, background: "rgba(229,192,123,.45)", borderRadius: 2 } }) : null,
											bracketRects.close ? React.createElement("div", { key: "bc", title: "匹配括号", style: { position: "absolute", top: (bracketRects.close.line - 1) * LINE_H() + 2, left: bracketRects.close.left, width: CHAR_W, height: LINE_H() - 4, background: "rgba(229,192,123,.45)", borderRadius: 2 } }) : null,
										) : null,
										(wsLock && wsLock.file === activeName) ? React.createElement("div", { key: "ws", title: "工作范围（范围内修改、范围外不动）", style: { position: "absolute", top: (wsLock.startLine - 1) * LINE_H(), left: 0, width: 4000, height: (wsLock.endLine - wsLock.startLine + 1) * LINE_H() - 1, background: "rgba(76,175,80,.07)", borderTop: "1px solid rgba(76,175,80,.55)", borderBottom: "1px solid rgba(76,175,80,.55)" } }) : null,
										matchRects.map((r) => {
											const isCur = r.i === Math.min(findIdx, matchRects.length - 1);
											return React.createElement("div", { key: "m" + r.i, style: { position: "absolute", top: (r.line - 1) * LINE_H() + 1, left: r.left, width: r.width, height: 17, background: isCur ? "rgba(229,192,123,.5)" : "rgba(229,192,123,.25)", borderRadius: 2 } });
										}),
										curLintLines.map((ln) => React.createElement("div", { key: "l" + ln, title: "lint 错误", style: { position: "absolute", top: (ln - 1) * LINE_H() + 17, left: 4, width: 4000, height: 2, background: "rgba(224,92,92,.9)", borderRadius: 1 } })),
									),
								) : null,
								!isViewTab ? React.createElement("textarea", { ref: taRef, value: content, onChange: (e) => onChange(e.target.value), onScroll: syncScroll, onKeyDown: onKeyDown, onMouseUp: onEditorMouseUp, onSelect: trackCursor, onKeyUp: trackCursor, onClick: trackCursor, spellCheck: false, wrap: "off", style: taStyle }) : null,
								// 代码补全面板
								(completions.length && compPos) ? React.createElement("div", { style: { position: "absolute", left: compPos.left, top: compPos.top, zIndex: 5, width: 280, maxHeight: compPos.h, overflow: "auto", background: BG, border: "1px solid " + BORDER, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,.35)", padding: 4 } },
									completions.map((c, i) => React.createElement("div", { key: c.kind + c.label + i, style: { display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 5, cursor: "pointer", background: i === compSel ? GHOST : "transparent" }, onMouseEnter: () => setCompSel(i), onClick: () => { setCompSel(i); applyCompletion(); } },
										React.createElement("span", { style: { width: 14, flexShrink: 0, fontSize: 10, fontWeight: 700, textAlign: "center", color: c.kind === "stmt" ? "#569cd6" : c.kind === "snippet" ? "#c586c0" : c.kind === "asset" ? "#4ec9b0" : "#dcdcaa" } }, c.kind === "stmt" ? "K" : c.kind === "snippet" ? "S" : c.kind === "asset" ? "A" : "R"),
										React.createElement("span", { style: { flex: 1, minWidth: 0, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: (c.kind === "stmt" || c.kind === "snippet") ? CODE : "inherit" } }, c.label),
										c.detail ? React.createElement("span", { style: { fontSize: 10, color: TXT3, flexShrink: 0 } }, c.detail) : null,
									)),
								) : null,
							),
						),
						// ── 工作区域条（编辑器下侧） ──
						(wsLock && wsLock.file === activeName) ? React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "4px 10px", borderTop: "1px solid " + BORDER, background: "rgba(76,175,80,.08)" } },
							React.createElement("span", { style: { fontSize: 12, color: SUCCESS, fontWeight: 600 } }, "🎯 工作范围"),
							React.createElement("span", { style: { fontSize: 12, color: TXT2 } }, activeName + " L" + wsLock.startLine + "-" + wsLock.endLine + (wsLock.label ? "（label " + wsLock.label + "）" : "") + " — 修改限定在此范围内，已通知 agent"),
							React.createElement("span", { style: { flex: 1 } }),
							React.createElement("button", { style: { ...btn, padding: "1px 10px", fontSize: 12 }, onClick: clearWorkspace }, "解除"),
						) : null,
						// ── 未保存修改提示条（编辑器下侧：+N -M 行 + 保存/撤回） ──
						(active && active.dirty) ? React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderTop: "1px solid " + BORDER, background: LAYER, flexWrap: "wrap" } },
							React.createElement("span", { style: { fontSize: 12, color: TXT2 } }, "📝 未保存修改" + (diffStats.hasBase ? "" : "（新文件）")),
							diffStats.hasBase ? React.createElement("span", { style: { fontSize: 12, color: SUCCESS, fontWeight: 600 } }, "+" + diffStats.added + " 行") : null,
							diffStats.hasBase ? React.createElement("span", { style: { fontSize: 12, color: ERRCOL, fontWeight: 600 } }, "-" + diffStats.removed + " 行") : null,
							React.createElement("span", { style: { flex: 1 } }),
							React.createElement("button", { style: { ...btn, padding: "1px 10px", fontSize: 12, background: ACCENT, color: "#fff", border: "1px solid " + ACCENT }, onClick: saveFile }, "保存"),
							React.createElement("button", { style: { ...btn, padding: "1px 10px", fontSize: 12 }, onClick: revertUnsaved }, "撤回修改"),
						) : null,
						lintErrors.length ? React.createElement("div", { style: { maxHeight: 100, overflow: "auto", borderTop: "1px solid " + BORDER, padding: 4, fontSize: 12, background: LAYER } },
							lintErrors.map((e, i) => React.createElement("div", { key: i, style: { color: ERRCOL, cursor: "pointer", padding: "2px 6px", borderRadius: 4 }, onMouseEnter: () => setHoverRow("lint" + i), onMouseLeave: () => setHoverRow(null), onClick: () => jumpFromError(e) }, e.file.replace(/^game\//, "") + ":" + e.line + (e.msg ? " — " + e.msg : ""))),
						) : null,
						// 自动化测试报告条（🧪 测试；rpytest 结果 + 失败详情可展开）
						testReport ? React.createElement("div", { style: { maxHeight: 120, overflow: "auto", borderTop: "1px solid " + BORDER, padding: "4px 8px", fontSize: 12, background: testReport.status === "PASSED" ? "rgba(76,175,80,.08)" : "rgba(224,92,92,.1)" } },
							React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
								React.createElement("span", { style: { color: testReport.status === "PASSED" ? SUCCESS : ERRCOL, fontWeight: 600 } }, testReport.status === "PASSED" ? "✓ 测试通过" : "✗ 测试失败"),
								testReport.passed !== null ? React.createElement("span", { style: { color: TXT2 } }, testReport.passed + " passed" + (testReport.failed ? " · " + testReport.failed + " failed" : "") + " · " + (testReport.status || "")) : null,
								React.createElement("span", { style: { flex: 1 } }),
								React.createElement("span", { style: { fontSize: 11, color: TXT2, cursor: "pointer" }, onClick: () => setTestReport((r) => Object.assign({}, r, { output: r.output ? "" : (r.__full || r.output) })), title: "展开/收起 rpytest 报告" }, "详情"),
							),
							(testReport.output && testReport.output.length > 2000) ? React.createElement("pre", { style: { fontSize: 10, color: TXT2, margin: "4px 0 0", whiteSpace: "pre-wrap", fontFamily: CODE, maxHeight: 60, overflow: "auto" } }, testReport.output.slice(0, 2000) + "…") : null,
						) : null,
						shot ? React.createElement("img", { src: "data:image/png;base64," + shot, style: { maxWidth: "100%", maxHeight: 200, borderTop: "1px solid " + BORDER } }) : null,
						React.createElement("pre", { style: pre }, log || "（操作日志）"),
					),
					(!props.hideSidebar && sideOpen) ? React.createElement("div", { style: { width: 330, flexShrink: 0, minHeight: 0, borderLeft: "1px solid " + BORDER, background: SIDEFILL, color: TXT, display: "flex", flexDirection: "column", minWidth: 0 } },
						React.createElement("div", { style: { display: "flex", gap: 6, padding: "7px 10px", borderBottom: "1px solid " + BORDER, alignItems: "center", background: LAYER } },
							[["chat", "对话"], ["trail", "轨迹"]].map(([k, label]) => React.createElement("span", {
								key: k,
								style: { padding: "3px 12px", fontSize: 13, cursor: "pointer", background: sideTab === k ? GHOST : "transparent", border: "1px solid " + (sideTab === k ? BORDER : "transparent"), borderRadius: 12, color: sideTab === k ? ACCENT : TXT2, fontWeight: sideTab === k ? 600 : 400 },
								onClick: () => setSideTab(k),
							}, label + " " + (k === "chat" ? feed.chat.length : feed.trail.length))),
							React.createElement("span", { style: { marginLeft: "auto", fontSize: 11, color: TXT3 } }, "3s 刷新"),
						),
						React.createElement("div", { style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } },
							React.createElement("div", { ref: feedScrollRef, style: { flex: 1, overflow: "auto", padding: "10px 12px" } },
								sideTab === "chat"
									? React.createElement("div", null, (feed.chat.length ? feed.chat.map((c, i) => {
										const isUser = c.t === "user";
										const ts = c.id ? fmtClock(seenTimeRef.current[c.id]) : "";
										const grouped = i > 0 && feed.chat[i - 1].t === c.t;
										const msgKey = c.id || (c.t + i);
										const meta = React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 3 } },
											React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: isUser ? ACCENT : TXT2 } }, isUser ? "我" : "助手"),
											ts ? React.createElement("span", { style: { fontSize: 11, color: TXT2, opacity: .75 } }, ts) : null,
											(hoverMsgId === msgKey) ? React.createElement("span", { style: { fontSize: 11, color: TXT3, cursor: "pointer", opacity: .85 }, onClick: () => copyText(c.text), title: "复制这条消息" }, "⧉ 复制") : null,
											(isUser && hoverMsgId === msgKey) ? React.createElement("span", { style: { fontSize: 11, color: TXT3, cursor: "pointer", opacity: .85 }, onClick: () => {
												try { if (props.inputActions) props.inputActions.setDraft(c.text); } catch (e) { /* ignore */ }
												setMsg(c.text);
												if (composerRef.current) composerRef.current.focus();
												addLog("已取回输入框，修改后按 Enter 重发（原消息保留在历史中）");
											}, title: "编辑并重发这条消息" }, "✎ 编辑") : null,
										);
										// 助手消息渲染轻量 Markdown（受控 HTML）；用户消息保持纯文本
										const bubble = isUser
											? React.createElement("div", { style: { maxWidth: "100%", background: BUBBLE, borderRadius: "12px 4px 12px 12px", padding: "7px 11px", fontSize: 13, lineHeight: "20px", color: TXT, whiteSpace: "pre-wrap", wordBreak: "break-word" } }, c.text)
											: React.createElement("div", { style: { maxWidth: "100%", background: LAYER2, border: "1px solid " + BORDER, borderRadius: "4px 12px 12px 12px", padding: "7px 11px", fontSize: 13, lineHeight: "20px", color: TXT, wordBreak: "break-word", overflowX: "hidden" }, dangerouslySetInnerHTML: { __html: mdToHtml(c.text) } });
										// 思考标记：消息带 reasoning 时显示「🤔 思考」，点击展开
										const reasonOpen = !!expandedReason[msgKey];
										const reasonTag = (!isUser && c.r) ? React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 4, padding: "1px 8px", borderRadius: 9, fontSize: 11, color: TXT2, background: "rgba(128,128,128,.12)", cursor: "pointer", userSelect: "none" }, onClick: () => setExpandedReason((prev) => { const n = { ...prev }; n[msgKey] = !reasonOpen; return n; }) },
											"🤔 思考" + (reasonOpen ? " ▾" : " ▸"),
										) : null;
										const reasonBlock = (!isUser && c.r && reasonOpen && c.rText) ? React.createElement("div", { style: { marginTop: 4, padding: "6px 8px", borderRadius: 6, background: "rgba(128,128,128,.08)", fontSize: 11, lineHeight: 1.6, color: TXT2, whiteSpace: "pre-wrap", wordBreak: "break-word", fontStyle: "italic", maxHeight: 160, overflow: "auto" } }, c.rText) : null;
										return React.createElement("div", { key: msgKey, onMouseEnter: () => setHoverMsgId(msgKey), onMouseLeave: () => setHoverMsgId(null), style: { display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: grouped ? 6 : 12 } },
											isUser
												? React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: "82%" } }, meta, bubble)
												: React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "flex-start", maxWidth: "88%" } },
													React.createElement("div", { style: { width: 26, height: 26, borderRadius: 13, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", background: ACCENT, marginTop: 2, userSelect: "none" } }, "AI"),
													React.createElement("div", { style: { display: "flex", flexDirection: "column", minWidth: 0 } }, meta, reasonTag, bubble, reasonBlock),
												),
										);
									}) : React.createElement("div", { style: { color: TXT2, fontSize: 13, padding: "18px 6px", textAlign: "center" } }, "暂无对话 — 在下方输入框发消息")),
									// 检查点时间线：持久检查点（每次对话/保存自动建立，点击查看/恢复；无检查点时也显示入口）
									React.createElement("div", { key: "cp-timeline", style: { marginTop: 10, borderTop: "1px dashed " + BORDER, paddingTop: 8, cursor: "pointer" }, onClick: () => openCpPanel() },
										React.createElement("div", { style: { fontSize: 11, color: TXT3, marginBottom: 4 } }, cpList.length ? ("📌 持久检查点（" + cpList.length + "）— 每次对话/保存自动建立") : "📌 持久检查点 — 发消息或保存文件后自动建立，点击查看"),
										cpList.length ? cpList.slice(0, 3).map((c) => React.createElement("div", { key: c.id, style: { display: "flex", alignItems: "center", gap: 6, padding: "3px 6px", borderRadius: 5, fontSize: 11, color: TXT2 } },
											React.createElement("span", { style: { color: ACCENT } }, "●"),
											React.createElement("span", { style: { flex: 1 } }, fmtStamp(c.id)),
											React.createElement("span", { style: { color: TXT3 } }, c.files + " 文件"),
										)) : React.createElement("div", { style: { padding: "3px 6px", fontSize: 11, color: TXT2 } }, "暂无检查点 — 下一次对话结束或手动保存后自动出现"),
										cpList.length > 3 ? React.createElement("div", { style: { padding: "3px 6px", fontSize: 11, color: TXT3 } }, "… 共 " + cpList.length + " 个，点击打开全部 →") : null,
									),
								) : (feed.trail.length ? feed.trail.map((t, i) => {
									const isEdit = t.kind === "edit" || t.kind === "write";
									return React.createElement("div", { key: t.id || i, style: { marginBottom: 6, borderRadius: 8, border: "1px solid " + BORDER, background: LAYER, padding: "6px 9px", overflow: "hidden", cursor: isEdit && t.file ? "pointer" : "default" }, ...(isEdit && t.file ? { onClick: () => jumpTrailEdit(t), title: "跳转到编辑位置" } : {}) },
										React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 } },
											React.createElement("span", { style: { flexShrink: 0, fontSize: 11, color: t.done ? SUCCESS : BUSCOL, fontWeight: 700 } }, t.done ? "✓" : "●"),
											isEdit ? React.createElement("span", { style: { flexShrink: 0, fontSize: 11, color: ACCENT, fontWeight: 700 } }, "✎") : null,
											React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: isEdit && t.file ? ACCENT : TXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: CODE } }, isEdit && t.file ? t.file : t.name),
											t.args ? React.createElement("span", { style: { fontSize: 11, color: TXT2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: CODE, minWidth: 0 } }, isEdit && t.file ? "" : t.args) : null,
										),
									);
								}) : React.createElement("div", { style: { color: TXT2, fontSize: 13, padding: "18px 6px", textAlign: "center" } }, "暂无工具调用轨迹")),
							),
							(sideTab === "chat" && props.inputActions) ? React.createElement("div", { style: { borderTop: "1px solid " + BORDER, padding: "7px 10px 9px", background: LAYER } },
								React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "flex-end", border: "1px solid " + (composerFocus ? ACCENT : BORDER), borderRadius: 10, background: INPUTBG, padding: 4, transition: "border-color .15s" } },
									React.createElement("textarea", { ref: composerRef, value: msg, onChange: (e) => setMsg(e.target.value), onKeyDown: (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }, onFocus: () => setComposerFocus(true), onBlur: () => setComposerFocus(false), placeholder: "给 agent 发消息…", rows: 2, style: { flex: 1, background: "transparent", color: TXT, border: "none", outline: "none", borderRadius: 6, fontSize: 13, lineHeight: "20px", resize: "none", fontFamily: "inherit", padding: "3px 4px" } }),
									React.createElement("button", { onClick: sendMsg, disabled: !msg.trim(), title: "发送 (Enter)", style: { width: 30, height: 30, borderRadius: 15, flexShrink: 0, cursor: "pointer", background: msg.trim() ? ACCENT : "rgba(128,128,128,.35)", color: "#fff", border: "none", fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" } }, "➤"),
								),
								React.createElement("div", { style: { fontSize: 11, color: TXT3, marginTop: 4 } }, "Enter 发送 · Shift+Enter 换行"),
							) : null,
						),
					) : null,
				),
				// ── 保存历史弹层（版本列表 + 预览 + 一键恢复） ──
				histOpen ? React.createElement("div", { style: { position: "absolute", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 } },
					React.createElement("div", { style: { width: 700, maxWidth: "100%", height: "80%", background: BG, border: "1px solid " + BORDER, borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,.35)" } },
						React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid " + BORDER, background: LAYER } },
							React.createElement("span", { style: { fontWeight: 600, fontSize: 13 } }, "保存历史 — " + (active ? active.name : "")),
							React.createElement("span", { style: { fontSize: 11, color: TXT3 } }, histVersions.length + " 个版本"),
							React.createElement("span", { style: { flex: 1 } }),
							React.createElement("button", { style: { ...btn, padding: "2px 8px" }, onClick: () => setHistOpen(false) }, "关闭"),
						),
						React.createElement("div", { style: { display: "flex", flex: 1, minHeight: 0 } },
							React.createElement("div", { style: { width: 250, flexShrink: 0, borderRight: "1px solid " + BORDER, overflow: "auto", padding: 4 } },
								histVersions.length ? histVersions.map((v) => React.createElement("div", { key: v.time, style: { padding: "4px 8px", borderRadius: 6, cursor: "pointer", background: (histPreview && histPreview.time === v.time) ? GHOST : "transparent", display: "flex", alignItems: "center", gap: 6 }, onClick: () => previewHistory(v.time) },
									React.createElement("span", { style: { flex: 1, minWidth: 0, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, fmtStamp(v.time)),
									React.createElement("span", { style: { fontSize: 11, color: TXT3, flexShrink: 0 } }, fmtSize(v.size)),
									React.createElement("button", { style: { ...btn, padding: "1px 8px", fontSize: 12 }, onClick: (ev) => { ev.stopPropagation(); restoreHistory(v.time); } }, "恢复"),
								)) : React.createElement("div", { style: { color: TXT2, fontSize: 12, padding: 12, textAlign: "center" } }, "暂无历史版本（每次保存自动备份）"),
							),
							React.createElement("div", { style: { flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" } },
								React.createElement("div", { style: { padding: "4px 10px", fontSize: 11, color: TXT3, borderBottom: "1px solid " + BORDER } }, histPreview ? "预览: " + fmtStamp(histPreview.time) : "点击左侧版本查看内容预览"),
								React.createElement("pre", { style: { flex: 1, margin: 0, padding: 8, overflow: "auto", fontFamily: CODE, fontSize: 12, lineHeight: 1.6, color: TXT, whiteSpace: "pre-wrap", wordBreak: "break-word" } }, histPreview ? histPreview.content : ""),
							),
						),
					),
				) : null,
				// ── 检查点修改面板（文件/hunk 列表 + 全部/个别通过或撤回 + 跳转） ──
				cpOpen ? React.createElement("div", { style: { position: "absolute", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 62, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 } },
					React.createElement("div", { style: { width: 720, maxWidth: "100%", height: "82%", background: BG, border: "1px solid " + BORDER, borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,.35)" } },
						React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid " + BORDER, background: LAYER, flexWrap: "wrap" } },
							React.createElement("span", { style: { fontWeight: 600, fontSize: 13 } }, "检查点修改"),
							React.createElement("select", { value: cpActive || "", onChange: (e) => pickCp(e.target.value), style: { background: INPUTBG, color: TXT, border: "1px solid " + BORDER, borderRadius: 6, fontSize: 12, padding: "2px 6px", outline: "none" } },
								cpList.length ? cpList.map((c) => React.createElement("option", { key: c.id, value: c.id }, fmtStamp(c.id) + "（" + c.files + " 文件）")) : React.createElement("option", { value: "" }, "暂无检查点"),
							),
							React.createElement("span", { style: { fontSize: 12, color: cpChanged ? ACCENT : TXT3 } }, cpChanged ? (cpDiff.summary.files + " 个文件，+" + cpDiff.summary.added + " -" + cpDiff.summary.removed) : "无修改"),
							React.createElement("span", { style: { flex: 1 } }),
							React.createElement("button", { style: { ...btn, padding: "2px 10px" }, onClick: () => acceptCp(undefined), disabled: !cpChanged }, "全部通过"),
							React.createElement("button", { style: { ...btn, padding: "2px 10px" }, onClick: () => revertCp(undefined), disabled: !cpChanged }, "全部撤回"),
							React.createElement("button", { style: { ...btn, padding: "2px 8px" }, onClick: () => setCpOpen(false) }, "关闭"),
						),
						React.createElement("div", { style: { flex: 1, minHeight: 0, overflow: "auto", padding: 6 } },
							cpDiff && cpDiff.files.length ? cpDiff.files.map((f) => {
								const open = !!cpExpanded[f.rel];
								return React.createElement("div", { key: f.rel, style: { border: "1px solid " + BORDER, borderRadius: 8, marginBottom: 6, overflow: "hidden", background: LAYER } },
									React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer" }, onClick: () => setCpExpanded((prev) => { const n = { ...prev }; n[f.rel] = !open; return n; }) },
										React.createElement("span", { style: { width: 12, fontSize: 10, color: TXT3 } }, open ? "▾" : "▸"),
										React.createElement("span", { style: { flex: 1, minWidth: 0, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, f.rel),
										React.createElement("span", { style: { fontSize: 11, color: SUCCESS, flexShrink: 0 } }, "+" + f.added),
										React.createElement("span", { style: { fontSize: 11, color: ERRCOL, flexShrink: 0 } }, "-" + f.removed),
										React.createElement("button", { style: { ...btn, padding: "1px 8px", fontSize: 12, flexShrink: 0 }, onClick: (ev) => { ev.stopPropagation(); acceptCp(f.rel); } }, "通过"),
										React.createElement("button", { style: { ...btn, padding: "1px 8px", fontSize: 12, flexShrink: 0 }, onClick: (ev) => { ev.stopPropagation(); revertCp(f.rel); } }, "撤回"),
									),
									open ? React.createElement("div", { style: { borderTop: "1px solid " + BORDER, padding: "4px 6px 6px 22px" } },
										(f.hunks || []).map((h, i) => React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 8, padding: "3px 6px", borderRadius: 5, cursor: "pointer", fontSize: 12 }, onClick: () => jumpCpFile(f.rel, Math.max(1, h.newStart)) },
											React.createElement("span", { style: { width: 14, fontSize: 10, color: h.type === "add" ? SUCCESS : h.type === "del" ? ERRCOL : "#569cd6" } }, h.type === "add" ? "+" : h.type === "del" ? "-" : "~"),
											React.createElement("span", { style: { color: TXT2 } }, "L" + h.newStart + (h.newCount > 0 ? " (+" + h.newCount + ")" : "") + (h.oldCount > 0 ? " (-" + h.oldCount + ")" : "")),
											React.createElement("span", { style: { flex: 1 } }),
											React.createElement("span", { style: { fontSize: 11, color: TXT3 } }, "点击跳转"),
										)),
									) : null,
								);
							}) : React.createElement("div", { style: { color: TXT2, fontSize: 13, padding: "20px 6px", textAlign: "center" } },
								cpList.length ? "当前基线下没有文件修改" : "还没有基线 — 发一条消息或保存一次文件后自动建立，agent 的修改会在这里列出"),
							),
						),
					) : null,
					// ── 素材/字体预览浮窗（右下角/可拖动；点资源弹出、✕ 关闭） ──
					(previewImg || previewAudio || previewFont) ? React.createElement("div", { ref: floatRef, style: { position: "absolute", ...(floatPos ? { left: floatPos.x, top: floatPos.y } : { right: 14, bottom: 34 }), width: previewFont ? 360 : 320, maxWidth: "80%", background: BG, border: "1px solid " + BORDER, borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,.35)", overflow: "hidden", zIndex: 55 } },
						React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderBottom: "1px solid " + BORDER, background: LAYER, cursor: "grab", userSelect: "none" }, onMouseDown: onFloatDown, title: "拖动移动位置" },
							React.createElement("span", { style: { flex: 1, minWidth: 0, fontSize: 11, color: TXT3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, previewImg ? previewImg : previewAudio ? previewAudio : previewFont.rel),
							React.createElement("span", { style: { fontSize: 12, color: TXT2, cursor: "pointer", flexShrink: 0 }, onClick: () => { setPreviewImg(null); setPreviewAudio(null); setPreviewFont(null); }, title: "关闭预览" }, "✕"),
						),
						previewImg ? React.createElement("img", { src: assetUrl(previewImg), style: { maxWidth: "100%", maxHeight: 260, display: "block", margin: "auto" } }) : null,
						previewAudio ? React.createElement("div", { style: { padding: 8 } },
							React.createElement("audio", { src: assetUrl(previewAudio), controls: true, style: { width: "100%" } }),
						) : null,
						// 字体预览：真实字体渲染示例（FontFace 加载后生效）
						previewFont ? React.createElement("div", { style: { padding: 10, display: "flex", flexDirection: "column", gap: 8 } },
							React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: TXT2 } },
								React.createElement("span", { style: { fontWeight: 600, color: TXT } }, "🔤 字体预览"),
								React.createElement("span", { style: { flex: 1 } }),
								React.createElement("span", {}, fmtSize(previewFont.size || 0)),
							),
							React.createElement("div", { style: { background: "rgba(255,255,255,.04)", borderRadius: 6, padding: "12px 14px", lineHeight: 1.9, fontSize: 20 } },
								React.createElement("div", { style: { fontFamily: "'" + ensureFont(previewFont.rel) + "', sans-serif" } }, "字体预览 Font Preview 0123456789"),
								React.createElement("div", { style: { fontFamily: "'" + ensureFont(previewFont.rel) + "', sans-serif" } }, "你好，Ren'Py 文本样式预览"),
								React.createElement("div", { style: { fontFamily: "'" + ensureFont(previewFont.rel) + "', sans-serif", fontSize: 14, color: TXT2 } }, "The quick brown fox jumps over the lazy dog"),
							),
							React.createElement("div", { style: { fontSize: 11, color: TXT3, lineHeight: 1.6 } }, "引擎用法：`{font=" + previewFont.rel + "}…{/font}`（或 `{font=文件名}`）。字体文件位于项目 game/ 下，{font} 参数为相对 game/ 的路径或文件名；预览模式中 {font} 会自动真实渲染该字体。"),
						) : null,
					) : null,
					// ── Ren'Py → Python 转换浮窗（右下角，可关闭） ──
					pyConv ? React.createElement("div", { style: { position: "absolute", right: 14, bottom: 34, width: 380, maxWidth: "85%", background: BG, border: "1px solid " + BORDER, borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,.35)", overflow: "hidden", zIndex: 54 } },
						React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderBottom: "1px solid " + BORDER, background: LAYER } },
							React.createElement("span", { style: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: TXT } }, "⇄ Ren'Py → Python"),
							React.createElement("span", { style: { fontSize: 11, color: TXT3 } }, "L" + pyConv.line),
							React.createElement("span", { style: { fontSize: 12, color: TXT2, cursor: "pointer", flexShrink: 0 }, onClick: () => setPyConv(null), title: "关闭" }, "✕"),
						),
						React.createElement("div", { style: { padding: 8, display: "flex", flexDirection: "column", gap: 6 } },
							React.createElement("div", { style: { fontSize: 10, color: TXT3, marginBottom: 1 } }, "Ren'Py"),
							React.createElement("div", { style: { background: "rgba(86,156,214,.12)", borderRadius: 5, padding: "5px 8px", fontFamily: CODE, fontSize: 12, color: "#569cd6", whiteSpace: "pre-wrap", wordBreak: "break-word" } }, pyConv.rpy),
							React.createElement("div", { style: { fontSize: 10, color: TXT3, marginBottom: 1 } }, "Python 等价"),
							React.createElement("div", { style: { background: "rgba(212,172,200,.1)", borderRadius: 5, padding: "5px 8px", fontFamily: CODE, fontSize: 12, color: "#c586c0", whiteSpace: "pre-wrap", wordBreak: "break-word" } }, pyConv.py),
							pyConv.note ? React.createElement("div", { style: { fontSize: 11, color: TXT2 } }, "💡 " + pyConv.note) : null,
						),
					) : null,
					// ── 打字动画预览浮窗（出字速度/间隔：预览模式下点击 say 行播放；可拖标题栏） ──
					(animLine !== null && animData) ? React.createElement("div", { ref: animRef, style: { position: "absolute", left: animPos ? animPos.x : undefined, top: animPos ? animPos.y : undefined, right: animPos ? undefined : 14, bottom: animPos ? undefined : 34, width: 430, maxWidth: "88%", background: BG, border: "1px solid " + BORDER, borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,.35)", overflow: "hidden", zIndex: 57 } },
						React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderBottom: "1px solid " + BORDER, background: LAYER, cursor: "move", userSelect: "none" }, onMouseDown: onAnimDown, title: "拖动标题栏移动位置" },
							React.createElement("span", { style: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: TXT } }, "▶ 打字动画预览 L" + animLine + " · 速度 " + animData.cps + " 字/秒（" + animData.src + "）"),
							React.createElement("button", { style: { ...btn, padding: "1px 10px", fontSize: 12 }, onClick: () => setAnimSeq((s) => s + 1), title: "重新播放" }, "▶ 重播"),
							React.createElement("span", { style: { fontSize: 12, color: TXT2, cursor: "pointer", flexShrink: 0 }, onMouseDown: (e) => e.stopPropagation(), onClick: () => { setAnimLine(null); setAnimProg(null); }, title: "关闭" }, "✕"),
						),
						React.createElement("div", { style: { padding: 12, minHeight: 48, fontSize: 22, lineHeight: 1.7, background: "rgba(255,255,255,.04)", color: TXT, whiteSpace: "pre-wrap", wordBreak: "break-word" } },
							animProg === null
								? React.createElement("span", { style: { color: TXT3, fontSize: 13 } }, "▶ 准备播放…")
								: animData.nodes.slice(0, animProg.ni).map((n, i) => playNodeEl(n, 9999, "f" + i)).concat(
									animProg.ni < animData.nodes.length ? [playNodeEl(animData.nodes[animProg.ni], animProg.ci, "cur")] : []
								).concat(
									animProg.ni >= animData.nodes.length
										? React.createElement("span", { key: "done", style: { color: SUCCESS, fontSize: 11, marginLeft: 6 } }, "✓ 播放完成")
										: React.createElement("span", { key: "caret", style: { display: "inline-block", width: 2, height: 22, background: "#e0e0e0", verticalAlign: "text-bottom", marginLeft: 1 } })
								),
						),
						React.createElement("div", { style: { padding: "5px 10px", fontSize: 11, color: TXT3, borderTop: "1px solid " + BORDER, lineHeight: 1.6 } },
							"{cps=} 控制出字速度（默认 20 字/秒）· {w=1.0}/{p=1.0} 按秒停顿（无参数约 0.5s）· {nw} 结束不等待 · 点击编辑器其他 say 行切换预览",
						),
					) : null,
					// ── GUI 主题定制面板（🎨 按钮打开；分辨率/主题色/字号/字体 → 写回 gui.rpy） ──
					(guiOpen && guiVars) ? React.createElement("div", { style: { position: "absolute", right: 14, bottom: 34, width: 460, maxWidth: "90%", background: BG, border: "1px solid " + BORDER, borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,.35)", overflow: "hidden", zIndex: 58 } },
						React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderBottom: "1px solid " + BORDER, background: LAYER } },
							React.createElement("span", { style: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: TXT } }, "🎨 GUI 主题定制"),
							React.createElement("span", { style: { fontSize: 11, color: TXT3 } }, "gui.rpy"),
							React.createElement("span", { style: { fontSize: 12, color: TXT2, cursor: "pointer", flexShrink: 0 }, onClick: () => setGuiOpen(false), title: "关闭" }, "✕"),
						),
						React.createElement("div", { style: { padding: 10, display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflow: "auto" } },
							React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12 } },
								React.createElement("span", { style: { width: 70, color: TXT2, flexShrink: 0 } }, "分辨率"),
								React.createElement("input", { type: "number", value: guiVars.width || 1280, onChange: (e) => setGuiForm((f) => Object.assign({}, f, { width: parseInt(e.target.value, 10) || 0 })), style: { width: 70, background: INPUTBG, color: TXT, border: "1px solid " + BORDER, borderRadius: 5, fontSize: 12, padding: "2px 6px" } }),
								React.createElement("span", { style: { color: TXT3 } }, "×"),
								React.createElement("input", { type: "number", value: guiVars.height || 720, onChange: (e) => setGuiForm((f) => Object.assign({}, f, { height: parseInt(e.target.value, 10) || 0 })), style: { width: 70, background: INPUTBG, color: TXT, border: "1px solid " + BORDER, borderRadius: 5, fontSize: 12, padding: "2px 6px" } }),
								React.createElement("span", { style: { fontSize: 10, color: TXT3 } }, "gui.init(宽, 高)"),
							),
							React.createElement("div", { style: { fontSize: 10, color: TXT3, borderBottom: "1px solid " + BORDER, paddingBottom: 4 } }, "主题色（颜色框直接选；无定义项会追加）"),
							[["accent_color", "强调色"], ["idle_color", "按钮空闲"], ["hover_color", "悬停"], ["selected_color", "选中"], ["insensitive_color", "禁用"], ["text_color", "对话文本"], ["interface_text_color", "界面文本"]].map(([name, label]) => React.createElement("div", { key: name, style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12 } },
								React.createElement("span", { style: { width: 70, color: TXT2, flexShrink: 0 } }, label),
								React.createElement("input", { type: "color", value: (/^#[0-9a-fA-F]{6}/.exec(guiVars.vars["gui." + name] || "#888888") || [])[0] || "#888888", onChange: (e) => setGuiForm((f) => { const v = Object.assign({}, f.vars); v["gui." + name] = e.target.value; return Object.assign({}, f, { vars: v }); }), style: { width: 42, height: 26, border: "1px solid " + BORDER, borderRadius: 5, background: "transparent", padding: 0 } }),
								React.createElement("span", { style: { fontSize: 10, color: TXT3, fontFamily: CODE, flex: 1, overflow: "hidden", textOverflow: "ellipsis" } }, "gui." + name + " = " + (guiVars.vars["gui." + name] || "（未定义）")),
							)),
							React.createElement("div", { style: { fontSize: 10, color: TXT3, borderBottom: "1px solid " + BORDER, paddingBottom: 4 } }, "字号（像素）"),
							[["text_size", "对话"], ["name_text_size", "角色名"], ["interface_text_size", "界面"], ["title_text_size", "标题"]].map(([name, label]) => React.createElement("div", { key: name, style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12 } },
								React.createElement("span", { style: { width: 70, color: TXT2, flexShrink: 0 } }, label),
								React.createElement("input", { type: "number", value: parseInt(guiVars.vars["gui." + name], 10) || 0, onChange: (e) => setGuiForm((f) => { const v = Object.assign({}, f.vars); v["gui." + name] = String(parseInt(e.target.value, 10) || 0); return Object.assign({}, f, { vars: v }); }), style: { width: 60, background: INPUTBG, color: TXT, border: "1px solid " + BORDER, borderRadius: 5, fontSize: 12, padding: "2px 6px" } }),
								React.createElement("span", { style: { fontSize: 10, color: TXT3, fontFamily: CODE } }, "gui." + name),
							)),
							React.createElement("div", { style: { display: "flex", gap: 8, paddingTop: 4 } },
								React.createElement("button", { style: { ...btnPrimary, flex: 1 }, onClick: saveGuiChanges }, "保存到 gui.rpy"),
								React.createElement("button", { style: { ...btn, flex: 1 }, onClick: () => { setGuiOpen(false); openFile("gui.rpy"); }, title: "关闭面板并打开 gui.rpy" }, "查看源码"),
							),
						),
					) : null,
					// ── 学习注释结果提示条（生成中/完成，带清除入口） ──
					(learnBusy || learnResult) ? React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "3px 10px", borderBottom: "1px solid " + (learnResult ? "rgba(76,175,80,.3)" : "rgba(100,160,255,.25)"), background: learnResult ? "rgba(76,175,80,.1)" : "rgba(100,160,255,.08)", fontSize: 11, color: learnResult ? SUCCESS : "#569cd6", flexShrink: 0 } },
						React.createElement("span", { style: { fontWeight: 600 } }, learnBusy ? "⏳ AI 生成中…" : "✅ 学习注释完成"),
						React.createElement("span", { style: { color: TXT2 } }, learnBusy ? "正在逐行生成（每行一次 AI 调用，可能需要数十秒）" : ("已写入 " + (learnResult.added || 0) + " 条（" + learnResult.scopeLabel + "；失败 " + (learnResult.failed || 0) + " 条）")),
						React.createElement("span", { style: { marginLeft: "auto" } }),
						(!learnBusy && learnResult) ? React.createElement("button", { style: { ...btn, padding: "1px 10px", fontSize: 11 }, onClick: clearLearnAll, title: "清除当前文件（或工作区域内）全部学习注释" }, "🗑 清除全部") : null,
					) : null,
					// ── 学习注释批量确认（消耗 AI 资源，需用户确认） ──
					learnConfirm ? React.createElement("div", { style: { position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", zIndex: 80, background: BG, border: "1px solid " + BORDER, borderRadius: 10, boxShadow: "0 10px 34px rgba(0,0,0,.5)", padding: "14px 18px", maxWidth: 420, color: TXT } },
						React.createElement("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 8 } }, "📖 批量生成 AI 学习注释？"),
						React.createElement("div", { style: { fontSize: 12, lineHeight: 1.6, color: TXT2, marginBottom: 4 } },
							"将给「" + learnConfirm.scopeLabel + "」的 " + learnConfirm.targets.length + " 条语句生成「# 📖 学习:」注释块（每条基于对应 renpy-* skill 全文 + AI 讲解）。"),
						React.createElement("div", { style: { fontSize: 12, color: "#e5c07b", marginBottom: 12 } }, "⚠ 每条注释调用一次 AI 模型（消耗 token 资源，" + learnConfirm.targets.length + " 条共约需数十秒）；写入后受工作区域限制，可在结果条点「清除全部」移除。"),
						React.createElement("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" } },
							React.createElement("button", { style: { ...btn, padding: "3px 14px" }, onClick: cancelTeach }, "取消"),
							React.createElement("button", { style: { ...btnPrimary, padding: "3px 14px" }, onClick: confirmTeach }, "确认生成"),
						),
					) : null,
					// ── 状态栏（规范 §2：项目 | 运行状态 | 文件 | 行列 | 保存态） ──
					React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14, padding: "2px 10px", borderTop: "1px solid " + BORDER, background: LAYER, fontSize: 11, color: TXT3, flexShrink: 0, minHeight: 22, whiteSpace: "nowrap" } },
						React.createElement("span", { style: { maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", color: TXT2 } }, project ? String(project).split(/[\\/]/).pop() : "未选项目"),
						React.createElement("span", { style: { color: routeStatus && routeStatus.running ? SUCCESS : TXT3 } }, (routeStatus && routeStatus.running) ? "🟢 运行中" + (routeStatus.label ? " · " + routeStatus.label : "") : "⚪ 未运行"),
						React.createElement("span", { style: { maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" } }, active ? active.name : "未打开文件"),
						React.createElement("span", {}, "行 " + cursorPos.line + "，列 " + cursorPos.col),
						React.createElement("span", { style: { flex: 1 } }),
						active ? React.createElement("span", { style: { color: active.dirty ? ERRCOL : SUCCESS } }, active.dirty ? "● 未保存" : "✓ 已保存") : null,
						React.createElement("span", {}, ".rpy"),
					),
			);
		}

		// ── 应用级布局（浏览器验证版，默认关闭）────────────────────────────
		// 启用方式：URL 加 ?renpylayout=1。用 priority:-1 正确 shadow 系统注册的
		// conversation.session（priority 0），避免同优先级冲突。
		class ErrBoundary extends React.Component {
			constructor(p) { super(p); this.state = { err: null }; }
			static getDerivedStateFromError(e) { return { err: String((e && e.message) || e) }; }
			render() {
				if (this.state.err) return React.createElement("div", { style: { color: "#ff8080", padding: 8, fontSize: 12 } }, "区域渲染失败: " + this.state.err);
				return this.props.children;
			}
		}

		function SessionLayout(props) {
			const [sideOpen, setSideOpen] = React.useState(true);
			const [sideView, setSideView] = React.useState("chat");
			const rs = props && props.renderSlot;
			const tv = (n) => "var(" + n + ")";
			const BORDER = tv("--dsw-alias-border-l1");
			const TXT = tv("--dsw-alias-label-primary");
			const TXT2 = tv("--dsw-alias-label-secondary");
			const ACCENT = tv("--dsw-alias-brand-primary");
			const BG = tv("--dsw-alias-bg-base");
			const LAYER = tv("--dsw-alias-bg-layer-1");
			const SIDEFILL = tv("--dsw-specific-sidebar-fill");
			const chip = (act) => ({ padding: "2px 10px", fontSize: 12, cursor: "pointer", background: act ? "rgba(100,160,255,.25)" : "transparent", border: "1px solid " + (act ? ACCENT : BORDER), borderRadius: 4, color: TXT, whiteSpace: "nowrap" });
			const sideEl = rs ? (sideView === "chat" ? rs("conversation.view", { only: "chat" }) : rs("conversation.view", { only: "trajectory" })) : React.createElement("div", { style: { color: TXT2, fontSize: 12, padding: 8 } }, "renderSlot 不可用");

			return React.createElement("div", { style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: BG, color: TXT } },
				React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", padding: "4px 10px", borderBottom: "1px solid " + BORDER, background: LAYER, flexWrap: "wrap" } },
					React.createElement("span", { style: { color: TXT2, fontSize: 12 } }, "Ren'Py 开发工作区"),
					React.createElement("span", { style: { flex: 1 } }),
					React.createElement("span", { style: chip(sideOpen), onClick: () => setSideOpen(!sideOpen) }, sideOpen ? "收起侧栏" : "展开侧栏"),
				),
				React.createElement("div", { style: { display: "flex", flex: 1, minHeight: 0 } },
					React.createElement("div", { style: { flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" } },
						React.createElement(ErrBoundary, null, React.createElement(RenpyPanel, { sessionId: props.sessionId, inputActions: props.inputActions, hideSidebar: true })),
					),
					sideOpen ? React.createElement("div", { style: { width: 360, borderLeft: "1px solid " + BORDER, background: SIDEFILL, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } },
						React.createElement("div", { style: { display: "flex", gap: 4, padding: "4px 8px", borderBottom: "1px solid " + BORDER } },
							React.createElement("span", { style: chip(sideView === "chat"), onClick: () => setSideView("chat") }, "对话"),
							React.createElement("span", { style: chip(sideView === "trajectory"), onClick: () => setSideView("trajectory") }, "轨迹"),
						),
						React.createElement("div", { style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } },
							React.createElement(ErrBoundary, null, sideEl),
						),
					) : null,
				),
			);
		}

		// ── 应用级布局（浏览器验证版，默认关闭）────────────────────────────
		function apply(ctx) {
			const slots = ctx.get("slots");
			if (slots === undefined) return;
			slots.inject("conversation.view", () => slots.register(
				{ name: "conversation.view", id: "renpy-dev", order: 20, label: "Ren'Py" },
				(props) => React.createElement(RenpyPanel, { sessionId: props && props.sessionId, inputActions: props && props.inputActions }),
			));
			// 应用级布局：API 限制（renderSlot 需重复声明 children，而 conversation.view 已被官方声明，重复声明抛错），
			// 因此侧栏无法渲染原生对话视图 → 默认关闭，回到面板级方案。
			// 若要实验：?renpylayout=1 或 localStorage.renpyLayout='1'
			let enableLayout = false;
			try {
				if (typeof window !== "undefined" && window.location) {
					if (window.location.search.indexOf("renpylayout=1") >= 0) enableLayout = true;
					if (typeof localStorage !== "undefined" && localStorage.getItem("renpyLayout") === "1") enableLayout = true;
				}
			} catch (e) { enableLayout = false; }
			if (enableLayout) {
				slots.inject("conversation.session", () => slots.register(
					{ name: "conversation.session", priority: -1 },
					(props) => React.createElement(SessionLayout, props),
				));
			}
		}

		exports.name = name;
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});
