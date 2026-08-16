# Ren'Py Development Mode (dsh-renpy-dev) v1.0.0

> A validation of DSH's core idea: a self-bootstrapped Ren'Py development workbench with deep integration of agent preset + skills + web plugin.

DeepSeek Harness (DSH) is extended into a full **Ren'Py game development workbench**: an in-browser editor (syntax highlighting, autocomplete, find & replace), lint / run / screenshot / automated testing, save history with checkpoint rollback, workspace locking, AI learning annotations, 14 Ren'Py knowledge bases (skills), and 9 development tools directly callable by the AI.

This repository is the **open-source edition** (for developers/contributors), including the full verification assets. End users should use the **release zip** from the **Releases** page (no verification assets, more lightweight).

> 📦 Documentation:
> - **中文版** → **`README.md`**
> - **Deployment guide** (full: both modes / parameters / troubleshooting / upgrade & uninstall) → **`DEPLOY.md`**
> - **User guide** (features / operations / expected results / regression table + **how to feed your experience back to developers**) → **`GUIDE.md`**
> - **Knowledge pipeline** (how the 14 skills are produced: extraction → verification → engine validation) → **`docs/knowledge-pipeline.md`**
> - **Contribution guide** (three-tier experience isolation + submission conventions) → **`CONTRIBUTING.md`**
> - **Terminology** (EN↔ZH glossary for Ren'Py terms) → **`docs/glossary.md`**
> - Quick start → below.

## License

[MIT License](LICENSE).

---

## 1. Quick Deployment (for users)

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
   - Copy the preset, 14 skills, and link the `dsh-renpy-dev-client` plugin bundle
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

## 2. Post-deployment verification

1. Restart dsh, **create a new session**, and select the **RenPy Dev** preset.
2. Find and open the **Ren'Py** tab in the session.
3. Enter a project path in the top input (a Ren'Py project root containing `game/`) → click **⟳ Load**.
   - No project? Ask the AI via the chat box to run `renpy_scaffold` to generate one, or have the AI open a built-in SDK example (`<SDK>\the_question`).
4. Quick smoke test:
   - File tree appears on the left → open a `.rpy` → the editor opens
   - Modify a line → `Ctrl+S` → click **⚠ Check** in the toolbar → lint passes
   - Click **▶ Run** in the toolbar → the game window pops up → **📷 Screenshot** → **■ Stop**

See `GUIDE.md` for the detailed test checklist.

---

## 3. Directory structure

```
dsh-renpy-dev/
├── deploy.ps1                        # One-click deployment script (entry point)
├── README.md                         # This file (quick start)
├── DEPLOY.md                         # Full deployment guide (modes/parameters/troubleshooting/upgrade-uninstall)
├── GUIDE.md                        # User guide (features/operations/expected results/regression table)
├── CONTRIBUTING.md                   # Contribution guide (three-tier experience isolation + submission conventions)
├── LICENSE                           # MIT License
├── NOTICE                            # Third-party license notices (Ren'Py / DSH)
├── agent-presets/
│   └── renpy/
│       ├── preset.yml                # Preset name/description
│       ├── agent.cordis.yml.template # Plugin composition ({{SDK_PATH}} substituted at deploy)
│       └── plugins/
│           ├── renpy-host.mjs        # 9 agent tools (lint/index/scaffold/run/...)
│           └── indexer.py            # Project indexer (engine dump)
├── skills/
│   └── renpy-*.md                    # 14 Ren'Py knowledge bases (loaded on demand)
├── docs/
│   ├── knowledge-pipeline.md         # Knowledge production methodology (extract → verify → engine-validate)
│   └── glossary.md                   # EN↔ZH terminology glossary
├── verification/                     # Verification assets (open-source edition only)
│   ├── scripts/                      # Extraction/verification scripts (extract-*.js, verify-text.py)
│   ├── extracts/                     # Structured extraction outputs (*-extract.json)
│   ├── projects/                     # 17 engine-verified projects + eq-test
│   └── tests/                        # 15 unit tests (274 assertions)
└── renpy-client/                     # Web plugin bundle (editor UI + /renpy-dev services)
    ├── package.json
    ├── cordis.patch.yml
    └── lib/
        ├── host.js                   # 30 /renpy-dev/* endpoints (requires dsh restart)
        ├── renpy-core.js             # Shared pure-function module (lineDiff/hasOpenToolCall)
        └── client.js                 # Ren'Py panel UI (refresh to apply)
```

> The `dsh-renpy-dev/` in the tree above is this repository's root (the directory name you get after extracting the release; `cd` into it to deploy).

### Deployment artifacts (written by the script to the target machine)

| Location | Content |
|---|---|
| `~/.dsh/.agent-presets/renpy/` | Agent preset (including the generated agent.cordis.yml) |
| `~/.dsh/skills/renpy-*.md` | 14 skills |
| `~/.dsh/profiles/node_modules/dsh-renpy-dev-client` | Plugin bundle junction (points to the release; independent of how DSH is installed) |
| `~/.dsh/profiles/web/package.json` | Web profile (bundles + link dependency) |
| `~/.dsh/renpy.config.json` | SDK/indexer/skill path config (read at runtime) |

> The plugin is mounted under `~/.dsh/profiles/node_modules/` (the second anchor of dsh's bundle dual-anchor resolution),
> so it loads whether DSH runs via npm global install or npx.
> To uninstall: remove the renpy-related items from the locations above + the `dsh-renpy-dev-client` line in `profiles/web/package.json`.

---

## 4. Runtime path configuration

The deployment script generates `~/.dsh/renpy.config.json`. The plugin resolves paths at runtime with the following priority (no code changes needed):

1. Plugin `config` (config in agent.cordis.yml / cordis.patch.yml)
2. `~/.dsh/renpy.config.json`
3. Environment variables `RENPY_SDK_PATH` / `RENPY_USERDIR` / `RENPY_INDEXERPATH` / `RENPY_SKILLROOT`
4. Default derivation (e.g. userDir = `<sdk>/../.renpy-user`)

After reinstall or moving to another machine, just re-run `deploy.ps1`; the config updates automatically.

---

## 5. Version notes

- Targets **Ren'Py 8.5.x** (local SDK pinned to 8.5.3).
- Packaging (distribute) is not supported yet: SDK packaging lives inside the launcher; this plugin only covers `build.rpy` configuration knowledge (the `renpy-build` skill).
- Changelog and implementation details are in each version's **Releases** notes; for contributions see `CONTRIBUTING.md`.
