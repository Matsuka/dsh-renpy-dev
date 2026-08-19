# Ren'Py Development Mode — User Guide

> A feature introduction and operations manual for users. This document explains what this tool can do, how to open it, how to operate each step, what results to expect, and things to watch out for while using it.
>
> Companion docs: **Deployment** → `DEPLOY.md`, **Contributing** → `CONTRIBUTING.md`.
> **中文版** → `GUIDE.md`.

---

## 1. What this is

Ren'Py Development Mode is a **Ren'Py game development workbench** built into **DeepSeek Harness (DSH)**. It turns a normal AI coding conversation interface into a browser panel with a complete development toolchain:

- On the left is a **file/resource explorer**; in the middle is a **code editor** (syntax highlighting, autocomplete, find & replace, bracket matching, VSCode-like)
- The top toolbar provides **lint checking, running the game, screenshots, and automated tests**
- Every save auto-**backs up history**; every conversation auto-creates a **checkpoint** — you can roll back anytime
- You can chat with the AI to modify code; after the AI edits, you can **see the changes in real time** in the editor and review them
- Built-in **15 Ren'Py knowledge bases (skills)** that the AI loads on demand when writing Ren'Py code, reducing invented syntax

In one sentence: **the whole Ren'Py development loop — "read code → edit code → verify → run" — happens in the browser, with the AI involved throughout while you can see every step.**

### 1.1 Knowledge base (skill) list

> When writing Ren'Py code, the AI **loads the matching knowledge base on demand**; all are produced through "source verification + lint validation".

| skill | Coverage |
|---|---|
| `renpy-core` | Core statement syntax, statement ↔ Python equivalence, indentation & order conventions (must-read when writing .rpy) |
| `renpy-text` | Dialogue & text: say variants, Character, `[var]` interpolation, `{b}{size}{color}` tags, escaping |
| `renpy-atl` | ATL animation: transform, interpolation, on/parallel/choice/repeat, position/scale/rotation |
| `renpy-transitions` | Transitions: with dissolve/fade/move, Dissolve/Fade/CropMove/PushMove, per-layer transitions |
| `renpy-screen` | Screen language: layout, widgets, style prefixes, action, show/hide/call screen, use |
| `renpy-gui` | GUI theme: gui.init, gui.* colors/fonts/sizes, style override hierarchy |
| `renpy-api` | Python-layer API: renpy.*, persistent, renpy.music/sound, store variables |
| `renpy-l10n` | Localization: translate statements, old/new, extract/merge workflow |
| `renpy-save` | Saving: FileSave/Load/Page/Slot, autosave + Gallery / Music Room / Achievement |
| `renpy-layeredimage` | Layered images: layeredimage, attribute/group, expression variants, auto attribute |
| `renpy-sprites` | Particles (snow/falling leaves), Drag & Drop, Movie video |
| `renpy-route` | Route/branch design: doc ↔ state machine ↔ code conversion, reachability analysis |
| `renpy-test` | Automated testing: testsuite/testcase, run/advance/click, until, xfail |
| `renpy-build` | Build & release: build.rpy classify/archive/package, platform tags |
| `renpy-practices` | Best-practices overview: organization, asset management, cross-domain pitfall list |

### 1.2 Agent tool list

> The **13 development tools** that the "RenPy Dev" preset registers for the AI (the workbench buttons are wired to the same tools; the AI can call them on its own).

| Tool | Description |
|---|---|
| `renpy_scaffold` | Create a new project (directory structure + gui template) |
| `renpy_lint` | Official lint check |
| `renpy_index` | Generate/refresh the structure index (labels/defines/screens/transforms) |
| `renpy_find` | Static diagnostics (reference-integrity scan in seconds) |
| `renpy_guard` | Write-guard validation (indentation / reserved names / duplicate labels / bracket matching) |
| `renpy_read_error` | Structured read of error files (traceback / log / errors) |
| `renpy_route_generate` | route-map.json state machine → .rpy code skeleton |
| `renpy_run` | Launch the game (real window + debug bridge) |
| `renpy_stop` | Stop the game process |
| `renpy_status` | Query process status + recent output |
| `renpy_test` | rpytest automated tests (headless) |
| `renpy_compile` | Force recompilation of scripts (.rpy → .rpyc) |
| `renpy_screenshot` | Full-screen screenshot (for the AI to view the game) |

---

## 2. Environment and startup

### 2.1 Prerequisites (already configured)

