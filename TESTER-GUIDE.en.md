# DSH Ren'Py Dev Workbench — Tester's Feature Manual

> This document is intended for **testers**: Part One "Feature Details" explains, feature by feature, **what a feature is, how to use it, its full behavior, and its boundaries**;
> Part Two "Operations & Testing" gives step-by-step verification methods. The two parts go together: first understand the feature, then test it.
>
> Companion reading: deployment in `DEPLOY.md`, UI spec in `skills/workbench-ui.md`.

---

## 0. Environment and Startup

### 0.1 Prerequisites (already set up)

| Item | Location / Notes |
|---|---|
| DSH | Installed and running on this machine (Web GUI `http://127.0.0.1:3080`) |
| Ren'Py SDK | Workspace `renpy-8.5.3-sdk/` (locked to 8.5.x) |
| DSH Ren'Py Dev Workbench | Mounted as the agent preset "RenPy Dev", selectable in new sessions |
| Sample project | `demo-script/` (for testing); the SDK ships with `the_question/`, `tutorial/` |

### 0.2 Open the development panel

1. Start a new session in the DSH Web GUI (or switch the preset to **RenPy Dev**)
2. Find the **"Ren'Py" tab** above the session's chat tab and click it → the development panel appears
3. In the input box at the top, enter your Ren'Py project path (the project root that contains the `game/` directory, e.g. `D:\my-game`), then click **⟳ Load**

### 0.3 Effective rules (important)

- **Only the editor UI (client side) changed** → a browser **page refresh** applies it
- **Backend service (host side) changed** → **restart dsh** required (this applies to any feature the document marks as involving a host change)
- **agent preset / skill changed** → effective in **new sessions** after restarting dsh
- The plugin's two visual adjustments to the DSH host (hiding the native input box, the sidebar logo brand color) are **runtime injections**; they take effect on refresh/reopen and do not affect deployment

### 0.4 Quick start (get going in 5 minutes)

| Step | Action | Expected |
|---|---|---|
| 1 | In the DSH Web UI (`http://127.0.0.1:3080`), create a new session with preset "RenPy Dev" | A new session appears |
| 2 | Find and click the **"Ren'Py" tab** above the session | The development panel opens |
| 3 | Enter the project path (project root containing the `game/` directory, e.g. `D:\my-game`) in the top input box, press Enter or click **⟳** | File tree on the left, editor in the center |
| 4 | Open `game/script.rpy` | The editor opens with color syntax highlighting |
| 5 | Click **⚠ Check** in the top bar | "lint passed" appears below |

> **No project?** Tell the AI in chat "create a test project for me" (the AI will use `renpy_scaffold` to generate one).

---

## 1. Interface Overview

### Feature Details

- **Purpose**: extends the DSH session page into a full Ren'Py development workbench — a four-zone layout (activity bar / top toolbar / editor area / side bar). All panels can be docked, dragged, floated, and maximized.
- **Layout** (top to bottom, left to right):
  - **Activity bar** (far left, 46px collapsed / 172px expanded): editing tools → debug panels → view controls → panel controls → **⚙ Settings (fixed at the bottom)** → collapse button
  - **Top toolbar**: project input + workspace scope + combined run/stop + check/test/refresh/save/screenshot/chat
  - **Center**: multi-file tabbed editor (syntax highlighting + line numbers + find bar + lint underlines)
  - **Bottom panel area**: operation log / lint results / test report (height draggable)
  - **Right side bar**: chat panel (default) and all debug panels (docked here by clicking the activity bar)
- **Icons**: uniform codicon outline SVGs (hover shows a tooltip), colors follow the theme; the `«/»` buttons collapse/expand the activity bar.

```
┌─────────┬──────────────────────────────────────────────┬─────────┐
│ Activity│  Top toolbar                                  │ Right   │
│ bar     │  Project[input] ⟳ 🎯Scope ⚠Check 🧪Test      │ side bar│
│ (46px)  │  ⟳Refresh 💾Save 📷Shot 💬Chat ▶Run/■Stop    │ Chat    │
│         ├──────────────────────────────────────────────┤ (default)│
│ Editing │  Editor (multi-file tabs + syntax highlight   │         │
│ Aa Prev │         + find bar)                           │         │
│ ⇄ Python├──────────────────────────────────────────────┤         │
│ 📖 Learn│                                               │         │
│ 🎨 GUI  │                                               │         │
│ ──────  │                                               │         │
│ Debug   │  Bottom panel area                            │         │
│ 🗺 Map   │  (log / lint results / test report)          │         │
│ 🎬 Live ├──────────────────────────────────────────────┤         │
│ 📊 Vars │                                               │         │
│ 🐞 Errors│                                               │         │
│ ✅ Diag │                                               │         │
│ ──────  │                                               │         │
│ View    │                                               │         │
│ 📄 Files│                                               │         │
│ 🧭 Nav   │                                               │         │
│ 🖼 Assets│                                               │         │
│ ✎ Chgs  │                                               │         │
│ ──────  │                                               │         │
│ 📋 Log  │                                               │         │
│ 📜 Hist │                                               │         │
│ ⚙ Set  │  (⚙ Settings fixed at the bottom)             │         │
│ « Collapse                                              │         │
└─────────┴──────────────────────────────────────────────┴─────────┘
```

