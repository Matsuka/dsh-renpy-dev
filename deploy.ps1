<#
.SYNOPSIS
  Ren'Py 开发模式（DSH 插件集合）一键部署脚本 —— 面向 DSH 0.2.x。

.DESCRIPTION
  把本发布包部署到目标机器的 DSH（0.2.0-rc.2 及以上）：
    1. 检测 DSH 是否已安装 + 版本是否 >= 0.2.0（0.1.x 的目录式 preset 已被废除，脚本会拒绝）
    2. 检测/指定 Ren'Py SDK 路径（不自动下载，缺失时给出官方下载指引）
    3. 复制 16 个 renpy-* skill + 界面规范 -> $DSH_HOME/skills/
    4. 链接 renpy-client 包 -> $DSH_HOME/profiles/node_modules（junction）
    5. 在包内建 node_modules junction -> DSH 安装目录的 node_modules
       （工具插件 lib/renpy-host.mjs 需要解析裸说明符 @deepseek-ai/dsh-tools）
    6. 更新 web profile 的 package.json（dependencies link + dsh.profile.bundles）
    7. 生成 $DSH_HOME/renpy.config.json（sdkPath/userDir/indexerPath/skillRoot）
  完成后重启 dsh，新会话即可在 preset 列表里选择「RenPy Dev」。

  与 0.1.x 部署方式的差异（DSH 0.2.0 迁移）：
    - 不再部署 $DSH_HOME/.agent-presets/renpy/：0.2.0 废除了目录式 preset，preset 改为
      bundle patch 里的一行 @deepseek-ai/dsh-agent-preset（见 renpy-client/cordis.patch.yml），
      随插件包一起生效。
    - 因此不再需要 preset 目录的 node_modules junction，也不需要替换 agent.cordis.yml 里的
      SDK 路径占位符（工具插件自行读取 renpy.config.json）。
    - 新增「包内 node_modules junction」：工具插件现在从插件包内加载（包导出子路径
      dsh-renpy-dev-client/tools），其裸说明符必须能解析。

.PARAMETER SdkPath
  指定 Ren'Py SDK 目录（含 renpy.py 的目录）。不传则自动检测常见位置；
  检测不到时提示手动指定，不会自动下载。

.PARAMETER InstallDsh
  连 DSH 一起安装（目标机器未装 DSH 时使用）。默认不装（只部署插件）。
  DSH 通过 npm 全局安装：npm install -g @deepseek-ai/dsh

.PARAMETER DshHome
  覆盖 DSH 数据目录（默认 $env:DSH_HOME 或 ~/.dsh）。通常无需指定。

.EXAMPLE
  .\deploy.ps1                                    # 只部署插件，SDK 自动检测
  .\deploy.ps1 -SdkPath D:\renpy-8.5.3-sdk        # 指定 SDK 路径
  .\deploy.ps1 -InstallDsh                        # 目标机连 DSH 一起装
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