| Item | Location / note |
|---|---|
| DSH | Installed and running on this machine (Web GUI `http://127.0.0.1:3080`) |
| Ren'Py SDK | Workspace `renpy-8.5.3-sdk/` (pinned to 8.5.x) |
| Ren'Py Development Mode | Mounted as the **RenPy Dev** agent preset; selectable in new sessions |
| Sample projects | `demo-script/` (for testing); SDK bundles `the_question/`, `tutorial/` |

### 2.2 Opening the development panel

1. Start a new session in the DSH Web GUI (or switch the preset to **RenPy Dev**)
2. Find the **"Ren'Py"** tab above the conversation tab and click it → the development panel appears
3. Enter your Ren'Py project path in the top input (a project root containing `game/`, e.g. `D:\my-game`) → click **⟳ Load**

> After loading, the file tree appears on the left and the editor on the right; the panel starts working.

### 2.3 Effect rules (important)

- **Only editor UI changed (client side)** → a browser **page refresh** is enough
- **Backend service changed (host side)** → requires a **dsh restart** (any feature documented as a host change works this way)
- **agent preset / skill changed** → takes effect in **new sessions** after a dsh restart

---

## 3. UI overview

```
┌─────────┬──────────────────────────────────────────────┬─────────┐
│ Control  │  Toolbar                                    │ Side    │
│ bar      │  Project path [input] ⟳ 🎯Scope ⚠Check      │ chat    │
│ (46px)   │  🧪Test ⟳Refresh 💾Save 📷Screenshot        │ panel   │
│          │  💬Chat ▶Run/■Stop                          │ (default)│
│ Edit     ├──────────────────────────────────────────────┤         │
│ tools    │  Editor (multi-file tabs + syntax highlight  │         │
│ Aa Preview│  + find bar)                                │         │
│ ⇄ Python │                                              │         │
│ 📖 Learn │                                              │         │
│ 🎨 GUI   │                                              │         │
│ ───────  │                                              │         │
│ Debug    ├──────────────────────────────────────────────┤         │
│ 🗺 Map    │  Bottom panel (log / lint results /         │         │
│ 🎬 Scene  │  test report)                               │         │
│ 📊 Vars   │                                              │         │
│ 🐞 Errors │                                              │         │
│ ✅ Diag   │                                              │         │
│ ───────  │                                              │         │
│ Views    │                                              │         │
│ 📄 Files  │                                              │         │
│ 🧭 Nav    │                                              │         │
│ 🖼 Assets │                                              │         │
│ ✎ Changes │                                              │         │
│ ───────  │                                              │         │
│ 📋 Log    │                                              │         │
│ 📜 History│                                              │         │
│ ⚙ Settings│  (⚙ Settings fixed at the bottom)          │         │
│ « Collapse│                                              │         │
└─────────┴──────────────────────────────────────────────┴─────────┘
```

> Icons in the diagram are illustrative; the real ones are unified-line-style SVG icons (the **codicon icon system**, with tooltips on hover):
> Run/Stop is a **single combined button** (▶ Run ↔ ■ Stop, toggling by state); static diagnostics use a ✅ **checklist** icon (a checklist, not a magnifying glass).

