<#
.SYNOPSIS
  Ren'Py 开发模式（DSH 插件集合）一键部署脚本。

.DESCRIPTION
  把本发布包部署到目标机器的 DSH：
    1. 检测 DSH 是否已安装（两种模式：只部署插件 / 连 DSH 一起装）
    2. 检测/指定 Ren'Py SDK 路径（不自动下载，缺失时给出官方下载指引）
    3. 复制 agent preset -> $DSH_HOME/.agent-presets/renpy/
    4. 复制 14 个 renpy-* skill -> $DSH_HOME/skills/
    5. 链接 renpy-client 包 -> DSH 的 node_modules（junction）
    6. 更新 web profile 的 package.json（bundles + link 依赖）
    7. 生成 $DSH_HOME/renpy.config.json（sdkPath/userDir/indexerPath/skillRoot）
    8. 创建 preset 目录的 node_modules junction -> DSH node_modules
  完成后重启 dsh，新会话选择 preset「RenPy Dev」即可使用。

.PARAMETER SdkPath
  指定 Ren'Py SDK 目录（含 renpy.py 的目录）。不传则自动检测常见位置；
  检测不到时提示手动指定，不会自动下载。

.PARAMETER InstallDsh
  连 DSH 一起安装（目标机器未装 DSH 时使用）。默认不装（只部署插件）。
  DSH 通过 npm 全局安装：npm install -g @deepseek-ai/dsh

.PARAMETER DshHome
  覆盖 DSH 数据目录（默认 $env:USERPROFILE\.dsh）。通常无需指定。

.EXAMPLE
  .\deploy.ps1                                    # 只部署插件，SDK 自动检测
  .\deploy.ps1 -SdkPath D:\renpy-8.5.3-sdk        # 指定 SDK 路径
  .\deploy.ps1 -InstallDsh                         # 目标机连 DSH 一起装
#>
[CmdletBinding()]
param(
  [string]$SdkPath = '',
  [switch]$InstallDsh,
  [string]$DshHome = ''
)

$ErrorActionPreference = 'Stop'
$pubRoot = $PSScriptRoot

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    ! $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "    x $msg" -ForegroundColor Red }

# ── 0. 环境检测 ──────────────────────────────────────────────────────────────
Write-Step '检测环境'

# DSH 数据目录
if (-not $DshHome) { $DshHome = $env:DSH_HOME }
if (-not $DshHome) { $DshHome = Join-Path $env:USERPROFILE '.dsh' }
Write-Ok "DSH 数据目录: $DshHome"

# DSH 安装位置检测：兼容 npm 全局安装 与 npx 缓存两种方式。
# npx 缓存 hash 不稳定，因此插件挂载不依赖它——统一挂到 $DshHome/profiles/node_modules
# （dsh-app-boot 的 bundle 双锚点解析：dsh 安装目录 → profile 目录；profile 目录是稳定锚点）。
$dshPkg = ''
# 1) npm 全局安装
$globalDsh = Join-Path $env:APPDATA 'npm\node_modules\@deepseek-ai\dsh'
if (Test-Path $globalDsh) { $dshPkg = $globalDsh }
# 2) npx 缓存（npm-cache/_npx/<hash>/node_modules/@deepseek-ai/dsh）
if (-not $dshPkg) {
  $npxRoot = Join-Path $env:LOCALAPPDATA 'npm-cache\_npx'
  if (Test-Path $npxRoot) {
    foreach ($h in (Get-ChildItem $npxRoot -Directory -ErrorAction SilentlyContinue)) {
      $cand = Join-Path $h.FullName 'node_modules\@deepseek-ai\dsh'
      if (Test-Path (Join-Path $cand 'package.json')) { $dshPkg = $cand; break }
    }
  }
}
# 3) 用户跑过 dsh（profiles 目录已初始化）也算已装
$hasDsh = ($dshPkg -ne '') -or (Test-Path (Join-Path $DshHome 'profiles'))
if ($dshPkg) { Write-Ok "DSH 安装位置: $dshPkg" }

if (-not $hasDsh) {
  if ($InstallDsh) {
    Write-Step '安装 DSH（npm 全局）'
    & npm install -g @deepseek-ai/dsh
    if ($LASTEXITCODE -ne 0) { Write-Fail 'npm 安装 DSH 失败'; exit 1 }
    $globalDsh = Join-Path $env:APPDATA 'npm\node_modules\@deepseek-ai\dsh'
    $hasDsh = Test-Path $globalDsh
    if (-not $hasDsh) { Write-Fail '安装后仍未检测到 DSH；请检查 npm 全局安装位置'; exit 1 }
    $dshPkg = $globalDsh
    Write-Ok 'DSH 已安装'
  } else {
    Write-Warn '目标机器未检测到 DSH（npm 全局 / npx 缓存 / 已初始化的 profiles 目录均无）。'
    Write-Host @"

    两种处理方式：
      1) 目标机器已有 DSH（或稍后手动安装）→ 直接继续本脚本（只部署插件），或
         重新运行： .\deploy.ps1
      2) 由本脚本自动安装 DSH → 重新运行： .\deploy.ps1 -InstallDsh
         （等价于 npm install -g @deepseek-ai/dsh）
