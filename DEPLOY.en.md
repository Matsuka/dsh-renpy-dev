# Deployment Guide (deploy.ps1 full guide)

> This document is for **deployers** (people installing this Ren'Py development mode on a target machine).
> It fully explains the one-click deployment flow, both modes, parameters, verification, and troubleshooting.
> End users (testers) should see `GUIDE.md`; a quick start is in `README.md`.
> **中文版** → `DEPLOY.md`.
> **Version v1.2.0** — supports **DSH 0.2.0-rc.2 and above** (the directory-based preset of 0.1.x was retired by the engine, so the script refuses to deploy onto it).

---

## 1. Deployment overview

`deploy.ps1` deploys this release to the DSH on the target machine, completing 7 steps at once:

| # | Step | Artifact |
|---|---|---|
| 1 | Detect whether DSH is installed + **version gate** (0.1.x is refused outright) | Decides which mode to use (§3) |
| 2 | Detect / specify the Ren'Py SDK | Records the SDK path (no download) |
| 3 | Copy 17 skills (16 renpy-* knowledge bases + UI spec) | `~/.dsh/skills/*.md` |
| 4 | Link the dsh-renpy-dev-client plugin bundle | `~/.dsh/profiles/node_modules/dsh-renpy-dev-client` (junction) |
| 5 | Create the **in-package** node_modules junction | `<release>\renpy-client\node_modules` → the DSH installation's node_modules |
| 6 | Update the web profile | `~/.dsh/profiles/web/package.json` (bundles + link) |
| 7 | Generate the runtime config | `~/.dsh/renpy.config.json` |

> **The preset is no longer deployed separately**: 0.2.0 retired directory-based presets
> (`~/.dsh/.agent-presets/<id>/`). The "RenPy Dev" preset is now a single row
> `name: '@deepseek-ai/dsh-agent-preset'` inside the plugin bundle's `renpy-client/cordis.patch.yml`,
> so it takes effect along with the plugin bundle (see §5 "Key details").

**Restart dsh** after deployment for it to take effect (host-side plugins need a restart to load; client-side changes only need a page refresh).

---

## 2. Prerequisites

| Item | Requirement | Notes |
|---|---|---|
| OS | Windows 10/11 | The script uses PowerShell 5.1+, which ships with the system by default |
| DSH | **0.2.0-rc.2 or above** | Installed, or the script is allowed to install it; 0.1.x is refused by the version gate (§3, §7) |
| Ren'Py SDK | **Must be provided by you** | About 340 MB; the script will **not auto-download**, only detect/prompt |
| Node.js + npm | Only needed when installing DSH together | `npm install -g @deepseek-ai/dsh@0.2.0-rc.2` |

### Getting the Ren'Py SDK (if you don't have it)

- Official download page: https://www.renpy.org/latest.html
- 8.5.3 direct link: https://www.renpy.org/dl/8.5.3/renpy-8.5.3-sdk.zip
- After extraction, the directory should contain `renpy.py` and `renpy.exe` (the script uses these to validate the SDK).

---

## 3. Deployment modes

The script automatically branches based on whether DSH is already installed on the target machine:

### Mode A: DSH already installed (default, deploy plugin only)

Run directly:

```powershell
cd <extracted directory>
.\deploy.ps1
```

After detecting DSH, the script skips installation and deploys the plugin part only.

**Version gate**: the script reads the `package.json` version of the detected DSH installation and **fails outright on `0.1.*`**, printing the upgrade instructions:

```powershell
npm install -g @deepseek-ai/dsh@0.2.0-rc.2
```

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

The script first runs `npm install -g @deepseek-ai/dsh` (currently 0.2.0-rc.2), then continues deploying the plugin
after success; the same version gate as Mode A applies afterwards.
(Requires Node.js/npm; global install may need an elevated terminal.)

> Users who run DSH via npx do not need this mode — DSH can already run through npx (e.g.
> `npx @deepseek-ai/dsh`), and the script can deploy the plugin directly once it detects the npx cache or profiles directory.

### When DSH is not installed and -InstallDsh is not given

The script prompts and asks: continue after manually installing DSH (enter `y`), or exit and re-run with `-InstallDsh`.

### Mode C: Official desktop client (Electron app)

The official DSH desktop client ([deepseek.com/download](https://www.deepseek.com/download/), package
`@deepseek-ai/dsh-desktop`) is an Electron shell with a **bundled dsh runtime** (no system Node/npm/pnpm required).
It **shares the same `~/.dsh`** as the npm-global or npx dsh, but uses **its own profile**:
`~/.dsh/profiles/desktop/` (created automatically by the app on first launch).
**`deploy.ps1` does not touch it** — the script only deploys the `web` profile.

> That profile is **managed exclusively by the Electron application**, and the CLI refuses it outright:
> `dsh --profile desktop --dump-config` → `error: profile "desktop" is managed exclusively by the Electron application`

To get the workbench inside the desktop client, add the bundle to that profile's manifest by hand, then
**fully quit and relaunch the app**:

```powershell
# 1) The plugin junction is shared: deploy.ps1 already created ~/.dsh/profiles/node_modules/dsh-renpy-dev-client
# 2) Edit ~/.dsh/profiles/desktop/package.json: add one dependency + one bundle selection
```

```json
{
  "dependencies": {
    "dsh-renpy-dev-client": "link:C:/Users/<you>/.dsh/profiles/node_modules/dsh-renpy-dev-client"
  },
  "dsh": { "profile": { "bundles": [
    "@deepseek-ai/dsh-base",
    "@deepseek-ai/dsh-web-app",
    "dsh-renpy-dev-client"
  ] } }
}
```

3. Quit the desktop client: on Windows **closing the window only hides it to the tray** — use the tray icon →
   **Quit DeepSeek Harness**, then relaunch.
4. Check whether the host plugin loaded: `http://127.0.0.1:<port>/renpy-dev/info` returns **200**. The port is the
   `dsh web: http://127.0.0.1:<port>/?token=…` line in the app's startup log (the app uses an OS-assigned port,
   **not a fixed 3080**).

> `skills/`, `renpy.config.json`, sessions and credentials all live in the shared `~/.dsh`, so the desktop client
> sees them automatically — **no repeated configuration**. But **`web` and `desktop` are two separate profiles**:
> configuring one does not configure the other.

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
    DSH 安装位置: ...\npm\node_modules\@deepseek-ai\dsh   <- DSH install location
==> 检查 DSH 版本                                     (Check DSH version)
    DSH 版本: 0.2.0-rc.2                     <- 0.1.x fails here
==> 检测 Ren'Py SDK                                   (Detect Ren'Py SDK)
    SDK: D:\renpy-8.5.3-sdk                  <- detected / entered SDK