**Shortcuts**: `Ctrl+S` save ｜ `Ctrl+F` find/replace ｜ `Ctrl+/` toggle comment ｜ `Ctrl+Space` autocomplete ｜ `Ctrl+Shift+\` bracket jump ｜ `Enter` send message ｜ `Esc` close popup/floating window

---

## 4. Core feature usage

> Each feature is described as "how to operate → expected result → test points". ★ marks features recommended for priority testing.

### 4.1 Browsing projects and assets

- **Operate**: after loading a project, the **file tree** (📄, expands by directory, click to open) is at the top-left; below it is the **asset tree** (🖼 images / 🎵 audio / 🎬 video / 🔤 fonts / 📦 others; click a leaf to preview)
- **Expected**: the file tree lists all `.rpy` under `game/`; the asset tree shows items by category; clicking an image/audio opens a preview popup at the bottom-right (draggable)
- **Test points**: open 2-3 files to form multiple tabs; preview one image and one audio; after refresh (⟳) new files appear

### 4.2 Editing code ★

- **Operate**: click a `.rpy` in the file tree → the editor opens → type changes directly → `Ctrl+S` to save
- **Expected**: **autocomplete** pops up as you type statements (statements/characters/assets/snippets); brackets auto-pair; `Ctrl+/` comments; the status bar turns ✓ after saving
- **Test points**:
  - Type `menu`, `if`, `label` to see completion snippets
  - `Ctrl+F` find: verify match highlighting, `Enter/Shift+Enter` navigation, replace single/all
  - Modify without saving → a「📝 Unsaved changes +N lines -M lines [Save] [Revert]」bar appears below the editor
  - Have the AI modify the same file while unsaved → a「⚠ External change conflict」notice appears (local changes kept); closing the tab and reopening loads the external version

### 4.3 Syntax check (lint) ★

- **Operate**: click **⚠ Check** in the toolbar
- **Expected**: the lint panel below shows results; **lines with errors get red underlines in the editor**; clicking a lint entry jumps to the location
- **Test points**: deliberately delete a colon or quote from a statement → check → should report an error with an underline; after fixing, re-check should show 0 errors

### 4.4 Running the game and screenshots ★

- **Operate**: click **▶ Run** (actually opens the game window; **the button turns red and becomes ■ Stop**) → play to the position you want → click **📷 Screenshot** → click the same button again (**■ Stop**)
- **Expected**: the game window pops up; after the screenshot, it can be viewed in the panel/conversation (the AI can see the frame through the screenshot too); after stopping, the process closes and the button returns to ▶; **if the game exits by itself (window closed/crash), the button also auto-restores**
- **Test points**: run, take a screenshot, confirm a PNG of the current frame was generated; after stop the process closes (toolbar state resets); screenshots are at `.renpy-user/screenshots/`

### 4.5 Automated tests

- **Operate**: click **🧪 Test** when the project has a `testsuite`
- **Expected**: runs rpytest; the report bar shows ✓/✗ and the pass count; **Details** expands the full report
- **Test points**: demo-script's 2 built-in cases should all pass; breaking one flow should produce a failing case

### 4.6 Save history and rollback ★

- **Operate**: edit and save → click **📜 History** (control bar)
- **Expected**: a popup lists that file's historical versions (auto-backed-up on each save, newest first); click a version to preview it on the right; click **Restore** to revert in one click
- **Test points**: save 2-3 times, open history, restore the earliest version, confirm the file content is reverted; backups are at `.renpy-user/backups/`

### 4.7 Checkpoints and the changes panel ★

- **Operate**: chat normally to have the AI modify code (or save manually) → a **✎ Changes (N)** button appears in the toolbar with a change-count badge → click to open the changes panel
- **Expected**:
  - The panel lists `+A -B` line-level diffs per file; expanding a hunk shows the start line; clicking jumps the editor to the location
  - The editor gutter shows color markers (green=added, blue=modified, red=deleted)
  - You can **approve** or **revert** individual/all files; the side chat bottom has a「📌 persistent checkpoint」timeline to view/restore any historical checkpoint
- **Test points**: have the AI change a few lines → check the diff in the changes panel is accurate → **Revert** → file restored → **Approve** → baseline advances; the checkpoint timeline gets a new entry

### 4.8 Workspace locking ★

- **Operate**: select a few lines in the editor (or put the cursor on one) → click **🎯 Workspace** → a green region highlight appears; click the adjacent「✖ Clear」to release
- **Expected**: **editing outside the region is blocked** (input rejected with a notice); setting/releasing the region injects a【Workspace】constraint message into the conversation, so the AI's edits are limited to the region
- **Test points**:
  - Set lines 8-15, try typing outside → rejected
  - Have the AI modify the file → confirm it only touches code inside the region (the persona has an "ask before going out of bounds" rule)
  - After releasing the lock, the AI can edit freely

### 4.9 Learning annotations (AI teaching) ★

- **Operate**: open a `.rpy` → click **📖 Learn** → a confirm dialog appears (showing the scope: workspace region Lx-y / whole file + line count + cost notice) → confirm
- **Expected**: the AI generates `# 📖 Learn: <skill> (L<line>)` comment blocks for the statement lines in scope, written into the file (explaining "what this code does"); a result bar shows「Written N entries」+「🗑 Clear all」
- **Test points**:
  - Confirm the dialog text and scope are correct; after generation the file should pass lint (comments are legal)
  - After「Clear all」the annotations disappear
  - With workspace locking on, clicking 📖 annotates only the in-region lines
  - ⚠ This feature **consumes AI resources** (calls the model); large batches may be slow

### 4.10 Text style preview and typewriter animation