---

## 2. Top Toolbar (Feature Details)

### 2.1 Project input box

- **Purpose**: specify the Ren'Py project to develop (the project root containing the `game/` directory).
- **Full behavior**: submitted on Enter or on blur → loads the file tree/assets/index; the project path is **persisted** (localStorage, restored automatically when the panel reopens); submitting a new project clears the old tabs and reloads.
- **Boundaries**: an empty path is ignored; if the path doesn't exist, the load yields an empty file tree (click ⟳ Refresh to retry).

### 2.2 ⟳ Default Project

- **Purpose**: one-click switch to the host-configured default project (`defaultProject` in `renpy.config.json`).
- **Behavior**: click → auto-fills and loads; if none is configured, the log shows "the host has no default project configured".

### 2.3 🎯 Workspace Scope (safety constraint)

- **Purpose**: lock the editing scope — editable inside, **read-only** outside; the AI asks before touching anything beyond it (prevents the AI from changing unrelated code).
- **Full behavior**: ① **Select a few lines** in the editor (or park the cursor on a line) → click 🎯 → a green highlighted region is created; ② a 【Work Area】constraint message is injected into the chat (the AI's edits are limited to the region); ③ **manual edits outside the region are blocked** (input is rejected with a notice); ④ a "✖ Clear" button appears next to the toolbar button; clicking it lifts the constraint.
- **Boundaries**: the scope is tied to the current file (after switching files, the old scope only applies to its original file); until cleared, the AI remains constrained.
- **Related features**: the write guard (§9) is another layer of protection; learning annotations (📖) respect the workspace scope (only annotate lines inside the region).

### 2.4 ▶ Run / ■ Stop (combined button)

- **Purpose**: start/stop a real game process (with **debug bridge** auto-injected for the roadmap / live view / variables panels).
- **Full behavior**: not running → shows "▶ Run Game" (solid blue); clicking starts the game (auto-injects `_debug_bridge.rpy`); running → shows "■ Stop Game" (red outline); clicking stops it. The status is driven by **2-second polling from the backend + optimistic click updates** — when **the game exits on its own (window closed / crash), the button automatically returns to ▶**.
- **Boundaries**: only one instance per project at a time (running again first stops the old one).
- **Related features**: 📷 Screenshot, 🗺 Roadmap, 🎬 Live View, 📊 Runtime Variables.

### 2.5 ⚠ Check (lint)

- **Purpose**: Ren'Py engine-level syntax check (authoritative).
- **Full behavior**: click → invokes SDK lint → the lint panel below shows the results; **lines with errors get a red underline in the editor**; clicking a lint entry jumps to the corresponding line.
- **Boundaries**: lint errors are based on engine parsing; its relationship to static diagnostics (✅) is "lint is authoritative, ✅ is a fast second-level preliminary check".

### 2.6 🧪 Test (automated tests)

- **Purpose**: run the project's `testsuite` (rpytest); prompts when no testsuite exists.
- **Behavior**: click → runs the tests → the report bar shows ✓/✗ and the pass count; "Details" expands the full report.

### 2.7 ⟳ Refresh

- **Purpose**: rescan the `game/` file list (use after adding files outside the project).
- **Behavior**: rescans the .rpy list and the asset tree; already-open tabs are kept.

### 2.8 💾 Save

- **Purpose**: save the current file (shortcut `Ctrl+S`).
- **Full behavior**: on success → ✓ in the status bar; **every save auto-backs-up** (§6 history); before saving, the **write guard** validates (§9 — structural errors are blocked).
- **Boundaries**: when the file was changed externally and you have unsaved local changes, a conflict notice appears (keep local; close the tab and reopen to load the external version).

### 2.9 📷 Screenshot

- **Purpose**: full-screen capture (game-window feedback), so humans and the AI can see the game's current frame.
- **Behavior**: click → captures the current screen → saved to `.renpy-user/screenshots/`, viewable in the chat/panels.

### 2.10 💬 Chat

- **Purpose**: open/focus the chat panel (docked in the right side bar).
- **Behavior**: click → the chat panel appears in the right side bar (message stream + checkpoint timeline + traces).

### Operations & Testing

| Button | Action | Expected |
|---|---|---|
| Project box | Enter a path and press Enter | File tree/editor load |
| ⟳ | Click | Default project filled in |
| 🎯 | Select a few lines, then click | Green highlighted region; typing outside it is blocked |
| ▶/■ | Click run → click again | Game window pops up → button turns red ■ → clicking stop returns to ▶ |
| ⚠ | Deliberately delete a colon, then click | Error reported + red-line location |
| 🧪 | Click on the demo project | Report fully passes |
| ⟳ | Create a new .rpy, then click | New file appears |
| 💾 | Ctrl+S | ✓ in the status bar |
| 📷 | Click while running | A PNG is generated |
| 💬 | Click | Chat panel appears on the right |

---

## 3. Activity Bar (Left Vertical Bar, Feature Details)

> Hovering over each icon shows a tooltip on the right; in the expanded state, text is displayed below the icon. Groups run top to bottom.

### 3.1 Editing tools (act on the editor)

| Icon | Feature | Details |
|---|---|---|
| **Aa** | Style Preview | **Purpose**: WYSIWYG preview of dialogue text styling. **Behavior**: open a file containing say text → click → the dialogue **renders directly with the styles**: `{b}`bold / `{i}`italic / `{u}`underline / `{s}`strikethrough / `{color}`color / `{size}`size / `{font}`font / `{alpha}`alpha / `{kern}`kerning shown for real; runtime semantics such as `[variable]` interpolation and `{cps}` speed are **marked with yellow/blue/red backgrounds** + hover hints; line height grows automatically; when exact rendering isn't possible, a "degraded-mode notice bar" appears. **Clicking a say line in preview mode** → a floating window in the bottom-right plays a **typewriter animation** word by word (speed read from the project config `slow_cps`), ▶ replays, ✕ closes. **Boundaries**: `{font}` requires the font file to exist in the project (shows "loading" if present, prompts to remove it if absent); the preview is a rendering layer and never modifies the file. |
| **⇄** | Python Equivalent | **Purpose**: understand the Python implementation behind a Ren'Py statement. **Behavior**: park the cursor on a statement line (`show`/`jump`/`call`/`menu`/`if`, etc.) → click → a floating window in the bottom-right shows the Python equivalent (e.g. `renpy.show(...)`) plus a semantic explanation; if unrecognized, a log notice appears. |
| **📖** | Learning Annotations | **Purpose**: the AI explains the code line by line (generates teaching annotations). **Behavior**: click → confirmation dialog (shows the scope: lines Lx–y within the workspace scope, or the whole file, plus the line count and an **AI-resource consumption notice**) → after confirming, the AI writes a `# 📖 learn: <skill> (L<line>)` annotation block into the file for each statement line in scope; the result bar shows "N written" plus "Clear all". **Boundaries**: consumes model tokens; one batched call (90s timeout protection); annotations are legal Python comments and don't affect lint. **Related**: respects the workspace scope (only annotates lines inside the region). |
| **🎨** | GUI Theme | **Purpose**: visually customize `gui.rpy` (resolution / theme colors / font sizes). **Behavior**: open a project containing gui.rpy → click → the panel shows the `gui.init` resolution, 7 theme colors (color pickers), font sizes, etc. → after editing, "Save to gui.rpy" writes back (the editor tab refreshes in sync); "View Source" opens gui.rpy directly. **Boundaries**: projects without gui.rpy show default values; saving creates the file. |

### 3.2 Debug panels (dock to the right side bar on click)

| Icon | Panel | Details |
|---|---|---|
| 🗺 | Branch Roadmap | **Purpose**: visualize the project flow (label state machine). **Behavior**: parses labels and jump relationships across all .rpy files → a node-link diagram (green=ending, blue=start, purple=choice, red=dead end, gray=orphaned, yellow=loop); clicking a node jumps the running game to that label; 2s polling of the game's current progress (highlights the current node). **Boundaries**: requires a running game to jump; only polls while the debug panel is visible. |
| 🎬 | Live View | **Purpose**: real-time game-screen feedback + remote control. **Behavior**: shows in-game screenshots (`game/_shot.png`, captured periodically by the injected bridge); **clicking the view simulates a game click**, advancing/rolling back (bridge commands). **Boundaries**: requires a running game; capture frequency is rate-limited by the bridge (0.5s). |
| 📊 | Runtime Variables | **Purpose**: monitor the game's runtime variables. **Behavior**: the bridge reports variable snapshots → a list shows live values; **changes flash-highlight for 1.5s**; clicking a variable name jumps to its definition in the editor. |
| 🐞 | Error Diagnostics | **Purpose**: structured view of errors after a game crash. **Behavior**: reads `traceback.txt` / `log.txt` / `errors.txt` from the project root (auto-generated on a Ren'Py crash) → parses into: crash location ("While running…"), **root cause** (deepest game/ frame), full stack-frame list, lint errors, and error excerpts embedded in the log; clicking any file:line **jumps to the editor**. **Boundaries**: shows a guided empty state when no error files exist (they're generated automatically after a run crash or lint failure). |
| ✅ | Static Diagnostics | **Purpose**: project-wide **reference-integrity** scan in seconds (complements lint: lint is authoritative, this scan is a fast first pass). **Behavior**: scans all .rpy files → five problem categories shown grouped: **invalid jumps** (jump/call target missing), **undefined screens** (show/call screen, use), **undefined characters** (say speakers), **missing assets** (show/scene images, play audio, `{font=}` fonts), **unreachable labels** (not reachable from start); error/warn/info color-coded; clicking an entry jumps. **Boundaries**: dynamic jumps (`jump expression`) and engine built-ins are excluded (calibrated for zero false positives); only definite errors are reported. |

### 3.3 View controls (dock to the left side bar)

| Icon | Panel | Details |
|---|---|---|
| 📄 | Project Files | File tree: all .rpy under `game/`, folders collapse/expand, click to open (multi-tab). Top-right ⟳ refresh, ▾ collapse all. |
| 🧭 | Navigation | Project index (engine dump + lightweight analysis): five tabs for **labels / characters / transitions / variables / fonts**; clicking an entry jumps to the corresponding editor line. |
| 🖼 | Project Assets | Asset tree: images/audio/video/fonts categorized; clicking a leaf **opens a preview popup in the bottom-right** (images/audio draggable). |
| ✎ | Baseline Changes | List of file changes relative to the checkpoint baseline (same source as the Changes panel). |

### 3.4 Panel controls

| Icon | Feature | Details |
|---|---|---|
| 📋 | Operation Log | Docks to the bottom area: timeline of all operations (load/save/lint/run/workspace scope, etc., with timestamps and results). |
| 📜 | Save History | **Purpose**: file version rollback. **Behavior**: click → an overlay lists all backup versions of the current file (**every save auto-backs-up**, newest first, with line-count deltas) → click a version to preview on the right → "Restore" restores it in one click. **Boundaries**: backups are stored in `.renpy-user/backups/` and are never auto-cleaned. |
| **⚙** | **Personalization Settings** | **Fixed at the bottom of the activity bar**. Full-screen settings panel (Esc/✕ to close); full details in §12. |

Bottom **« / »**: collapse/expand the activity bar (collapsed shows only icons; hovering reveals descriptions).

### Operations & Testing

- Aa: open text containing `{b}` / `{color=#ff0000}` / `{size}` / `{font}` → preview → verify each rendering → click a line to play the typewriter animation
- ⇄: park the cursor on `show eileen happy at right` → should show `renpy.show(...)`
- 📖: confirm dialog shows scope/line count/consumption notice → annotation generated → lint passes → clear all
- 🎨: change a theme color and save → the corresponding variable in gui.rpy changes
- ✅: deliberately write `jump no_such_label` → scan → "invalid jump" reported; change it back and it disappears
- 🐞: write a broken script while running to cause a crash → open the panel → root cause located + jump
- 📜: save 3 times → restore the earliest version → content restored

---

## 4. Editor (Feature Details)

### 4.1 Syntax highlighting (including Python blocks)

- **RPY statements**: statement keywords blue, names yellow, strings orange, comments green, numbers cyan (Dark+ style; light themes use the corresponding Light+ scheme).
- **Python blocks** (aligned with the VSCode Dark+/Light+ four-level color scheme):
  - Recognizes lines inside `init python:` / `init -10 python:` / `python early:` / `python hide:` / `rpy python:` blocks, `$` single lines, and the expressions right of `=` in `define`/`default`
  - **Keywords purple** (def/if/for/while/return/import/class/try/with/as/lambda/async…)
  - **Built-in types cyan** (str/int/bool/list/dict/set/tuple/object…)
  - **Built-in functions blue** (print/len/range/enumerate/map/filter/sorted…)
  - **Function calls yellow** (`foo(` — custom function names)
- **Boundaries**: `$` single lines are forced to Python highlighting; blank lines inside blocks keep the Python state.

### 4.2 Code completion

- Type a keyword → `Ctrl+Space` → completion panel (**statements** / characters / assets / code snippets); statement snippets include explanatory comments (e.g. `menu` expands a choice-menu skeleton).

### 4.3 Find & replace

- `Ctrl+F` → find bar: matches **highlighted** (including across lines); `Enter`/`Shift+Enter` navigate up/down; replace one/all; `✕` closes.

### 4.4 Brackets & comments

- **Bracket matching**: cursor near `(`/`{`/`[` → matching bracket highlighted (`Ctrl+Shift+\` jumps).
- **Comment toggle**: `Ctrl+/` comments/uncomments the current line (writes `#`).

### 4.5 Unsaved changes & external conflicts

- **Unsaved notice bar**: after editing without saving → below the editor: "Unsaved changes +N lines −M lines [Save] [Revert changes]" (Revert = discard the unsaved changes and restore the last saved state).
- **External modification conflict**: while you have unsaved local changes, the file is changed externally (AI/disk) → "external modification conflict" notice, keep local; close the tab and reopen to load the external version; if there are no unsaved local changes, the external version is synced automatically.

### 4.6 Line numbers & guides

- Line number modes (setting): `on` / `relative` (the current line shows itself, the rest show distance) / `off`.
- Indentation guide lines (setting toggle), vertical rulers (setting array of column numbers).

### Operations & Testing

- Highlighting: write an `init python:` block containing def/if/str/print/function calls → all four colors present; `$ x = 1`, `define e = Character(...)` take effect
- Completion: type `menu` + `Ctrl+Space` → snippet
- Find: Ctrl+F match/replace
- Unsaved: edit without saving → notice bar; external change → conflict notice

---

## 5. Panel System (Feature Details)

- **Title bar**: far-left ⠿ **drag handle** → panel icon + name → actions (refresh/collapse) → **⛶ maximize** → **✕ remove**.
- **Drag-dock**: drag by the title bar → drop onto the left/right/bottom zones to **snap** (highlight preview + insertion indicator line), or drag out as a **floating window**; floating windows can be dragged, **resized** from the bottom-right corner, and closed with Esc.
- **Maximize**: ⛶ fills the entire workspace (hides the activity bar / side bar / panel area), 🗗 restores; the maximized view's title bar is "icon + title + actions + ✕ close".
- **Layout persistence**: dock zones / ratios / panel lists saved to localStorage (restored when the panel reopens).
- **Empty state**: after a panel is removed, the zone shows a centered placeholder; it can be reopened from the activity bar anytime.

### Operations & Testing

- Drag the "Log" panel to the bottom → snaps; drag it out as a floating window → resize → Esc closes it
- ⛶ maximize the error panel → fills the workspace → 🗗 restore
- ✕ remove "Chat" → reopen it via 💬 in the activity bar

---

## 6. Save History and Rollback (Feature Details)

- **Mechanism**: **every save** (Ctrl+S / 💾) auto-backs-up the old version to `.renpy-user/backups/<project>/<file>/<timestamp>.bak` (with an incrementing sequence number to prevent same-millisecond overwrites).
- **Entry point**: 📜 Save History in the activity bar (or the related entry while editing).
- **Full behavior**: the overlay lists all versions of the file (newest first, with per-version line-count deltas) → click a version to **preview its content on the right** → click "Restore" → the file is restored to the selected version (can be saved again).
- **Boundaries**: only saved versions are covered (unsaved changes aren't in the history); backups are never auto-cleaned and accumulate over time.

### Operations & Testing

Save 3 times (different content each time) → 📜 → restore the earliest version → the file content returns to the original → save again → the new version joins the list.

---

## 7. Checkpoints and Changes Panel (Feature Details)

- **Checkpoints**: **every AI chat turn** automatically creates a baseline snapshot (`.renpy-user/checkpoints/`); the "📌 persistent checkpoints" timeline at the bottom of the side-bar chat can switch to any historical checkpoint to view/restore.
- **Changes panel**: after the AI changes code, a change-count badge appears on **✎ Changes (N)** in the activity bar → click to open:
  - Per-file `+A −B` **line-level diffs**; expanding a hunk shows starting lines; clicking **jumps to the editor** at the corresponding line
  - Editor-left **gutter color markers**: green=added, blue=modified, red=deleted
  - "Approve all" = accept all changes and advance the baseline; "Revert all" = restore everything; each file can be individually "approved/reverted"
- **Boundaries**: reverting is relative to the baseline (both AI edits and your own manual edits are in the diff; restorable as a whole or per file).

### Operations & Testing

Ask the AI to "add a character and one line of dialogue to script.rpy" → ✎ Changes appears → diff and gutter markers → "Revert" → file restored → "Approve" → baseline updated → a new entry appears in the checkpoint timeline.

---

## 8. Workspace Scope (Feature Details)

- **Purpose**: lock the editing scope to prevent out-of-scope changes (both humans and the AI are constrained).
- **Full behavior**: select lines / cursor line → 🎯 → green highlight; **manual edits outside the region are blocked** (input rejected + notice); a 【Work Area】constraint is injected into the chat (AI edits limited to the region; asks first when beyond); ✖ Clear lifts the constraint.
- **Boundaries**: the scope is recorded per file; clearing or re-setting the scope injects the constraint message again; learning annotations (📖) respect the scope.

### Operations & Testing

Lock lines 5–10 → typing outside the region is rejected → ask the AI to change the file (only touching inside the region) → clear → back to normal.

---

## 9. Write Guard (Feature Details)

- **Purpose**: four-layer structural validation before saving, preventing the AI or manual edits from breaking the script structure.
- **Checks**:
  | Type | Example |
  |---|---|
  | Indentation errors | tab/space mixing, statements after a label not indented |
  | Reserved names | using Python keywords/Ren'Py statements as labels or variable names (e.g. `label if:`) |
  | Duplicate labels | redefined within a file or across files |
  | Dialogue brackets | `{ }` and `[ ]` unbalanced (except `{{`/`[[` literals) |
- **Behavior**: validates automatically when saving a .rpy → on problems, a dialog "The write guard blocked the save" appears with the error list (line/type) → "Cancel (fix first)" returns to the editor / "Save anyway (force)" bypasses.
- **Boundaries**: only **definite errors** are reported (dynamic jumps, render-time errors aren't judged); non-.rpy files aren't validated; force-saving writes the file but the structural errors remain.

### Operations & Testing

Write `label if:` and save → blocked + reserved-name notice → fix it and the save passes → try "Save anyway (force)" → writes successfully.

---

## 10. Run & Debug (Feature Details)

### 10.0 Visual verification discipline (important)

- **The user confirms visuals by default**: whether a game view / screenshot is correct is **judged by what you see**. The AI will not take screenshots and run pixel analysis to "self-check" visuals on its own.
- To verify a view: screenshot it for you (📷 or the 🎬 live view) and you report what you see / what's wrong; or ask the AI to check it (it will screenshot and read the image, if the model supports image input).
- This is faster and more accurate than the AI guessing at window coordinates and sampled colors.

### 10.1 Run/stop

- ▶ Run (injects the debug bridge) → real game window → the button turns red ■ Stop; **2s status polling**: after the game exits on its own, the button automatically returns to ▶; one instance per project at a time.

### 10.2 Roadmap (🗺)

- Label state-machine diagram + role inference (start/ending/choice/loop/orphan); clicking a node jumps the running game; polling highlights the current node.

### 10.3 Live View (🎬)

- Bridge periodic screenshots + click/advance/rollback commands (simulates mouse clicks on game buttons; click after focusing).

### 10.4 Runtime Variables (📊)

- Variable snapshot polling (2s) + change highlight 1.5s + click to jump to the definition.

### 10.5 Error Diagnostics (🐞)

- Crash files structured: While position / root-cause frame (deepest game/ frame) / full stack frames / lint errors / log-embedded error excerpts; click to jump.

### 10.6 Static Diagnostics (✅)

- Five-category reference-integrity scan (invalid jumps / undefined screens / characters / missing assets / unreachable labels); grouped and color-coded; click to jump.

### Operations & Testing

Run → screenshot → roadmap: click a node to jump the game → live view: click → variable changes highlight → cause a crash and check 🐞 → ✅ scans all five categories.

---

## 11. Collaborating with the AI (Feature Details)

- **Side-bar chat**: message stream (assistant messages **rendered in Markdown**, **🤔 Think ▸** expands the reasoning, hovering shows "⧉ Copy"; user messages show "✎ Edit" on hover to revise and resend).
- **Traces**: tool-call records below the chat (lint/run/edit/teach, etc.); **edit-type entries show "✎ filename" and jump to the editor** at the corresponding position; run-type entries show an in-progress status.
- **Checkpoint timeline**: one checkpoint per chat turn; click to switch to a historical version to view/restore (§7).
- **Workspace-scope linkage**: setting/clearing the workspace scope injects a constraint message into the chat, constraining AI behavior (§8).
- **Learning annotations**: 📖 batch explanations (consumes AI resources, §3.1).

### Operations & Testing

Send "change the first line of dialogue in script.rpy to 'Hello, world'" → AI edits → an edit entry in the trace → click to jump → a new entry in the checkpoint timeline.

---

## 12. Personalization Settings (⚙ bottom button, Feature Details)

### 12.1 Overview

- **Entry**: ⚙ at the bottom of the activity bar → **full-screen settings panel** (Esc/✕ to close); **search** at the top filters the items.
- **Layering**: **Global/Project** chips at the top-right — global = applies to all projects, project = only the current project (stored in `.renpy-user/settings/<project>.json`, **never written into the project directory**).
- **Effect**: changes apply **immediately** (font-size/font changes reload the editor); "↺ Reset" restores a single item to default; the footer notes "config keys and semantics aligned with VSCode (editor.*, MIT-inspired)".
- **Preset color schemes**: a "🎨 Apply preset scheme" dropdown above the first color group with **8 built-in themes** (2026 Dark/Light, Dark+/Light+, etc.) applied in one click.

### 12.2 Full settings table (49 items, by group)

**Behavior · Editing**
| Key | Description | Default |
|---|---|---|
| editor.tabSize | Indent width | 4 |
| editor.insertSpaces | Indent with spaces | on |
| editor.mouseWheelZoom | Zoom font size with the mouse wheel | off |
| editor.smoothScrolling | Smooth scrolling | on |
| editor.trimAutoWhitespace | Trim trailing whitespace on save | on |
| editor.padding.top / bottom | Editor top/bottom padding | 0 |

**Behavior · Completion**
| Key | Description | Default |
|---|---|---|
| editor.quickSuggestions.other | Auto-popup completions while typing | on |
| editor.quickSuggestions.comments | Also complete inside comments | off |
| editor.quickSuggestions.strings | Complete inside strings | off |
| editor.suggestOnTriggerCharacters | Auto-popup on trigger characters (e.g. `{`) | on |
| editor.bracketPairColorization.enabled | Bracket-pair colorization | on |
| editor.guides.indentation | Indentation guide lines | on |

**Behavior · Display**
| Key | Description | Default |
|---|---|---|
| editor.lineNumbers | Line number mode: on / relative / off | on |
| editor.renderLineHighlight | Current-line highlight range (none/line/gutter/all) | all |
| editor.renderWhitespace | Whitespace display (none/boundary/trailing/all) | boundary |
| editor.rulers | Vertical ruler columns (array, e.g. [80]) | empty |

**Behavior · Light/dark mode**
| Key | Description | Default |
|---|---|---|
| theme.mode | Workbench light/dark theme: light / dark | dark |

**Behavior · UI language**
| Key | Description | Default |
|---|---|---|
| ui.language | UI language: system (follow OS/browser) / zh / en | system |

**Controls · Font**
| Key | Description | Default |
|---|---|---|
| editor.fontFamily | Editor font (empty = follow the theme) | empty |
| editor.fontSize | Font size | 13 |
| editor.fontWeight | Font weight (400/500/600…) | 400 |
| editor.lineHeight | Line height px (**0 = auto = font size ×1.5**) | 0 |
| editor.letterSpacing | Letter spacing px | 0 |

**Controls · Colors (12 editor + 8 UI + 5 interactive = 25)**
| Key | Description |
|---|---|
| editor.background / foreground | Editor background/foreground |
| editor.lineHighlightBackground | Current-line highlight color |
| editor.selectionBackground | Selection background |
| editorIndentGuide.background1 | Indent guide line color |
| editorBracketMatch.background | Bracket-match highlight |
| editorFindMatchBackground | Find-match highlight |
| editorError.foreground | Error underline color |
| editorWhitespace.foreground | Whitespace character marker color |
| editorCursor.foreground | Cursor color |
| editorGutter.background | Line-number gutter background |
| editorLineNumber.foreground | Line number color |
| workbench.background | Workbench background |
| workbench.sideBar.background | Side bar background |
| workbench.activityBar.background | Activity bar background |
| workbench.panel.background | Panel background |
| workbench.editorGroupHeader.tabsBackground | Tab bar background |
| workbench.statusBar.background | Status bar background |
| workbench.foreground / border | Workbench foreground/border |
| button.background / foreground | Button background/foreground |
| input.background / border | Input box background/border |
| list.hoverBackground | List hover color |

### Operations & Testing

- Change the font size to 16 → the editor grows immediately; set line numbers to relative → numbers show distances
- Switch light/dark → the whole workbench switches
- Apply the "2026 Dark" scheme → all colors change → reset
- Global/Project chips: change something at the project layer → switch to another project to verify it doesn't apply (isolation)

---

## 13. Keyboard Shortcuts

| Shortcut | Function |
|---|---|
| `Ctrl+S` | Save the current file |
| `Ctrl+F` | Find/replace |
| `Ctrl+/` | Toggle comment |
| `Ctrl+Space` | Code completion |
| `Ctrl+Shift+\` | Jump to matching bracket |
| `Enter` | Send a chat message |
| `Esc` | Close overlay / floating window / settings panel |

---

## 14. Full Regression Test Checklist

> Execute each item in order; if all match expectations, the base functionality is healthy. Each item takes about 1 minute. After testing, give feedback using the §17 template.

| # | Feature | Steps | Expected result |
|---|---|---|---|
| 1 | Panel opens | New session → Ren'Py tab → load project | File tree/editor/activity bar/side bar all appear |
| 2 | File browsing | Expand the file tree, open 2 .rpy files | Multi-tab switching works; clicking 🧭 Navigation jumps |
| 3 | Asset preview | 🖼 Assets → click one image, one audio | Preview popup appears in the bottom-right |
| 4 | Edit & save | Change a line → Ctrl+S | ✓ in the status bar; unsaved notice disappears |
| 5 | Completion | Type `menu` + Ctrl+Space | Statement/snippet completion panel appears |
| 6 | Find & replace | Ctrl+F → find → replace one/all | Highlight, navigation, replace all correct |
| 7 | lint | ⚠ Check | Passes (when no errors); deliberately break something → red-line location |
| 8 | Run/stop | ▶ Run → wait for the game window → click ■ | Window pops up, button state toggles, restores after stop |
| 9 | Screenshot | 📷 Screenshot while running | PNG generated, viewable in chat |
| 10 | Test | 🧪 Test (demo project) | Report fully passes; failures appear after breaking it |
| 11 | History rollback | Save 3 times → 📜 → restore the earliest version | Content restored |
| 12 | Checkpoints | Ask the AI to change code → ✎ Changes | Diff accurate, gutter markers, approve/revert usable |
| 13 | Workspace scope | 🎯 lock lines 5–10 | Outside blocked; AI only edits inside the region |
| 14 | Write guard | Write `label if:` and save | Blocked + error list; force bypass works |
| 15 | Learning annotations | 📖 → confirm | Annotations written, lint passes, clear works |
| 16 | Style preview | Aa → click a dialogue line | Rich-text rendering; typewriter animation popup plays |
| 17 | Python equivalent | ⇄ parked on a `show` statement | Popup shows renpy.show(...) |
| 18 | GUI customization | 🎨 → change a theme color → save | gui.rpy written back |
| 19 | Static diagnostics | ✅ | Five categories displayed grouped; click to jump |
| 20 | Error diagnostics | Cause a crash (break the script while running) → 🐞 | traceback displayed structurally, jumps work |
| 21 | Python highlighting | Open a .rpy containing a python block | Keywords purple / types cyan / builtins blue / calls yellow |
| 22 | Settings | ⚙ → change font size / switch light-dark / apply scheme | Takes effect immediately; Esc closes |
| 23 | Side-bar chat | Send a message asking the AI to change code | Markdown/think/trace-jump/checkpoint timeline all work |

---

## 15. Known Limitations and Notes

1. **Host changes require a dsh restart**: updates involving the backend service (`host.js`) need a full exit and restart of dsh; UI-only (client) changes just need a page refresh.
2. **Learning annotations consume AI resources**: each generation calls the model once (one batched call); generation may take from seconds to tens of seconds (90s timeout protection).
3. **Workspace scope is a hard constraint**: once set, AI edits are limited to the region; for edits outside it the AI asks first — this is by design.
4. **Packaging/launching not supported**: the panel has no build/package button (an internal SDK launcher feature).
5. **Backups/checkpoints are not auto-cleaned**: `.renpy-user/backups/` and `checkpoints/` accumulate; clean them manually when needed.
6. **Writing `init python: import renpy` triggers an engine exception** (lint reports an error); don't write it.
7. **Some operations may trigger a DSH approval prompt** (sandbox policy); just allow it.
8. **The combined run/stop state is polling-driven**: in edge cases (within the first 2 seconds after the game starts) the button may briefly show ▶ — this is normal.

---

## 16. FAQ

**Q: The file tree is empty after loading a project?**
Check that the path is a Ren'Py project root containing the `game/` directory (e.g. `...\demo-script`), and click ⟳ to reload.

**Q: I don't see the changes the AI made?**
The editor auto-syncs external modifications (5s polling). If you have unsaved local changes to that file, it shows a conflict and keeps the local version — close the tab and reopen to load the external version.

**Q: No window appears after running the game?**
The first run may trigger an approval (sandbox policy); check the top bar status and the chat log; the game window is genuinely opened by the SDK, exactly like the launcher.

**Q: 📖 Learn reports "AI teaching failed: ?"?**
Mostly temporary model rate-limiting or empty responses; retry later; if the batch has many lines, consider narrowing the workspace scope first.

**Q: How do I fully reset the test environment?**
Delete the `backups` / `checkpoints` / `workspace` subdirectories under `.renpy-user/` (keep the directories themselves), then refresh the page.

**Q: Where can I see implementation details of each feature?**
The open-source repo documentation is updated continuously with releases, recording each feature's implementation, verification methods, and known issues (this document's §1–12 are the feature details).

---

## 17. Test Result Feedback

If you find any problems while testing (feature mismatch / UI misalignment / crash / wording errors), record them:

```
[Test date] ____
[Feature] ____ (e.g., Static Diagnostics)
[Steps] 1. ____ 2. ____ 3. ____
[Expected] ____
[Actual] ____ (screenshot can be attached)
[Environment] light/dark theme
```

After feedback, the developer fixes the issues and updates this document accordingly.

---

## 18. Passing Your Accumulated Experience to the Developer

> As you use the tool you'll accumulate a lot of first-hand experience: pitfalls you hit, patterns you verified, habits that fit your projects.
> This toolset is designed around **three-layer experience isolation** (the top of the `renpy-practices` skill carries the full statement).

### 18.1 What the three layers are

| Layer | Content | Ownership |
|---|---|---|
| **L1 Engine facts** | Definitive conclusions about syntax/semantics/API (source-verified + lint-verified) | Goes into the open-source package (renpy-* skills) |
| **L2 General principles** | The "reasoning" of organization/naming/performance, not tied to a specific project | Goes into the open-source package (renpy-practices) |
| **L3 Personal experience** | Your projects, your habits, your personal pitfalls | **Your private file**, not in the open-source package |

Priority: `L1 > L2 > L3 > model common sense`.

### 18.2 Record experience in your private file first (L3)

Append new experience to your personal file anytime while using:

```
~/.dsh/skills/renpy-practices-personal.md
```

- If the file doesn't exist, create it yourself (plain Markdown is fine).
- Content is free-form: pitfall notes, verified patterns, project-specific conventions, questions about the skills.
- The model automatically uses it as a reference when writing code (all files in the skill directory are loaded) — **your experience takes effect immediately**.

Suggested entry format:

```markdown
## <Topic>
- Phenomenon/context: …
- Measured result: …
- Conclusion: …
- To confirm: can this go into the open-source package as L1/L2?
```

### 18.3 Send it back to the developer (two ways)

**Method A: send the personal file directly (simplest)**

Send your `renpy-practices-personal.md` as-is to the developer. The developer will filter it themselves: L3 stays on your side, L1/L2 candidates enter the verification process.

**Method B: submit organized by template (recommended)**

For each experience you want to contribute, fill in this template and send it together with the file:

```markdown
- Experience: one-sentence conclusion
- Which layer (L1 engine fact / L2 general principle / L3 personal experience): ____
- Reproduction/basis: how was it obtained? (tested / docs / source / guess)
- Verified with renpy_lint: yes / no
- Minimal runnable example: …
```

- **L1 entries**: attach the verification method (lint output, minimal .rpy example, SDK version) so the developer can verify.
- **L2 entries**: explain the applicable scenario and the reasoning.
- **L3 entries**: mark "personal experience, no need to archive"; the developer won't use it in the open-source package.

### 18.4 What happens after the developer receives it

| Your submission | Developer's handling |
|---|---|
| Issue/Bug feedback | Recorded and tracked → fixed → confirmed by regression testing |
| L3 personal experience | Kept on your side, not in the open-source package (may get generalization advice) |
| L2 general principle | Verify the "reasoning" holds → merged into the corresponding section of renpy-practices |
| L1 engine fact | Source verification + lint validation → merged into the corresponding renpy-* skill (source credited) |

> Once L1/L2 experience enters the open-source package, everyone using this toolset (and their AIs) benefits — that's the greatest value of experience sharing. The L3 part in your personal file always belongs to you; you can change or delete it anytime.
