# Deployment Guide (deploy.ps1 full guide)

> This document is for **deployers** (people installing this Ren'Py development mode on a target machine).
> It fully explains the one-click deployment flow, both modes, parameters, verification, and troubleshooting.
> End users (testers) should see `GUIDE.md`; a quick start is in `README.md`.
> **中文版** → `DEPLOY.md`.

---

## 1. Deployment overview

`deploy.ps1` deploys this release to the DSH on the target machine, completing 8 steps at once:

| # | Step | Artifact |
|---|---|---|
| 1 | Detect whether DSH is installed | Decides which mode to use (§3) |
| 2 | Detect / specify the Ren'Py SDK | Records the SDK path (no download) |
| 3 | Copy the agent preset | `~/.dsh/.agent-presets/renpy/` |
| 4 | Copy the 14 skills | `~/.dsh/skills/renpy-*.md` |
| 5 | Link the dsh-renpy-dev-client plugin bundle | `~/.dsh/profiles/node_modules/dsh-renpy-dev-client` (junction) |
| 6 | Update the web profile | `~/.dsh/profiles/web/package.json` (bundles + link) |
| 7 | Create the preset's node_modules junction | Points to DSH node_modules |
| 8 | Generate the runtime config | `~/.dsh/renpy.config.json` |

**Restart dsh** after deployment for it to take effect (host-side plugins need a restart to load; client-side changes only need a page refresh).

---

## 2. Prerequisites

| Item | Requirement | Notes |
|---|---|---|
| OS | Windows 10/11 | The script uses PowerShell 5.1+, which ships with the system by default |
| DSH | Installed, or the script is allowed to install it | The script guides you if not installed (§3) |
| Ren'Py SDK | **Must be provided by you** | About 340 MB; the script will **not auto-download**, only detect/prompt |
| Node.js + npm | Only needed when installing DSH together | `npm install -g @deepseek-ai/dsh` |

### Getting the Ren'Py SDK (if you don't have it)

- Official download page: https://www.renpy.org/latest.html
- 8.5.3 direct link: https://www.renpy.org/dl/8.5.3/renpy-8.5.3-sdk.zip
- After extraction, the directory should contain `renpy.py` and `renpy.exe` (the script uses these to validate the SDK).

---

## 3. Two deployment modes

The script automatically branches based on whether DSH is already installed on the target machine:

### Mode A: DSH already installed (default, deploy plugin only)

Run directly:

```powershell
cd <extracted directory>
.\deploy.ps1
```

After detecting DSH, the script skips installation and deploys the plugin part only.

> **DSH installation-method compatibility**: the script supports three detection paths —
> ① npm global install (`%APPDATA%\npm\node_modules\@deepseek-ai\dsh`)
> ② **npx invocation** (`%LOCALAPPDATA%\npm-cache\_npx\<hash>\node_modules\@deepseek-ai\dsh`, auto-scans the npx cache)
> ③ an initialized DSH data directory (`~/.dsh/profiles` exists).
> In all cases the plugin mounts to **`~/.dsh/profiles/node_modules/`** (the second anchor of dsh-app-boot's
> bundle dual-anchor resolution, independent of DSH's install location), so npx cache hash changes don't matter.

### Mode B: Install DSH together (-InstallDsh)

```powershell
.\deploy.ps1 -InstallDsh
```

The script first runs `npm install -g @deepseek-ai/dsh`, then continues deploying the plugin after success.
(Requires Node.js/npm; global install may need an elevated terminal.)

> Users who run DSH via npx do not need this mode — DSH can already run through npx (e.g.
> `npx @deepseek-ai/dsh`), and the script can deploy the plugin directly once it detects the npx cache or profiles directory.

### When DSH is not installed and -InstallDsh is not given

The script prompts and asks: continue after manually installing DSH (enter `y`), or exit and re-run with `-InstallDsh`.

---

## 4. Parameters

| Parameter | Default | Description |
|---|---|---|
| `-SdkPath <path>` | auto-detect | Specify the SDK directory directly (containing renpy.py). If omitted, searches common locations: `renpy-8.5.3-sdk` inside the release, one level above the release, `~`, `D:\`; if none found, asks interactively |
| `-InstallDsh` | off | Install DSH together via npm global |
| `-DshHome <path>` | `$env:DSH_HOME` or `~/.dsh` | Override the DSH data directory (usually not needed; for testing / multiple instances) |

Examples:

```powershell
.\deploy.ps1 -SdkPath D:\renpy-8.5.3-sdk          # specify the SDK
.\deploy.ps1 -SdkPath D:\renpy-8.5.3-sdk -InstallDsh  # specify SDK + install DSH together
```

---

## 5. Deployment process (step by step)

Script output uses `==>` for steps, `✓` for success, `!` for notices, `x` for fatal errors.

> **Note**: the script's console output is in Chinese (it is the actual `Write-Host` text of `deploy.ps1`). The block below shows the real output, with placeholders localized (e.g. `<you>` for `<你>`, `<release>` for `<发布包>`) and English translations provided inline.

```
==> 检测环境                                          (Detect environment)
    DSH 数据目录: C:\Users\<you>\.dsh        <- DSH data directory
==> 检测 Ren'Py SDK                                   (Detect Ren'Py SDK)
    SDK: D:\renpy-8.5.3-sdk                  <- detected / entered SDK
==> 部署 agent preset                                 (Deploy agent preset)
    preset 已部署（agent.cordis.yml / preset.yml / plugins/）   (preset deployed)
==> 部署 renpy-* skills                               (Deploy renpy-* skills)
    已复制 14 个 skill                          (copied 14 skills)
==> 链接 dsh-renpy-dev-client 包                      (Link dsh-renpy-dev-client bundle)
    dsh-renpy-dev-client -> <release>\renpy-client    <- junction created
==> 更新 web profile                                  (Update web profile)
    web profile: ...\profiles\web\package.json
==> 创建 preset node_modules junction                 (Create preset node_modules junction)
    preset node_modules -> DSH node_modules
==> 生成 renpy.config.json                            (Generate renpy.config.json)
    写入 ...\renpy.config.json                 (written)
==> 部署完成                                          (Deployment complete)
```

**Key details**:

- `agent.cordis.yml` is generated from the `agent.cordis.yml.template`, with `{{SDK_PATH}}` replaced by the actual SDK path (forward slashes, YAML-safe).
- `dsh-renpy-dev-client` is linked with a **junction** (`mklink /J`) to the DSH node_modules — not copied, so upgrading the release can replace in place without re-linking.
- `renpy.config.json` is the runtime path config (sdkPath / userDir / indexerPath / skillRoot), read at plugin startup.
- Every run is **idempotent**: existing junctions/files are rebuilt/overwritten; safe to re-run.

---

## 6. Post-deployment verification

1. **Restart dsh** (fully quit the process and relaunch).
2. Create a new session and select the **RenPy Dev** preset.
3. Open the **Ren'Py** tab.
4. Enter a Ren'Py project path in the top input (a directory containing `game/`) → **⟳ Load**.
   - No existing project? Two quick ways:
     - Ask the AI to run `renpy_scaffold` to generate a new project;
     - Ask the AI to open a built-in SDK example: `<SDK path>\the_question`.
5. Smoke test three items:
   - File tree appears → open a `.rpy` → the editor opens;
   - Modify a line → `Ctrl+S` → **⚠ Check** → lint passes;
   - **▶ Run** → the game window pops up → **📷 Screenshot** → **■ Stop**.

Full functional tests are in `GUIDE.md` sections 4-5.

### Tester's personal experience file (auto-effective after deployment)

After deployment, testers can create `~/.dsh/skills/renpy-practices-personal.md` to record personal pitfalls and habits
(this project uses **three-tier experience isolation**: L1 engine facts / L2 general principles go into the open-source
package, L3 personal experience stays in the personal file).
The model auto-loads this file as reference without any configuration. How to feed accumulated experience back to
developers (templates / three submission methods / developer processing flow) is in `GUIDE.md` section 9.

---

## 7. Troubleshooting

| Symptom | Cause & resolution |
|---|---|
| `x 缺少 DSH，无法链接插件包` (missing DSH, cannot link the plugin bundle) | No DSH on the target machine (none detected in npm global / npx cache / profiles directory). Re-run with `-InstallDsh`, or manually install/run DSH once first (running it via npx initializes the profiles directory) |
| `x 路径不是有效的 Ren'Py SDK` (path is not a valid Ren'Py SDK) | `-SdkPath` or the entered path has no `renpy.py`. Check whether extraction is complete and the path is correct |
| `x 创建 junction 失败` (failed to create junction) | Target directory in use or insufficient permissions. Re-open PowerShell as administrator and re-run; confirm `~/.dsh/profiles\node_modules\dsh-renpy-dev-client` isn't held by another program |
| No **RenPy Dev** in the preset list after restart | Check `~/.dsh/.agent-presets/renpy/` exists and contains `agent.cordis.yml`; confirm dsh fully quit before restarting |
| The Ren'Py tab doesn't exist in the panel | Web profile not effective: check `profiles/web/package.json` bundles contains `dsh-renpy-dev-client` and `~/.dsh/profiles/node_modules/dsh-renpy-dev-client` exists; confirm dsh was restarted |
| SDK-related error when loading a project | Check `sdkPath` in `~/.dsh/renpy.config.json` points to a valid SDK; or set `RENPY_SDK_PATH` and restart |
| Editor changes don't apply / new features invisible | Client-side changes: refresh the page; host-side changes: must restart dsh |
| No skills after the panel loads | `~/.dsh/skills/` should contain `renpy-*.md` (14 of them); if missing, re-run deploy.ps1 |