"@
    $ans = Read-Host '继续部署插件？（y 继续 / n 退出）'
    if ($ans -notmatch '^[yY]') { Write-Fail '已取消'; exit 1 }
  }
}

# ── 1. SDK 检测（只提示，不下载）────────────────────────────────────────────
Write-Step "检测 Ren'Py SDK"
if (-not $SdkPath) {
  $candidates = @(
    (Join-Path $pubRoot 'renpy-8.5.3-sdk'),
    (Join-Path $pubRoot '..\renpy-8.5.3-sdk'),
    (Join-Path $env:USERPROFILE 'renpy-8.5.3-sdk'),
    'D:\renpy-8.5.3-sdk'
  )
  foreach ($c in $candidates) {
    if ($c -and (Test-Path (Join-Path $c 'renpy.py'))) { $SdkPath = $c; break }
  }
}
if (-not $SdkPath) {
  Write-Warn "未找到 Ren'Py SDK（未检测到 renpy.py）。本脚本不会自动下载。"
  Write-Host @"

  请手动下载 Ren'Py 8.5.3 SDK（约 340MB）：
    官方下载页： https://www.renpy.org/latest.html
    直链：       https://www.renpy.org/dl/8.5.3/renpy-8.5.3-sdk.zip
  解压后把目录路径填到这里（目录内应有 renpy.py 与 renpy.exe）。
"@
  $SdkPath = Read-Host 'SDK 目录路径'
}
$renpyPy = Join-Path $SdkPath 'renpy.py'
if (-not (Test-Path $renpyPy)) {
  Write-Fail "路径不是有效的 Ren'Py SDK（缺少 renpy.py）: $SdkPath"
  exit 1
}
$SdkPath = $SdkPath.TrimEnd('\', '/')
Write-Ok "SDK: $SdkPath"

# ── 2. 复制 agent preset ────────────────────────────────────────────────────
Write-Step '部署 agent preset'
$presetDir = Join-Path $DshHome '.agent-presets\renpy'
New-Item -ItemType Directory -Force -Path (Join-Path $presetDir 'plugins') | Out-Null

# preset.yml 与 plugins 直接复制
Copy-Item (Join-Path $pubRoot 'agent-presets\renpy\preset.yml') $presetDir -Force
Copy-Item (Join-Path $pubRoot 'agent-presets\renpy\plugins\renpy-host.mjs') (Join-Path $presetDir 'plugins') -Force
Copy-Item (Join-Path $pubRoot 'agent-presets\renpy\plugins\indexer.py') (Join-Path $presetDir 'plugins') -Force

# agent.cordis.yml：模板替换 SDK 路径（正斜杠，YAML 字符串安全）
$sdkYaml = $SdkPath.Replace('\', '/')
$template = Get-Content (Join-Path $pubRoot 'agent-presets\renpy\agent.cordis.yml.template') -Raw -Encoding UTF8
$composed = $template.Replace('{{SDK_PATH}}', $sdkYaml)
[System.IO.File]::WriteAllText((Join-Path $presetDir 'agent.cordis.yml'), $composed, (New-Object System.Text.UTF8Encoding($false)))
Write-Ok 'preset 已部署（agent.cordis.yml / preset.yml / plugins/）'

# ── 3. 复制 skills ──────────────────────────────────────────────────────────
Write-Step '部署 renpy-* skills'
$skillDir = Join-Path $DshHome 'skills'
New-Item -ItemType Directory -Force -Path $skillDir | Out-Null
$skillCount = (Get-ChildItem (Join-Path $pubRoot 'skills\renpy-*.md') -File -ErrorAction SilentlyContinue).Count
if ($skillCount -eq 0) { Write-Warn '发布包 skills/ 目录为空，跳过' }
else {
  Copy-Item (Join-Path $pubRoot 'skills\renpy-*.md') $skillDir -Force
  Write-Ok "已复制 $skillCount 个 skill"
}

# ── 4. 链接 renpy-client 包到 profiles/node_modules ─────────────────────────
# 挂载锚点 = $DshHome/profiles/node_modules（dsh-app-boot 的 bundle 双锚点解析
# 第二锚点：profile 目录向上查找命中此处）。此路径与 dsh 安装方式无关
# （npm 全局 / npx 缓存均适用），且由 healProfilesModuleFallback 保证存在。
Write-Step '链接 renpy-client 包'
if (-not $hasDsh) { Write-Fail '缺少 DSH，无法链接插件包'; exit 1 }
$profilesNm = Join-Path $DshHome 'profiles\node_modules'
New-Item -ItemType Directory -Force -Path $profilesNm | Out-Null
$rcTarget = Join-Path $profilesNm 'dsh-renpy-dev-client'

if (Test-Path $rcTarget) {
  # 已存在：若是 junction 指向旧路径则先移除重建（保证指向本发布包）
  $item = Get-Item $rcTarget -Force
  if ($item.LinkType -eq 'Junction') { (Get-Item $rcTarget).Delete() }
  elseif ($item.PSIsContainer) { Remove-Item $rcTarget -Recurse -Force }
}
$rcSrc = Join-Path $pubRoot 'renpy-client'
cmd /c mklink /J "`"$rcTarget`"" "`"$rcSrc`"" | Out-Null
if (-not (Test-Path (Join-Path $rcTarget 'package.json'))) { Write-Fail '创建 junction 失败（可能需要管理员权限）'; exit 1 }
Write-Ok "renpy-client -> $rcSrc"

# ── 5. 更新 web profile package.json（bundles + link 依赖）──────────────────
Write-Step '更新 web profile'
$profileDir = Join-Path $DshHome 'profiles\web'
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
$pkgPath = Join-Path $profileDir 'package.json'
$pkg = @{}
if (Test-Path $pkgPath) {
  $pkg = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json -AsHashtable
}
if (-not $pkg.ContainsKey('name')) { $pkg['name'] = 'dsh-profile-web' }
if (-not $pkg.ContainsKey('private')) { $pkg['private'] = $true }
if (-not $pkg.ContainsKey('dependencies')) { $pkg['dependencies'] = @{} }
$linkRef = "link:$($rcTarget.Replace('\','/'))"
$pkg['dependencies']['dsh-renpy-dev-client'] = $linkRef
if (-not $pkg.ContainsKey('dsh')) { $pkg['dsh'] = @{} }
if (-not $pkg['dsh'].ContainsKey('profile')) { $pkg['dsh']['profile'] = @{} }
$bundles = $pkg['dsh']['profile']['bundles']
if ($null -eq $bundles) { $bundles = @() }
$bundles = @($bundles | Where-Object { $_ })
if ($bundles.Count -eq 0) { $bundles = @('@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app') }
if ($bundles -notcontains 'dsh-renpy-dev-client') { $bundles += 'dsh-renpy-dev-client' }
$pkg['dsh']['profile']['bundles'] = $bundles
$json = $pkg | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($pkgPath, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Ok "web profile: $pkgPath"

# ── 6. preset 目录 node_modules junction -> profiles/node_modules ────────────
Write-Step '创建 preset node_modules junction'
$presetNm = Join-Path $presetDir 'node_modules'
if (Test-Path $presetNm) {
  $it = Get-Item $presetNm -Force
  if ($it.LinkType -eq 'Junction') { $it.Delete() }
  elseif ($it.PSIsContainer) { Remove-Item $presetNm -Recurse -Force }
}
cmd /c mklink /J "`"$presetNm`"" "`"$profilesNm`"" | Out-Null
if (-not (Test-Path $presetNm)) { Write-Fail '创建 preset node_modules junction 失败'; exit 1 }
else { Write-Ok 'preset node_modules -> profiles/node_modules' }

# ── 7. 生成 renpy.config.json（host.js 运行时读取）──────────────────────────
Write-Step '生成 renpy.config.json'
$userDir = Join-Path $DshHome 'renpy-user'
$config = @{
  sdkPath    = $SdkPath.Replace('\', '/')
  userDir    = $userDir.Replace('\', '/')
  indexerPath = (Join-Path $presetDir 'plugins\indexer.py').Replace('\', '/')
  skillRoot  = $skillDir.Replace('\', '/')
}
[System.IO.File]::WriteAllText((Join-Path $DshHome 'renpy.config.json'), ($config | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
Write-Ok "写入 $DshHome\renpy.config.json"

# ── 8. 完成 ─────────────────────────────────────────────────────────────────
Write-Step '部署完成'
Write-Host @"

  ✓ agent preset:  $presetDir
  ✓ skills:        $skillDir（$skillCount 个）
  ✓ 插件包:        renpy-client 已链接
  ✓ SDK:           $SdkPath
  ✓ 配置:          $DshHome\renpy.config.json

  下一步：
    1. 重启 dsh（完全退出后重新启动）
    2. 新建会话，preset 选择「RenPy Dev」
    3. 打开「Ren'Py」页签，加载项目即可使用
"@
Write-Warn "注意：本脚本只部署插件；Ren'Py SDK 需自行下载（若已指定路径则跳过）。"