- **Operate**: open a file containing `say` text → click **Aa Preview** (click again to close)
- **Expected**: say text **renders with its styles directly** (bold/italic/underline/strikethrough/color/transparency/letter-spacing shown for real; font size/font/interpolation marked with yellow/blue/red backgrounds + hover tooltips); line height auto-expands
- **Typewriter animation**: in preview mode **click a say line** → a popup at the bottom-right plays the text character by character (speed reads the project config, e.g. `style say_dialogue: slow_cps 30`), ▶ replay, ✕ close
- **Test points**: verify lines with `{b}` `{color}` `{size}` `{font}` `{cps}` separately; a downgrade notice bar (⚠ style preview degraded) appears when precise rendering isn't possible

### 4.11 GUI theme customization

- **Operate**: open a `gui.rpy` project → click **🎨 GUI**
- **Expected**: the panel shows the resolution (gui.init), 7 theme colors (color pickers), font sizes, etc.; after modifying,「Save to gui.rpy」writes back to the file and the editor tab refreshes in sync;「View source」opens gui.rpy directly
- **Test points**: change a theme color and save → the corresponding `gui.xxx_color` changes in the file; a project without gui.rpy opens showing defaults; saving creates one

### 4.12 Statement ⇄ Python equivalents

- **Operate**: put the cursor on a Ren'Py statement (e.g. `show eileen happy at right`) → click **⇄ Python**
- **Expected**: a popup at the bottom-right shows the Python equivalent (e.g. `renpy.show(...)`) + a semantic explanation; unrecognized statements log a notice
- **Test points**: try `say / jump / call / scene / with / define / if / menu` etc.

### 4.13 Side chat (in-panel chat)

- **Operate**: type a message in the chat input on the right side of the panel (or use the native DSH input)
- **Expected**: the message stream shows; assistant messages support **Markdown rendering** (code blocks/bold/lists), **🤔 Think ▸** expands reasoning, hover shows「⧉ Copy」, user messages show「✎ Edit」on hover to edit and resend; below are the **trail** (tool-call records; edit-type entries show「✎ filename」that jump the editor to the location) and the **checkpoint timeline**
- **Test points**: send a message asking the AI to edit code → an edit entry appears in the trail → click it to jump to the editor; after the edit the checkpoint timeline gets a new entry

### 4.14 Python syntax highlighting

- **Operate**: open a `.rpy` containing Python code in the editor (`init python:` blocks, `python early:`, `$` one-liners, `define` right-hand-side expressions)
- **Expected** (aligned with the VSCode Dark+/Light+ palettes):
  - Lines inside `init python:` / `init -10 python:` / `python early:` / `python hide:` / `rpy python:` blocks get Python highlighting
  - **Keywords in purple** (def/if/for/return/import…), **built-in types in cyan** (str/int/bool/list…), **built-in functions in blue** (print/len/range…), **function calls in yellow** (`foo(`)
  - `$ x = 42` one-liners and the right-hand side of `define e = Character(...)` get the same treatment
- **Test points**: write an `init python:` block (with def/if/str/print/function calls) and confirm each of the four colors appears

### 4.15 Static diagnostics panel ★

- **Operate**: click **✅ Static Diagnostics** in the control bar (a checklist icon)
- **Expected**: scans all `.rpy` files in seconds for **reference integrity**: invalid jumps / undefined screens / undefined characters / missing assets (images/audio/fonts) / unreachable labels, grouped and colored by type (error/warn/info); clicking an entry jumps the editor to the location
- **Test points**: deliberately reference a nonexistent label (`jump no_such_label`) → scan → should report「Invalid jump」; after fixing, it disappears
  - Difference from lint: lint is the engine-level authoritative check (⚠); this scan is a fast first pass (✅), good for frequent self-checks

### 4.16 Error diagnostics panel

- **Operate**: after the game crashes, click **🐞 Error Diagnostics** in the control bar
- **Expected**: reads `traceback.txt` / `log.txt` / `errors.txt` from the project root and displays them in structure: crash location (While running…), **root cause** (the deepest `game/` frame), the full stack-frame list, lint errors, and embedded error sections from the log; clicking any file:line jumps the editor
- **Test points**: deliberately break a script while running to cause a crash → open the panel → the root cause is located accurately and jumpable

### 4.17 Personalization settings panel ★

- **Operate**: click **⚙ Settings** at the bottom of the control bar (fixed as the last item)
- **Expected**: a full-screen settings panel (close with Esc/✕), with search + groups:
  - **Features**: editing behavior (indentation / scroll-wheel zoom / autocomplete / bracket pairing / indent guides / line-number mode / whitespace display / rulers), light/dark mode
  - **Controls**: fonts and layout (font family / size / weight / line height / letter spacing / density), **colors** (25 tokens: 12 editor + 8 UI + 5 interaction, with「🎨 Apply preset theme」to apply any of 8 themes in one click)
  - Split into **global/project** layers (chips at the top-right), changes apply instantly