---

## 8. Upgrade / Uninstall

### Upgrade

1. **Overwrite** the original extracted directory with the new release (keep the directory name).
2. Re-run `.\deploy.ps1` (idempotent; auto-rebuilds the junction and refreshes config).
3. Restart dsh.

### Uninstall

Manually remove the following:

```
~/.dsh/.agent-presets/renpy/                 # preset
~/.dsh/skills/renpy-*.md                     # 14 skills (optional)
~/.dsh/profiles/node_modules/dsh-renpy-dev-client    # plugin bundle junction
~/.dsh/renpy.config.json                     # runtime config (optional)
```

Also remove `dependencies.dsh-renpy-dev-client` and the `"dsh-renpy-dev-client"` entry in `dsh.profile.bundles` from
`~/.dsh/profiles/web/package.json`, then restart dsh.

---

## 9. Runtime path priority (no code changes needed)

The plugin resolves paths in this order:

1. Plugin `config` (config in agent.cordis.yml / cordis.patch.yml)
2. `~/.dsh/renpy.config.json` (generated by the deploy script)
3. Environment variables: `RENPY_SDK_PATH` / `RENPY_USERDIR` / `RENPY_INDEXERPATH` / `RENPY_SKILLROOT`
4. Default derivation (e.g. userDir = `<sdk>/../.renpy-user`)

After changing machines / SDKs, re-run `deploy.ps1`; the config updates automatically — no code changes needed.