# ── 0.5 DSH 版本闸门：本发布包面向 0.2.x（0.1.x 的目录式 preset 已被引擎废除） ──
Write-Step '检查 DSH 版本'
$dshVersion = ''
if ($dshPkg -and (Test-Path (Join-Path $dshPkg 'package.json'))) {
  try {
    $dshVersion = (Get-Content (Join-Path $dshPkg 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
  } catch { $dshVersion = '' }
}
if (-not $dshVersion) {
  Write-Warn '无法读取 DSH 版本（未检测到安装目录）；跳过版本闸门。'
} else {
  Write-Ok "DSH 版本: $dshVersion"
  if ($dshVersion -match '^0\.1\.') {
    Write-Fail "本发布包要求 DSH 0.2.0 及以上（检测到 $dshVersion）。"
    Write-Host @"

      DSH 0.2.0 废除了目录式 agent preset（$DSH_HOME/.agent-presets/<id>/agent.cordis.yml），
      本发布包的 preset 改为 bundle patch 形式，0.1.x 无法加载。

      请先升级 DSH：
        npm install -g @deepseek-ai/dsh@0.2.0-rc.2
      然后重新运行本脚本。
"@
    exit 1
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

# ── 2. 复制 skills（全部 *.md：15 个 renpy-* 知识库 + workbench-ui 界面规范） ──
Write-Step '部署 skills'
$skillDir = Join-Path $DshHome 'skills'
New-Item -ItemType Directory -Force -Path $skillDir | Out-Null
$skillCount = (Get-ChildItem (Join-Path $pubRoot 'skills\*.md') -File -ErrorAction SilentlyContinue).Count
if ($skillCount -eq 0) { Write-Warn '发布包 skills/ 目录为空，跳过' }
else {
  Copy-Item (Join-Path $pubRoot 'skills\*.md') $skillDir -Force
  Write-Ok "已复制 $skillCount 个 skill"
}

# ── 3. 链接 renpy-client 包到 profiles/node_modules ─────────────────────────
# 挂载锚点 = $DshHome/profiles/node_modules：0.2.0 的 bundle 解析顺序是
# 「dsh 安装目录 → profile 的 node_modules」，树外插件由 pnpm 装在此处，
# junction 等价于「已安装」，且与 dsh 的安装方式（npm 全局 / npx 缓存）无关。
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

# ── 4. 包内 node_modules junction -> DSH 安装目录的 node_modules ────────────
# 工具插件（lib/renpy-host.mjs，preset 里以 dsh-renpy-dev-client/tools 加载）在模块顶层
# 导入 @deepseek-ai/dsh-tools；Node 按「模块真实路径逐级向上找 node_modules」解析，而本包
# 真实路径在发布包目录（其上层没有 node_modules），所以必须在包内建 junction 指向 DSH 的
# node_modules。（0.1.x 这一步建在 preset 目录下；preset 目录废除后改到包内。）
# 说明：npm 的目录布局随安装方式不同——`npm install -g` 把依赖嵌在
# <global>/node_modules/@deepseek-ai/dsh/node_modules 下，而 `npm install --prefix`
# 与 npx 缓存会把依赖提升到公共的 <root>/node_modules，所以上面用「向上探测」定位
# 真正含 @deepseek-ai/dsh-tools 的那一个，而不是死认 <dshPkg>\node_modules。
Write-Step '创建包内 node_modules junction（供工具插件解析 @deepseek-ai/dsh-tools）'
if (-not $dshPkg) {
  Write-Fail '未检测到 DSH 安装目录，无法创建包内 node_modules junction。'
  Write-Fail '13 个 renpy_* 工具将无法加载；请先安装 DSH 后重跑本脚本，'
  Write-Fail '或手动把 <发布包>\renpy-client\node_modules 链接到 DSH 安装目录的 node_modules。'
  exit 1
}
$dshNm = ''
# 从安装目录（以及它若是 junction 时的真实目标）向上收集所有 node_modules 目录作为候选。
$roots = @($dshPkg)
try {
  $dshItem = Get-Item $dshPkg -Force -ErrorAction SilentlyContinue
  if ($dshItem -and $dshItem.LinkType -and $dshItem.Target) { $roots += @($dshItem.Target)[0] }
} catch { }
$probe = @()
foreach ($r in $roots) {
  $probe += (Join-Path $r 'node_modules')
  $probePath = $r
  for ($i = 0; $i -lt 4; $i++) {
    $probePath = Split-Path $probePath -Parent
    if (-not $probePath) { break }
    if ((Split-Path $probePath -Leaf) -eq 'node_modules') { $probe += $probePath }
  }
}
$probe = @($probe | Where-Object { $_ } | Select-Object -Unique)
foreach ($c in $probe) {
  if (Test-Path (Join-Path $c '@deepseek-ai\dsh-tools')) { $dshNm = $c; break }
}
if (-not $dshNm) {
  Write-Fail "在 DSH 安装位置附近找不到 @deepseek-ai/dsh-tools。"
  Write-Fail "已探测：$($probe -join ' ; ')"
  Write-Fail '13 个 renpy_* 工具需要它才能加载；请手动把 <发布包>\renpy-client\node_modules'
  Write-Fail '链接到包含 @deepseek-ai/dsh-tools 的那个 node_modules 目录（mklink /J）。'
  exit 1
}
Write-Ok "工具依赖目录: $dshNm"
$rcNm = Join-Path $rcSrc 'node_modules'
if (Test-Path $rcNm) {
  $it2 = Get-Item $rcNm -Force
  if ($it2.LinkType -eq 'Junction') { $it2.Delete() }
  elseif ($it2.PSIsContainer) { Remove-Item $rcNm -Recurse -Force }
}
cmd /c mklink /J "`"$rcNm`"" "`"$dshNm`"" | Out-Null
if (-not (Test-Path (Join-Path $rcNm '@deepseek-ai\dsh-tools'))) { Write-Fail '创建包内 node_modules junction 失败'; exit 1 }
Write-Ok "renpy-client\node_modules -> $dshNm"

# ── 5. 更新 web profile package.json（dependencies link + bundles）──────────
Write-Step '更新 web profile'
$profileDir = Join-Path $DshHome 'profiles\web'
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
$pkgPath = Join-Path $profileDir 'package.json'
# 递归 PSCustomObject → hashtable（兼容 PowerShell 5.1；7 的 ConvertFrom-Json -AsHashtable 在 5.1 不存在）
function ConvertTo-Hashtable($obj) {
  if ($obj -is [System.Management.Automation.PSCustomObject]) {
    $h = @{}
    $obj.PSObject.Properties | ForEach-Object { $h[$_.Name] = ConvertTo-Hashtable $_.Value }
    return $h
  }
  if ($obj -is [System.Collections.IEnumerable] -and $obj -isnot [string]) {
    return @($obj | ForEach-Object { ConvertTo-Hashtable $_ })
  }
  return $obj
}
$pkg = @{}
if (Test-Path $pkgPath) {
  $pkg = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $pkg = ConvertTo-Hashtable $pkg
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

# ── 6. 生成 renpy.config.json（host.js 与 renpy-host.mjs 运行时读取）────────
Write-Step '生成 renpy.config.json'
$userDir = Join-Path $DshHome 'renpy-user'
$config = @{
  sdkPath     = $SdkPath.Replace('\', '/')
  userDir     = $userDir.Replace('\', '/')
  indexerPath = (Join-Path $rcSrc 'lib\indexer.py').Replace('\', '/')
  skillRoot   = $skillDir.Replace('\', '/')
}
[System.IO.File]::WriteAllText((Join-Path $DshHome 'renpy.config.json'), ($config | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
Write-Ok "写入 $DshHome\renpy.config.json"

# ── 7. 完成 ─────────────────────────────────────────────────────────────────
Write-Step '部署完成'
Write-Host @"

  ✓ DSH:           $dshVersion
  ✓ skills:        $skillDir（$skillCount 个）
  ✓ 插件包:        renpy-client 已链接（含包内 node_modules junction）
  ✓ agent preset:  RenPy Dev（随插件 bundle patch 生效，无需单独目录）
  ✓ SDK:           $SdkPath
  ✓ 配置:          $DshHome\renpy.config.json

  下一步：
    1. 重启 dsh（完全退出后重新启动）
    2. 新建会话，preset 选择「RenPy Dev」
    3. 打开「Ren'Py」页签，加载项目即可使用
"@
Write-Warn "注意：本脚本只部署插件；Ren'Py SDK 需自行下载（若已指定路径则跳过）。"