==> 部署 skills                                       (Deploy skills)
    已复制 17 个 skill（16 知识库 + 界面规范）  (copied 17 skills)
==> 链接 renpy-client 包                              (Link renpy-client bundle)
    renpy-client -> <release>\renpy-client    <- junction created
==> 创建包内 node_modules junction（供工具插件解析 @deepseek-ai/dsh-tools）
                                                      (Create the in-package node_modules junction)
    工具依赖目录: ...\node_modules            <- the one containing @deepseek-ai/dsh-tools
    renpy-client\node_modules -> ...\node_modules
==> 更新 web profile                                  (Update web profile)
    web profile: ...\profiles\web\package.json
==> 生成 renpy.config.json                            (Generate renpy.config.json)
    写入 ...\renpy.config.json                 (written)
==> 部署完成                                          (Deployment complete)
```

**Key details**:

- **How the preset takes effect**: `renpy-client/cordis.patch.yml` inserts two rows — `renpy-dev` (the host plugin `lib/host.js`, registering the ~39 `/renpy-dev/*` endpoints) and `preset-renpy` (`name: '@deepseek-ai/dsh-agent-preset'`, the "RenPy Dev" preset). As long as `dsh-renpy-dev-client` appears in the web profile's `dsh.profile.bundles`, this patch is applied when the profile is composed — **a separate preset directory is no longer needed**.
- **No SDK path placeholder anymore**: 0.1.x's `agent.cordis.yml.template` + `{{SDK_PATH}}` substitution is gone; the 13 tool plugins (package export subpath `dsh-renpy-dev-client/tools` → `lib/renpy-host.mjs`) read `~/.dsh/renpy.config.json` themselves (priority: plugin config → `renpy.config.json` → `RENPY_*` environment variables).
- **The in-package node_modules junction is required**: the tool plugin imports the bare specifier `@deepseek-ai/dsh-tools` at module top level, while the plugin package's real path lives in the release directory (which has no node_modules above it), so the script links `<release>\renpy-client\node_modules` to the DSH installation's node_modules that **actually contains `@deepseek-ai/dsh-tools`** (it tolerates both the nested layout of `npm install -g` and the hoisted layout of `npm install --prefix` / npx, and resolves junction targets).
- `dsh-renpy-dev-client` is linked with a **junction** (`mklink /J`) into `~/.dsh/profiles/node_modules` — not copied, so upgrading the release can replace in place without re-linking.
- `renpy.config.json` is the runtime path config (sdkPath / userDir / indexerPath / skillRoot), read at plugin startup; its `indexerPath` points to `<release>\renpy-client\lib\indexer.py`.
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

### Engine-level verification evidence (measured on DSH 0.2.0-rc.2)

- Host plugin: `/renpy-dev/info` returns 200; `/renpy-dev/lint` runs a real Ren'Py 8.5.3 lint, exit code 0.
- Client bundle: registered in the boot graph (`plugins/??dsh-renpy-dev-client/client.js&rev=…`, 200), and its row carries `inject: ["@deepseek-ai/dsh-client-ui-renderer"]`.
- All 13 `renpy_*` tools register; `renpy_run` returns `onExpiry: 'none'` (foreground calls use `'kill'`).

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
| No **RenPy Dev** in the preset list after restart | 0.2.0 has no preset directory anymore: confirm `dsh-renpy-dev-client` is in `dsh.profile.bundles` of `~/.dsh/profiles/web/package.json` (i.e. `renpy-client/cordis.patch.yml` is applied), and check that `dsh --profile web --dump-config` shows `preset-renpy` in the composed tree |
| The preset appears, but the 13 `renpy_*` tools are missing / `@deepseek-ai/dsh-tools` cannot be found | The in-package `node_modules` junction is missing or points at a node_modules without `dsh-tools`; re-run `deploy.ps1` (see §5 "Key details") |
| `deploy.ps1` reports "this release requires DSH 0.2.0 or above" | The target machine runs DSH 0.1.x: upgrade first with `npm install -g @deepseek-ai/dsh@0.2.0-rc.2`, then re-run the script |
| The Ren'Py tab doesn't exist in the panel | Web profile not effective: check `profiles/web/package.json` bundles contains `dsh-renpy-dev-client` and `~/.dsh/profiles/node_modules/dsh-renpy-dev-client` exists; confirm dsh was restarted |
| SDK-related error when loading a project | Check `sdkPath` in `~/.dsh/renpy.config.json` points to a valid SDK; or set `RENPY_SDK_PATH` and restart |
| Editor changes don't apply / new features invisible | Client-side changes: refresh the page; host-side changes: must restart dsh |
| No skills after the panel loads | `~/.dsh/skills/` should contain `*.md` (17 skills: 16 renpy-* knowledge bases + workbench-ui); if missing, re-run deploy.ps1 |
| The **RenPy Dev** card in Settings shows a red **"Failed to load"** badge and **cannot be clicked** | This is a **definition-level** preset mount failure, not a missing plugin. The 0.2.0 registry audit marks a whole definition broken when a row never started, threw during activation, or leaked a service into the root realm — and a broken card is deliberately `aria-disabled` (it cannot be selected as the default). **Diagnostic text**: hover the red badge. **Root cause (fixed)**: `apply(ctx, config)` in `renpy-client/lib/renpy-host.mjs` had no default, while the `renpy-dev-host` preset row declares no `config:`, so the loader passes `undefined` → line 47 `config.routeGeneratorPath` throws `Cannot read properties of undefined (reading 'routeGeneratorPath')`. Overwrite with the new release and **restart dsh** (a mount failure is final: it is not re-mounted without a restart) |
| No **Ren'Py** tab / no **RenPy Dev** in the desktop client | The desktop client uses **its own `desktop` profile**, while `deploy.ps1` only writes the `web` profile → add the bundle manually (see §3 Mode C) and restart the app. Check: `http://127.0.0.1:<port>/renpy-dev/info` returns 200 (the port is the `dsh web:` line in the app's startup log) |
| `dsh --profile desktop …` reports `managed exclusively by the Electron application` | Expected: the `desktop` profile belongs to the desktop client and cannot be managed from the CLI. To change its composition, edit `~/.dsh/profiles/desktop/package.json` and restart the app |

> ⚠️ **The DSH version must match**: the plugin files in this release are in **0.2.0 format** (the host side calls `ctx.shell.execute`, and the preset is a bundle-patch row).
> If the plugin package is junctioned into a **0.1.x** DSH, the workbench breaks outright (there is no `ctx.shell.execute` and no preset row).
> **Upgrade DSH to 0.2.0-rc.2 first, then restart dsh.**

---

## 8. Upgrade / Uninstall

### Upgrade

1. Confirm DSH is already **0.2.0-rc.2 or above** (for 0.1.x run `npm install -g @deepseek-ai/dsh@0.2.0-rc.2` first).
2. **Overwrite** the original extracted directory with the new release (keep the directory name).
3. Re-run `.\deploy.ps1` (idempotent; rebuilds both junctions and refreshes config).
4. Restart dsh.

### Uninstall

Manually remove the following:

```
~/.dsh/skills/*.md                          # 17 skills (optional)
~/.dsh/profiles/node_modules/dsh-renpy-dev-client    # plugin bundle junction
<release>\renpy-client\node_modules          # in-package node_modules junction (goes away with the release)
~/.dsh/renpy.config.json                     # runtime config (optional)
```

> `~/.dsh/.agent-presets/renpy/` is a **0.1.x leftover**: 0.2.0 retired directory-based presets, that directory is no longer read, and it is safe to delete.

Also remove `dependencies.dsh-renpy-dev-client` and the `"dsh-renpy-dev-client"` entry in `dsh.profile.bundles` from
`~/.dsh/profiles/web/package.json`, then restart dsh.

The same applies to the desktop client: remove those two entries from `~/.dsh/profiles/desktop/package.json`, then
restart the app.

---

## 9. Runtime path priority (no code changes needed)

The plugin resolves paths in this order:

1. Plugin `config` (in 0.2.0 this comes from the per-row `config` in `renpy-client/cordis.patch.yml`; 0.1.x's `agent.cordis.yml` no longer exists)
2. `~/.dsh/renpy.config.json` (generated by the deploy script)
3. Environment variables: `RENPY_SDK_PATH` / `RENPY_USERDIR` / `RENPY_INDEXERPATH` / `RENPY_SKILLROOT`
4. Default derivation (e.g. userDir = `<sdk>/../.renpy-user`)

After changing machines / SDKs, re-run `deploy.ps1`; the config updates automatically — no code changes needed.
