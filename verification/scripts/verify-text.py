# 混合流程③：引擎验证——用 SDK 内置 Python 3.12 无头验证文本子系统
# 覆盖：interpolate（变量/表达式/flags/格式符）、tokenize（文本标签）、转义
# 用法: <sdk>/lib/py3-windows-x86_64/python.exe verify-text.py <sdk-dir>
import sys, os

SDK = sys.argv[1]
sys.path.insert(0, SDK)

import renpy
renpy.import_all()  # 按引擎自身顺序导入全部模块（与 renpy.py 启动一致）
import types
# py_compile 的字节码缓存需要 game.script —— 打最小桩（空缓存，不影响替换逻辑）
renpy.game.script = types.SimpleNamespace(bytecode_oldcache={}, bytecode_newcache={})
import renpy.text.textsupport as ts
from renpy.substitutions import interpolate, parse

passed = 0
failed = 0

def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print("PASS", name)
    else:
        failed += 1
        print("FAIL", name, "|", detail)

# ---------- 插值 ----------
scope = {"playername": "Aiko", "points": 8, "max_points": 10, "mood": "happy", "x": 3.14159}

# 基础变量 / 表达式 / 格式符
check("interp 基础变量", interpolate("hi [playername]", scope) == "hi Aiko")
check("interp 表达式", interpolate("[points + 1]", scope) == "9")
# 格式符透传给 Python format()（引擎行为 == format(value, fmt)）
fmt_out = interpolate("[100.0 * points / max_points:.2]", scope)
check("interp 格式透传", fmt_out == format(100.0 * 8 / 10, ".2"), "got %r" % fmt_out)
check("interp 属性链", interpolate("[x:04.1f]", scope) == "03.1")

# flags: r s t i q u l c（t 需要翻译模块，跳过；i 递归；q 转义花括号）
check("interp !u", interpolate("[mood!u]", scope) == "HAPPY")
check("interp !l", interpolate("[mood!l]", scope) == "happy")
check("interp !c", interpolate("[mood!c]", scope) == "Happy")
# !q 只作用于被插值的值（文本标签 {} 在源码中保持原样）
q_out = interpolate("[playername!q] says {b}hi{/b}", scope)
check("interp !q", q_out == "Aiko says {b}hi{/b}", "got %r" % q_out)
q2_out = interpolate("x[s!q]", {"s": "a{b}c"})
check("interp !q 加倍左花括号", q2_out == "xa{{b}c", "got %r" % q2_out)
check("interp !r repr", interpolate("[x!r]", scope) == repr(3.14159))
check("interp !s str", interpolate("[x!s]", scope) == "3.14159")
check("interp 多 flag !ul 顺序无关", interpolate("[playername!ul]", scope) == interpolate("[playername!lu]", scope))
# !i 递归插值
nested = {"a": "hello [b]", "b": "world"}
check("interp !i 递归", interpolate("[a!i]", nested) == "hello world")
# [expr=] → repr 调试形式
check("interp [x=] 调试", interpolate("[points=]", scope) == "points=8")

# 字面量：[[ 由 parse() 处理；{{ 是文本标签转义，由 tokenize 处理（此处验证 interpolate 不过滤）
check("interp [[ 字面左括号", interpolate("[[bracket]", scope) == "[bracket]")
check("interp 花括号原样", interpolate("{{tag}}", scope) == "{{tag}}", "got %r" % interpolate("{{tag}}", scope))
try:
    interpolate("[nope]", scope)
    check("interp 缺变量", False, "should raise")
except Exception:
    check("interp 缺变量", True)

# ---------- 分词：文本标签 ----------
# textsupport.tokenize: (1, TEXT) (2, TAG) (3, PARAGRAPH?)
def tags_of(s):
    return [t for t in ts.tokenize(s) if t[0] == 2]

def text_of(s):
    return "".join(t[1] for t in ts.tokenize(s) if t[0] == 1)

ALL_TAGS = [
    ("b", "b"), ("i", "i"), ("u", "u"), ("s", "s"), ("plain", "plain"),
    ("size=+10", "size"), ("size=-10", "size"), ("size=24", "size"), ("size=*2", "size"),
    ("color=#f00", "color"), ("color=#00ff00", "color"), ("color=#0000ffff", "color"),
    ("alpha=0.5", "alpha"), ("alpha=-0.1", "alpha"), ("alpha=*0.5", "alpha"),
    ("font=mikachan.ttf", "font"), ("k=.5", "k"), ("space=30", "space"),
    ("vspace=30", "vspace"), ("cps=20", "cps"), ("cps=*2", "cps"),
    ("a=https://renpy.org", "a"), ("a=jump:more_text", "a"), ("a=call:sub", "a"),
    ("w", "w"), ("p", "p"), ("nw", "nw"), ("fast", "fast"), ("done", "done"),
    ("image=heart.png", "image"), ("alt", "alt"), ("noalt", "noalt"),
    ("rt", "rt"), ("rb", "rb"), ("art", "art"),
    ("outlinecolor=#00ff00", "outlinecolor"), ("shader=jitter", "shader"),
    ("feature:liga=0", "feature:liga"), ("#playlist", "#playlist"),
    ("=mystyle", ""),  # 样式标签 {=mystyle}
]
for tag_src, expected in ALL_TAGS:
    t = tags_of("x{%s}y{/%s}" % (tag_src, tag_src))
    ok = len(t) >= 1 and t[0][1].partition("=")[0] == expected
    check("tag {%s}" % tag_src, ok, str(t))

