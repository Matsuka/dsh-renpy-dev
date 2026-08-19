# Ren'Py Development Mode (dsh-renpy-dev) v1.1.0

> A validation of DSH's core idea: a self-bootstrapped Ren'Py development workbench with deep integration of agent preset + skills + web plugin.

DeepSeek Harness (DSH) is extended into a full **Ren'Py game development workbench**: an in-browser editor (syntax highlighting including **Python blocks**, autocomplete, find & replace, codicon icon system), lint / run / screenshot / automated testing, save history with checkpoint rollback, workspace locking, write guard, static diagnostics and error diagnostics panels, AI learning annotations, personalization settings (25 color tokens + 8 preset themes), 15 Ren'Py knowledge bases (skills) plus a UI spec, and 13 development tools directly callable by the AI.

This repository is the **open-source edition** (for developers/contributors), including the full verification assets. End users should use the **release zip** from the **Releases** page (no verification assets, more lightweight).

> 📦 Documentation:
> - **中文版** → **`README.md`**
> - **Deployment guide** (full: both modes / parameters / troubleshooting / upgrade & uninstall) → **`DEPLOY.md`**
> - **User guide** (features / operations / expected results / regression table + **how to feed your experience back to developers**) → **`GUIDE.md`**
> - **Tester guide** (all-in-one: environment setup + per-feature details + operation/testing + FAQ + experience feedback: where → how → expected → what to test + full regression checklist) → **`TESTER-GUIDE.md`**
> - **Knowledge pipeline** (how the 15 skills are produced: extraction → verification → engine validation) → **`knowledge-pipeline.md`**
> - **Contribution guide** (three-tier experience isolation + submission conventions) → **`CONTRIBUTING.md`**
> - **Terminology** (EN↔ZH glossary for Ren'Py terms) → **`glossary.md`**
> - Quick start → below.

## License

[MIT License](LICENSE).

---

## 1. Project overview

### 1.1 What is this

**dsh-renpy-dev** is a **Ren'Py game development workbench** built into DeepSeek Harness (DSH): it turns an ordinary AI coding chat into a browser panel backed by a full development toolchain, closing the entire Ren'Py loop — "read code → edit code → verify → run" — inside the browser, with the AI involved at every step yet every step auditable and rollback-able.

At its core it is **deep integration of three shapes: agent preset + skills + web plugin**:

| Shape | Role |
|---|---|
| **agent preset** (RenPy Dev) | Registers the 13 dev tools (lint/index/scaffold/run/...) with the AI for autonomous use |
| **skills knowledge base** (15 `renpy-*`) | Loads engine facts on demand while the AI writes Ren'Py code, cutting down on invented syntax |
| **web plugin** (renpy-dev-client) | Full workbench UI in the browser + 39 local service endpoints |

The tool itself is **self-bootstrapped on DSH's own architecture** — a complete validation of DSH's core idea (composing preset + skills + plugins into a purpose-built dev environment).

### 1.2 Design philosophy

- **VSCode-like workbench + Adobe-like panels**: four-zone layout (activity bar / sidebar / editor / panels); panels can dock, drag, float, maximize, and persist their layout.
- **Engine facts first**: every knowledge base is produced through "source verification + lint validation" (see `knowledge-pipeline.md`), so the AI's Ren'Py knowledge has solid ground.
- **Transparent and auditable**: every AI change is visible live (diff panel + gutter markers), every save is auto-backed up, every turn gets an auto checkpoint — any step can be rolled back.
- **Safety, doubly enforced**: a **workspace lock** (edits and AI modifications confined to a region) plus a **write guard** (four-layer structural validation before saving) keep both humans and the AI from breaking scripts.
- **Zero-intrusion deployment**: the few visual tweaks to the DSH host (hiding the native input, branding the logo color) are runtime CSS injections — no DSH installation files are touched.

### 1.3 Architecture (four layers + a shared core)

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ UI layer        renpy-client/lib/client.js browser panel (editor/panels/settings)         │
│ Host layer      renpy-client/lib/host.js   39 /renpy-dev/* endpoints                      │
│ Shared core     renpy-core.js              pure functions (diagnostics/guard/parse/merge) │
│ Knowledge layer skills/renpy-*.md          15 knowledge bases + UI spec                   │
│ Tools layer     agent-presets/renpy/       13 AI tools + indexer                          │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

**How it works at a glance**:

| Mechanism | Description |
|---|---|
| Editor | textarea + syntax-highlighting overlay (RPY statements + **Python blocks** in a four-tier palette), lint-error underlines, bracket matching, autocomplete, find & replace |
| Debug bridge | On run, `_debug_bridge.rpy` is injected automatically → command files (jump/screenshot/click/advance) and report files (label/variables/screenshot polling) communicate in both directions |
| Persistence | Settings are layered (global + project), panel layout in localStorage, backups/checkpoints in the DSH user directory (never written into the project directory) |
| Status polling | Game run state polled every 2 s (drives the combined run/stop button); debug panel polled every 2 s (variables / view / route-map progress) |

### 1.4 Feature overview

| Category | Features |
|---|---|
| **Editing** | Syntax highlighting (RPY + Python blocks), autocomplete, find & replace, bracket matching, multiple tabs, unsaved-changes prompt, external-change sync, line-number mode / guides |
| **Verification** | Lint checks (engine-level), automated tests (rpytest), static diagnostics (five-category reference-integrity scans) |
| **Run & debug** | Combined run/stop, full-screen screenshot, route map (state machine + jumps), live view (click/advance/rollback), runtime variable monitoring, error diagnostics (structured traceback + root-cause localization) |
| **Collaboration** | Sidebar chat (Markdown / collapsible thoughts / edit-resend), trace jumping, learning annotations (line-by-line AI explanations), checkpoint timeline |
| **Safety** | Workspace lock, write guard (four-layer validation), save history + checkpoint rollback |
| **Customization** | Personalization settings (49 items: font / indent / display / light-dark / UI language + **25 color tokens** + 8 preset themes + global/project layering), visual GUI theme customization (gui.rpy) |
| **Knowledge** | 15 Ren'Py knowledge bases + statement ⇄ Python equivalence reference |

### 1.5 Knowledge base (skill) list

> When writing Ren'Py code, the AI **loads the matching skill on demand**; every skill is produced through "source verification + lint validation" (see `knowledge-pipeline.md`).

| skill | Description (when to load) |
|---|---|
| `renpy-core` | Core statement syntax cheat sheet, statement ↔ Python equivalence mapping, indentation & execution-order conventions. A must-read when writing .rpy |
| `renpy-text` | Dialogue & text: say variants, Character definition, `[var]` interpolation, `{b}{size}{color}` tags, escaping & line breaks |
| `renpy-atl` | ATL animation & transforms: transform definitions, interpolation, on/parallel/choice/repeat, position/scale/rotation |
| `renpy-transitions` | Transition effects: with dissolve/fade/move, Dissolve/Fade/CropMove/PushMove, per-layer Dict transitions |
| `renpy-screen` | Screen language: layout, widgets, style prefixes, action, show/hide/call screen, use nesting |
| `renpy-gui` | GUI theme customization: gui.init resolution, gui.* colors/fonts/sizes, style override hierarchy |
| `renpy-api` | Python-layer API: renpy.* functions, persistent, renpy.music/sound, store variables |
| `renpy-l10n` | Localization/translation: translate statements, string old/new, extract/merge workflow |
| `renpy-save` | Save system: FileSave/Load/Page/Slot, autosave, rollback + Gallery / Music Room / Achievement |
| `renpy-layeredimage` | Layered images: layeredimage statement, attribute/group, expression variants, auto attribute |
| `renpy-sprites` | Special displayables: SpriteManager particles (snow/falling leaves), Drag & Drop, Movie video |
| `renpy-route` | Route/branch design: design doc ↔ state machine ↔ code bidirectional conversion, route-map.json, reachability analysis |
| `renpy-test` | Automated testing: testsuite/testcase, run/advance/click, until, enabled/xfail |
| `renpy-build` | Build & release configuration: build.rpy classify/archive/package, platform tags |
| `renpy-practices` | Best-practices overview: file/character/label organization, asset management, cross-domain pitfall list |
| `workbench-ui` | Workbench UI style design spec (incl. codicon icon system naming conventions; consult when maintaining the UI) |

### 1.6 Agent tool list

> The **13 development tools** that the "RenPy Dev" preset registers for the AI (the AI can call them on its own during chat; the workbench buttons are wired to the same tools).

| Tool | Description |
|---|---|
| `renpy_scaffold` | Create a new Ren'Py project (directory structure + gui template generation) |
| `renpy_lint` | Run the official lint on the project, returning the exit code and full output |
| `renpy_index` | Generate/refresh the project structure index (labels/defines/screens/transforms, incl. file:line) |
| `renpy_find` | Static diagnostics (reference-integrity scan in seconds, no engine run required) |
| `renpy_guard` | Write-guard validation (four layers: indentation / reserved names / duplicate labels / bracket matching) |
| `renpy_read_error` | Structured read of error dump files (traceback.txt / log.txt / errors.txt) |
| `renpy_route_generate` | Generate the .rpy code skeleton from a route-map.json state machine |
| `renpy_run` | Launch the game (real window; auto-stops old processes; injects the debug bridge) |
| `renpy_stop` | Stop the running game process |
| `renpy_status` | Query the game process status + recent output |
| `renpy_test` | Run rpytest automated tests (headless) |
| `renpy_compile` | Force recompilation of scripts (.rpy → .rpyc) |
| `renpy_screenshot` | Full-screen screenshot saved as PNG (for humans and the AI to view the game) |

---

## 2. Documentation index

> The complete index of all documentation. Test users only need **`TESTER-GUIDE.md`** (all-in-one); developers/contributors read the rest.

| Document | Audience | Content |
|---|---|---|
| **`README.md`** | Everyone | This file: project overview, documentation index, quick deployment, verification, directory structure, runtime configuration, deployment & DSH native elements |
| **`GUIDE.md`** / `GUIDE.en.md` | Users | User guide: feature operations / expected results / regression table + experience feedback (streamlined for users) |
| **`TESTER-GUIDE.md`** / `TESTER-GUIDE.en.md` | **Test users** | **All-in-one feature handbook**: environment setup + per-feature walkthrough (purpose / entry / behavior / edge cases) + operation tests + 23-item regression checklist + FAQ + experience feedback |
| **`DEPLOY.md`** / `DEPLOY.en.md` | Deployers | Full deployment guide: both modes / parameters / troubleshooting / upgrade & uninstall |
| **`CONTRIBUTING.md`** | Contributors | Three-tier experience isolation + submission conventions |
| **`knowledge-pipeline.md`** | Knowledge producers | How the 15 skills are produced: extract → verify → engine-validate |
| **`glossary.md`** | Translators / learners | EN↔ZH terminology glossary for Ren'Py |
| **`skills/renpy-*.md`** (15) | AI (loaded on demand) | Ren'Py knowledge bases: api / atl / build / core / gui / l10n / layeredimage / practices / route / save / screen / sprites / test / text / transitions |
| **`skills/workbench-ui.md`** | UI maintainers | Workbench UI style design spec (incl. codicon icon system naming conventions) |
| **`.research/`** | Developers (internal) | Research archives: ecosystem research / editor-config research / route-map schema, etc. |

> All documents keep evolving with each version; English versions live in the corresponding `.en.md` files.

---

## 3. Quick Deployment (for users)

### Prerequisites

| Item | Requirement |
|---|---|
| Windows | 10/11 (PowerShell 5.1+) |
| DSH | Installed — **either npm global install or npx invocation** (the script can guide you if not installed, see below) |
| Ren'Py SDK | Must be obtained by yourself (about 340 MB; the script does **not** auto-download) |
| Node.js / npm | Required when installing DSH |

> Full deployment flow, both modes (DSH already installed / install DSH together), parameters and troubleshooting → see **`DEPLOY.md`**.

### Deployment steps

1. **Extract** the release package to any directory on the target machine (e.g. `D:\dsh-renpy-dev`).
2. Open PowerShell and enter that directory:

```powershell
cd D:\dsh-renpy-dev
.\deploy.ps1
```

3. The script will, in order:
   - Detect DSH (if not installed, ask: continue after manual install / auto-install with `-InstallDsh`)
   - Detect the Ren'Py SDK (searches common locations; if not found, prompts for the path, **no auto-download**)
   - Copy the preset, 15 skills (plus the UI spec), and link the `dsh-renpy-dev-client` plugin bundle
   - Update the web profile and generate the config file
4. **Restart dsh** (fully quit and relaunch).

### Common parameters

```powershell
.\deploy.ps1 -SdkPath D:\renpy-8.5.3-sdk   # specify the SDK directory directly
.\deploy.ps1 -InstallDsh                    # install DSH together (npm global)
.\deploy.ps1 -DshHome D:\custom\.dsh        # custom DSH data directory (usually not needed)
```

### Downloading the Ren'Py SDK (if you don't have it)

- Official download page: https://www.renpy.org/latest.html
- 8.5.3 direct link: https://www.renpy.org/dl/8.5.3/renpy-8.5.3-sdk.zip
- After extraction, the directory should contain `renpy.py` and `renpy.exe`.

---

## 4. Post-deployment verification

1. Restart dsh, **create a new session**, and select the **RenPy Dev** preset.
2. Find and open the **Ren'Py** tab in the session.
3. Enter a project path in the top input (a Ren'Py project root containing `game/`) → click **⟳ Load**.
   - No project? Ask the AI via the chat box to run `renpy_scaffold` to generate one, or have the AI open a built-in SDK example (`<SDK>\the_question`).
4. Quick smoke test:
   - File tree appears on the left → open a `.rpy` → the editor opens
   - Modify a line → `Ctrl+S` → click **⚠ Check** in the toolbar → lint passes
   - Click **▶ Run** in the toolbar → the game window pops up → **📷 Screenshot** → click the same button again (it has turned into **■ Stop**) to stop

See `GUIDE.md` for the detailed test checklist.

---

## 5. Directory structure

```
dsh-renpy-dev/
├── deploy.ps1                        # One-click deployment script (entry point)
├── README.md                         # This file (quick start)
├── DEPLOY.md                         # Full deployment guide (modes/parameters/troubleshooting/upgrade-uninstall)
├── GUIDE.md                        # User guide (features/operations/expected results/regression table)
├── TESTER-GUIDE.md                   # Tester guide (all-in-one: feature details + testing + FAQ)
├── knowledge-pipeline.md             # Knowledge production methodology (extract → verify → engine-validate)
├── glossary.md                       # EN↔ZH terminology glossary
├── CONTRIBUTING.md                   # Contribution guide (three-tier experience isolation + submission conventions)
├── LICENSE                           # MIT License
├── NOTICE                            # Third-party license notices (Ren'Py / DSH)
├── agent-presets/
│   └── renpy/
│       ├── preset.yml                # Preset name/description
│       ├── agent.cordis.yml.template # Plugin composition ({{SDK_PATH}} substituted at deploy)
│       └── plugins/
│           ├── renpy-host.mjs        # 13 agent tools (lint/index/scaffold/run/...)
│           └── indexer.py            # Project indexer (engine dump)
├── skills/
│   ├── renpy-*.md                    # 15 Ren'Py knowledge bases + workbench-ui UI spec (loaded on demand)
│   └── workbench-ui.md               # Workbench UI style design spec (incl. icon system)
├── verification/                     # Verification assets (open-source edition only)
│   ├── scripts/                      # Extraction/verification scripts (extract-*.js, verify-text.py)
│   ├── extracts/                     # Structured extraction outputs (*-extract.json)
│   ├── projects/                     # 17 engine-verified projects + eq-test
│   └── tests/                        # 21 unit tests (node --check + full regression)
└── renpy-client/                     # Web plugin bundle (editor UI + /renpy-dev services)
    ├── package.json
    ├── cordis.patch.yml
    └── lib/
        ├── host.js                   # 39 /renpy-dev/* endpoints (requires dsh restart)
        ├── renpy-core.js             # Shared pure-function module (lineDiff/hasOpenToolCall)
        └── client.js                 # Ren'Py panel UI (refresh to apply; includes the codicon icon system)
```

> The `dsh-renpy-dev/` in the tree above is this repository's root (the directory name you get after extracting the release; `cd` into it to deploy).

### Deployment artifacts (written by the script to the target machine)

| Location | Content |
|---|---|
| `~/.dsh/.agent-presets/renpy/` | Agent preset (including the generated agent.cordis.yml) |
| `~/.dsh/skills/*.md` | 15 knowledge skills + workbench-ui UI spec |
| `~/.dsh/profiles/node_modules/dsh-renpy-dev-client` | Plugin bundle junction (points to the release; independent of how DSH is installed) |
| `~/.dsh/profiles/web/package.json` | Web profile (bundles + link dependency) |
| `~/.dsh/renpy.config.json` | SDK/indexer/skill path config (read at runtime) |

> The plugin is mounted under `~/.dsh/profiles/node_modules/` (the second anchor of dsh's bundle dual-anchor resolution),
> so it loads whether DSH runs via npm global install or npx.
> To uninstall: remove the renpy-related items from the locations above + the `dsh-renpy-dev-client` line in `profiles/web/package.json`.

---

## 6. Runtime path configuration

The deployment script generates `~/.dsh/renpy.config.json`. The plugin resolves paths at runtime with the following priority (no code changes needed):

1. Plugin `config` (config in agent.cordis.yml / cordis.patch.yml)
2. `~/.dsh/renpy.config.json`
3. Environment variables `RENPY_SDK_PATH` / `RENPY_USERDIR` / `RENPY_INDEXERPATH` / `RENPY_SKILLROOT`
4. Default derivation (e.g. userDir = `<sdk>/../.renpy-user`)

After reinstall or moving to another machine, just re-run `deploy.ps1`; the config updates automatically.

---

## 7. Deployment and DSH native elements (as of v1.1)

The plugin applies a few **runtime visual adjustments** to the DSH host UI:

| Adjustment | Implementation | Depends on |
|---|---|---|
| Hides the native DSH composer input (the panel ships its own input area, avoiding double inputs) | Injects a `<style>` into `document.head` on panel mount, removed on unmount | `[data-composer-seat]` attribute |
| Pins the DSH sidebar logo (fish / wordmark) to the Ren'Py brand color `#00b8c3`, independent of theme changes | Same injection; CSS overrides the `fill: currentColor` inheritance chain | DSH sidebar CSS-Module semantic class suffixes (`logoRow` / `railFish` / `panelIcon`) |

**Impact on the deployment flow: none.**

- Both are **runtime-only injections** — no DSH installation files are modified (unmounting the panel / closing the page restores everything). The `deploy.ps1` flow, the plugin junction link, and the "restart dsh to take effect" rule are **unchanged**.
- ⚠️ **One caveat**: the injected CSS relies on DSH's DOM structure (class suffixes). **After upgrading DSH, regression-check** both injections (no duplicated input box; sidebar logo shows the brand color). If broken, adjust the injection effect in `client.js` for the new class names.
- **Skills deployment scope** (since v1.1): `deploy.ps1` copies `skills\*.md` (15 `renpy-*` knowledge bases + `workbench-ui` UI spec); older versions copied only `renpy-*.md`.
- **Upgrading an existing install**: re-extract the release (or update `renpy-client/lib/` and `skills/`) → re-run `deploy.ps1` (overwrites preset/skills/link) → **fully quit and restart dsh**.

---

## 8. Version notes

- Targets **Ren'Py 8.5.x** (local SDK pinned to 8.5.3).
- Packaging (distribute) is not supported yet: SDK packaging lives inside the launcher; this plugin only covers `build.rpy` configuration knowledge (the `renpy-build` skill).
- Changelog and implementation details are in each version's **Releases** notes; for contributions see `CONTRIBUTING.md`.