- **Test points**:
  - Change the font size to 16 → the editor grows immediately; switch light/dark mode → the whole workbench toggles
  - Apply the「2026 Dark」theme → all colors change; switch back to default
  - Project-layer changes affect only the current project (verify by switching projects)

---

## 5. Test checklist (quick regression table)

> Go through these in order; if all pass, the core features are healthy.

| # | Feature | Operate | Expected |
|---|---|---|---|
| 1 | Panel opens | New session → Ren'Py tab → load project | File tree/editor/side chat appear |
| 2 | Edit + save | Modify file → Ctrl+S | Status bar ✓; unsaved notice gone |
| 3 | lint | ⚠ Check | No errors; errors underlined when present |
| 4 | Autocomplete/find | Type keyword / Ctrl+F | Completion panel, find highlighting work |
| 5 | Run/screenshot/stop | ▶ → 📷 → ■ | Window pops up, button toggles (▶↔■), screenshot generated, process stops |
| 6 | Automated tests | 🧪 Test | Report pass/fail correct |
| 7 | Save history | Save multiple times → 📜 | Version list, preview, restore work |
| 8 | Checkpoints | Have AI edit → ✎ | Diff accurate, gutter markers, approve/revert work |
| 9 | Workspace | 🎯 lock lines 8-15 | Out-of-region blocked; constraint injected into chat |
| 10 | Learning annotations | 📖 → confirm | Annotations written, lint passes, clear works |
| 11 | Style preview | Aa Preview | WYSIWYG styles; click to play typewriter |
| 12 | GUI customization | 🎨 → change color → save | gui.rpy written back |
| 13 | Statement⇄Python | ⇄ Python | Equivalent conversion correct |
| 14 | Side chat | Send a message | Markdown/think/edit-resend/trail-jump work |
| 15 | Python highlighting | Open a .rpy with python blocks | Keywords purple/type cyan/builtin blue/call yellow |
| 16 | Static diagnostics | ✅ | Five check groups, click to jump |
| 17 | Error diagnostics | Cause a crash → 🐞 | Root cause located, file:line jumps |
| 18 | Personalization settings | ⚙ → change font size/theme | Instant effect; global/project layers |

---

## 6. Known limitations and notes

1. **Packaging/run not supported**: Ren'Py packaging (distribute) lives inside the launcher and can't be called from the SDK command line → the panel has no packaging button; the `renpy-build` skill only covers build.rpy configuration knowledge.
2. **Host changes require a dsh restart**: any update involving `renpy-client/lib/host.js` takes effect only after restarting; client-side changes just need a page refresh.
3. **Learning annotations consume AI resources**: each generation calls the model once (batch = one call), consuming tokens; generation may take seconds to tens of seconds (90s timeout protection).
4. **The workspace is a hard constraint**: once set, the AI's edits are limited to the region; code outside stays untouched; to change outside code the AI asks first — this is by design, not a bug.
5. **Sandbox/approval**: some operations (e.g. first write to a specific directory) may trigger a DSH approval prompt — just allow it; operations involving processes like running the game follow the configured sandbox policy.
6. **Backups/checkpoints are not auto-cleaned**: `.renpy-user/backups/` and `checkpoints/` accumulate over time; clean them manually when needed.
7. **Don't write `init python: import renpy`**: it triggers an engine initialization exception (lint reports missing `renpy.music` attribute); if `game/cache` is corrupted, emptying that directory recovers it.
8. **Corrupted old session history is unrecoverable**: if a session shows a model 400 error (tool-message pairing error), just start a new session (this bug was fixed in §21x-8).

---

## 7. FAQ

**Q: The file tree is empty after loading a project?**
Check whether the project path is a Ren'Py project root containing `game/` (e.g. `...\demo-script`), then click ⟳ to reload.

**Q: I can't see the file the AI modified?**
The editor auto-syncs external changes (5s polling). If the file has unsaved local edits, it warns of a conflict and keeps the local version — closing the tab and reopening loads the external version.

**Q: The game window didn't appear after running?**
The first run may trigger an approval prompt; check the toolbar state and conversation log. The game window is really opened by the SDK, same as the launcher.