# 自闭合标签（无关闭）
for tag_src in ["w", "p", "nw", "fast", "done", "space=30", "vspace=30", "image=heart.png"]:
    t = tags_of("x{%s}y" % tag_src)
    check("自闭合 {%s}" % tag_src, len(t) == 1, str(t))

# 未知标签：textsupport 仍分词（TAG），错误在 Text 渲染时抛出 —— 由源码核验覆盖
t = tags_of("{zzz}unknown{/zzz}")
check("未知标签仍分词", len(t) == 2, str(t))

# 文本内容提取：标签被剥离
check("tokenize 剥标签", text_of("a {b}bold{/b} c") == "a bold c")

# ---------- 转义：lexer 层（引擎 parser 的 string() 处理） ----------
from renpy.lexer import Lexer, GroupedLine

def lex_string(src):
    """用引擎 Lexer 对一行 .rpy 源码做字符串解析（转义 + 空白折叠）"""
    lx = Lexer([GroupedLine("test.rpy", 1, 0, src, [])])
    lx.advance()
    lx.match(r"say\s+")  # 跳过语句前缀，使 pos 落在字符串开头
    return lx.string()

check("lex \\\" 引号", lex_string('say "a\\"b"') == "a\"b", "got %r" % lex_string('say "a\\"b"'))
check("lex \\' 引号", lex_string("say 'a\\'b'") == "a'b", "got %r" % lex_string("say 'a\\'b'"))
check("lex \\n 换行", lex_string('say "a\\nb"') == "a\nb", "got %r" % lex_string('say "a\\nb"'))
check("lex \\\\ 反斜杠", lex_string('say "a\\\\b"') == "a\\b", "got %r" % lex_string('say "a\\\\b"'))
check("lex \\% 百分号", lex_string('say "100\\%"') == "100%%", "got %r" % lex_string('say "100\\%"'))
check("lex \\{ 花括号转义", lex_string('say "\\{x\\}"') == "{{x}", "got %r" % lex_string('say "\\{x\\}"'))
check("lex \\[ 方括号转义", lex_string('say "\\[x\\]"') == "[[x]", "got %r" % lex_string('say "\\[x\\]"'))
check("lex \\uXXXX 中文", lex_string('say "\\u4f60\\u597d"') == "你好", "got %r" % lex_string('say "\\u4f60\\u597d"'))
# 空白折叠：多空格 → 单空格（非 raw 字符串，发生在反斜杠处理之前）
check("lex 空白折叠", lex_string('say "a   b"') == "a b", "got %r" % lex_string('say "a   b"'))
# 反斜杠空格：把空格排除出折叠 run，实现"额外空格"（实测 "a \\ b" → 两个空格）
bs_out = lex_string('say "a \\ b"')
check("lex 反斜杠空格", bs_out == "a  b", "got %r" % bs_out)
# raw 字符串 r"..." 不做转义/折叠
check("lex raw 字符串", lex_string('say r"a  b"') == "a  b", "got %r" % lex_string('say r"a  b"'))

# ---------- 文本标签转义 {{ / [[ 的渲染层行为 ----------
# {{ → 字面 {（tokenize 层）；[[ → 字面 [（substitute 层，见 interp [[ 测试）
check("tokenize {{ 字面", "".join(t[1] for t in ts.tokenize("{{b}")) == "{b}", "got %r" % ts.tokenize("{{b}"))
check("tokenize 字面 {tag} 写法", "".join(t[1] for t in ts.tokenize("{{tag}")) == "{tag}", "got %r" % ts.tokenize("{{tag}"))
check("tokenize }} 原样", "".join(t[1] for t in ts.tokenize("a }} b")) == "a }} b", "got %r" % ts.tokenize("a }} b"))

# ---------- 自定义文本标签机制（config.custom_text_tags 的纯逻辑） ----------
def custom_dispatch(s):
    """模拟 Text.apply_custom_tags 的查表逻辑"""
    out = []
    tokens = ts.tokenize(s)
    while tokens:
        kind, text = tokens.pop(0)
        if kind != 2:
            out.append((kind, text))
            continue
        tag, _, value = text.partition("=")
        if tag in ("wave",):  # 模拟 config.custom_text_tags 注册
            contents = []
            count = 1
            while tokens:
                k2, t2 = tokens.pop(0)
                if k2 == 2:
                    t2_ = t2.partition("=")[0]
                    if t2_ == tag:
                        count += 1
                    elif t2_ == "/" + tag:
                        count -= 1
                        if count == 0:
                            break
                contents.append((k2, t2))
            out.append(("CUSTOM", (tag, value, contents)))
        else:
            out.append((kind, text))
    return out

res = custom_dispatch("x {wave=3}deep{/wave} y")
check("自定义标签配对", len(res) == 3 and res[1][0] == "CUSTOM", str(res))
check("自定义标签内容", res[1][1][2][0] == (1, "deep"), str(res))

print("\n=== %d passed, %d failed ===" % (passed, failed))
sys.exit(1 if failed else 0)