**Q: 📖 Learn shows "AI teaching failed: ?"**
Usually a temporary model rate-limit or empty response; retry later; for large batches, shrink the workspace region first.

**Q: How do I fully reset the test environment?**
Delete the `backups/checkpoints/workspace` subdirectories under `.renpy-user/` (keep the directories themselves), then refresh the page.

**Q: Where can I see implementation details for each feature?**
The open-source repository docs update with each release, recording each feature's implementation, verification method, and known issues.

---

## 8. Feedback

When you find any problem while testing, record: **feature → steps to reproduce → actual behavior → expected behavior**, ideally with a screenshot/log. After a fix, it will be confirmed in the docs and regression tests.

---

## 9. Feeding your accumulated experience back to developers

> While using this tool you accumulate a lot of first-hand experience: pitfalls you hit, verified patterns, habits that fit your projects.
> This tool is designed around **three-tier experience isolation** (the `renpy-practices` skill declares this fully at the top): L1/L2 go into the open-source package, L3 stays in your private file.
> This chapter explains how to consolidate experience and feed back the shareable parts (L1/L2) to the developer.

### 9.1 What the three tiers are

| Tier | Content | Where it goes |
|---|---|---|
| **L1 Engine facts** | Deterministic conclusions about syntax/semantics/APIs (source-verified + lint-validated) | Into the open-source package (renpy-* skills) |
| **L2 General principles** | "Reasoning" about organization/naming/performance, not tied to a specific project | Into the open-source package (renpy-practices) |
| **L3 Personal experience** | Your projects, your habits, personal pitfalls | **Your private file**, not in the open-source package |

Priority: `L1 > L2 > L3 > model common sense`.

### 9.2 First record experience in your private file (L3)

Anytime while using, append new experience to your personal file:

```
~/.dsh/skills/renpy-practices-personal.md
```

- Create it yourself if it doesn't exist (plain Markdown is fine).
- Content is up to you: pitfall records, verified patterns, project-specific conventions, questions about skills.
- The model auto-loads it as reference when writing code (all files in the skills directory are loaded), so **your experience takes effect immediately** — that's the first layer of value.

Suggested entry format:

```markdown
## <topic>
- Symptom/background: ...
- Actual test result: ...
- Conclusion: ...
- To confirm: can this go into the open-source package as L1/L2?
```

### 9.3 When to consolidate and send back

- Send back after each round of testing (or every 5-10 entries), to avoid piling up.
- Before sending, **tier it**: is this an engine fact (L1)? a general principle (L2)? or only applicable to you (L3)?

### 9.4 Sending back to developers (three methods, pick by ability)

**Method A: send the personal file directly (simplest)**

Send your `renpy-practices-personal.md` as-is to the developer (email/IM/cloud drive all work).
The developer will filter it: L3 stays on your side; L1/L2 candidates enter the verification flow.

**Method B: submit organized entries with a template (recommended)**

For each experience you want to contribute, fill this template and send it with the file:

```markdown
- Experience: one-sentence conclusion
- Which tier (L1 engine fact / L2 general principle / L3 personal experience): ____
- Reproduction/basis: how was it obtained? (tested / docs / source / guess)
- Verified with renpy_lint: yes / no
- Minimal runnable example: ...
```

- **L1 entries**: attach the verification method (lint output, minimal .rpy example, SDK version) so the developer can verify.
- **L2 entries**: explain the applicable scenario and rationale.
- **L3 entries**: mark "personal experience, no need to include"; the developer won't adopt them into the open-source package.

**Method C: participate in open-source maintenance (long term)**

If the project goes open source, submit directly via PR per the contribution guide:
- L1/L2 entries are merged into the corresponding renpy-* skill after **source verification + lint validation**;
- L3 entries stay in your private file, not in the open-source package;
- Verification standards and submission format are in the "contribution guide" section of the `renpy-practices` skill.

### 9.5 What happens after the developer receives it

| Your submission | Developer's handling |
|---|---|
| Problem/bug report | Recorded and followed up → fix → regression test confirmation |
| L3 personal experience | Kept on your side, not in the open-source package (may get generalization suggestions) |
| L2 general principle | Verify the "reasoning" holds → merge into the corresponding renpy-practices section |
| L1 engine fact | Source verification + lint validation → merge into the corresponding renpy-* skill (source will be noted) |

> Once L1/L2 experience enters the open-source package, everyone using this tool (and their AIs) benefits — that's the greatest value of feeding back experience. The L3 parts in your personal file always belong to you, editable or deletable anytime.
