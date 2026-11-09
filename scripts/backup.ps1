<#
.SYNOPSIS
    Cloudflare D1（库名 interview）自动备份：导出到 backups/，只留最近 N 份，并写运行日志。

.DESCRIPTION
    1. 用 `npx wrangler d1 export interview --remote` 把线上库导出成
       backups/interview-yyyyMMdd-HHmmss.sql；
    2. 自动创建 backups/ 目录；
    3. 只保留最近 14 份自动备份（按文件名时间戳排序，更早的删除）；
    4. 每次运行向 backups/backup.log 追加一行：时间 | 状态 | 文件名 | 大小 | 耗时 | 退出码 | 详情；
    5. 导出失败时日志记录错误摘要，退出码非 0。

    不匹配 `interview-<yyyyMMdd-HHmmss>.sql` 的老文件（例如手工导出的
    interview-20261106-2251.sql）不参与保留计数，也不会被本脚本删除。

.PARAMETER Keep
    保留的自动备份份数，默认 14。

.PARAMETER Database
    D1 数据库名，默认 interview（要与 wrangler.toml 里的 database_name 一致）。

.PARAMETER OutputDirectory
    备份目录，默认 <仓库根>/backups。

.EXAMPLE
    pwsh -File scripts/backup.ps1

.EXAMPLE
    pwsh -File scripts/backup.ps1 -Keep 30

.NOTES
    前置条件：
      1. PowerShell 7+（pwsh）为推荐环境。本文件保存为 UTF-8 with BOM，
         在 Windows PowerShell 5.1 下也能正常解析（已验证）；计划任务请用 pwsh。
      2. 已在本机执行过 `npx wrangler login`（OAuth 凭据在 %USERPROFILE%\.wrangler\config）。
         计划任务必须用同一个 Windows 用户运行，否则读不到凭据，导出会失败。
      3. 仓库里已 `npm install`（wrangler 装在 node_modules 里；脚本用
         `npx --no-install` 调用它，不会临时联网装包）。
      4. 导出的是 --remote 线上库，需要有 d1 写权限的账号。

    安全：
      backups/ 含用户邮箱等个人信息，已在 .gitignore 里 —— 不要提交、不要外传。
      本脚本不打印数据内容，只打印文件名/大小/耗时。

    退出码：
      0 = 导出 + 清理都成功；1 = 任一步失败（细节见 backup.log 最后一行）。
#>

[CmdletBinding()]
param(
    [ValidateRange(1, 366)]
    [int]$Keep = 14,

    [ValidateNotNullOrEmpty()]
    [string]$Database = 'interview',

    [string]$OutputDirectory
)

Set-StrictMode -Version Latest
# 不用 'Stop'：Windows PowerShell 5.1 下原生命令的 stderr 重定向会被当成终止错误。
$ErrorActionPreference = 'Continue'

# ---- 路径 ----------------------------------------------------------------
$scriptDir = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($scriptDir)) {
    $scriptDir = (Get-Location).ProviderPath
}
$repoRoot = Split-Path -Parent $scriptDir

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repoRoot 'backups'
}
elseif (-not [System.IO.Path]::IsPathRooted($OutputDirectory)) {
    # 相对路径按仓库根解析，不按当前工作目录，避免计划任务里 cwd 不确定
    $OutputDirectory = Join-Path $repoRoot $OutputDirectory
}
$logPath = Join-Path $OutputDirectory 'backup.log'

$autoNamePattern = '^interview-\d{8}-\d{6}\.sql$'   # 文件名补零，按名字降序 = 按时间降序
$esc = [string][char]27                            # 去 ANSI 颜色用

# ---- 小工具 --------------------------------------------------------------
function Write-Step {
    param([string]$Message)
    Write-Host "[backup] $Message"
}

function Get-ErrorSummary {
    <# 从 wrangler 输出里挑一行最像错误的，压成单行、限长，方便塞进日志。 #>
    param(
        [string[]]$Lines = @(),
        [string]$Fallback = ''
    )

    $clean = New-Object 'System.Collections.Generic.List[string]'
    foreach ($raw in $Lines) {
        if ($null -eq $raw) { continue }
        $text = ($raw -replace ($esc + '\[[0-9;?]*[ -/]*[@-~]'), '').Trim()
        if (-not [string]::IsNullOrWhiteSpace($text)) { $clean.Add($text) }
    }

    $summary = $null
    for ($i = $clean.Count - 1; $i -ge 0; $i--) {
        if ($clean[$i] -match '(?i)(error|failed|econnreset|enotfound|unauthorized|exit code)') {
            $summary = $clean[$i]
            break
        }
    }
    if (-not $summary -and $clean.Count -gt 0) {
        $summary = $clean[$clean.Count - 1]
    }
    if (-not $summary) { $summary = $Fallback }

    $summary = ($summary -replace '\s+', ' ').Trim()
    if ($summary.Length -gt 300) { $summary = $summary.Substring(0, 300) + '...' }
    return $summary
}

function Format-Size {
    param([long]$Bytes)
    if ($Bytes -ge 1MB) { return ('{0:N0} B ({1:N2} MB)' -f $Bytes, ($Bytes / 1MB)) }
    if ($Bytes -ge 1KB) { return ('{0:N0} B ({1:N1} KB)' -f $Bytes, ($Bytes / 1KB)) }
    return ('{0:N0} B' -f $Bytes)
}

# ---- 运行状态（finally 里统一落日志） --------------------------------------
$startedAt = Get-Date
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

$status = 'FAIL'
$exitCode = 1
$fileName = '-'
$sizeText = '-'
$detail = ''
$wranglerOutput = New-Object 'System.Collections.Generic.List[string]'

try {
    # ---- 准备目录 --------------------------------------------------------
    if (-not (Test-Path -LiteralPath $OutputDirectory)) {
        New-Item -ItemType Directory -Path $OutputDirectory -Force -ErrorAction Stop | Out-Null
        Write-Step "已创建目录 $OutputDirectory"
    }

    $fileName = 'interview-' + $startedAt.ToString('yyyyMMdd-HHmmss') + '.sql'
    $outFile = Join-Path $OutputDirectory $fileName
    Write-Step "导出 $Database（--remote） -> $outFile"

    # ---- 调 wrangler -----------------------------------------------------
    $npx = Get-Command 'npx.cmd' -ErrorAction SilentlyContinue
    if (-not $npx) {
        throw '找不到 npx.cmd：请确认已安装 Node.js 且 npx 在 PATH 中（npm i 之后 wrangler 在 node_modules 里）'
    }

    Push-Location -LiteralPath $repoRoot
    try {
        # --skip-confirmation：计划任务里没人能按 y，必须跳过交互确认
        & $npx.Source --no-install wrangler d1 export $Database --remote "--output=$outFile" --skip-confirmation 2>&1 |
            ForEach-Object {
                $line = $_.ToString()
                $wranglerOutput.Add($line)
                Write-Host $line
            }
        $wranglerExit = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($wranglerExit -ne 0) {
        $reason = Get-ErrorSummary -Lines $wranglerOutput.ToArray() -Fallback 'wrangler 没有输出错误详情'
        throw "wrangler d1 export 失败（退出码 $wranglerExit）：$reason"
    }

    # ---- 校验产物 --------------------------------------------------------
    if (-not (Test-Path -LiteralPath $outFile)) {
        $reason = Get-ErrorSummary -Lines $wranglerOutput.ToArray() -Fallback '退出码为 0 但没有生成文件'
        throw "导出文件不存在：$outFile（$reason）"
    }
    $bytes = (Get-Item -LiteralPath $outFile -Force).Length
    if ($bytes -le 0) {
        throw "导出文件是空的：$outFile"
    }
    $sizeText = Format-Size -Bytes $bytes
    Write-Step "导出完成：$fileName（$sizeText）"

    # ---- 只留最近 Keep 份 ------------------------------------------------
    $autoBackups = @(
        Get-ChildItem -LiteralPath $OutputDirectory -Filter 'interview-*.sql' -File -ErrorAction Stop |
            Where-Object { $_.Name -match $autoNamePattern } |
            Sort-Object -Property Name -Descending      # 名字定长补零，等价于按时间倒序
    )

    $stale = @($autoBackups | Select-Object -Skip $Keep)
    $deleted = 0
    foreach ($item in $stale) {
        try {
            Remove-Item -LiteralPath $item.FullName -Force -ErrorAction Stop
            $deleted++
            Write-Step "删除旧备份 $($item.Name)"
        }
        catch {
            throw "清理旧备份失败（$($item.Name)）：$($_.Exception.Message)"
        }
    }

    $remaining = $autoBackups.Count - $deleted
    $status = 'OK'
    $exitCode = 0
    $detail = "清理: 删除 $deleted 份，现存 $remaining 份（保留上限 $Keep）"
}
catch {
    $status = 'FAIL'
    $exitCode = 1
    $message = $_.Exception.Message
    if ([string]::IsNullOrWhiteSpace($message)) {
        $message = Get-ErrorSummary -Lines $wranglerOutput.ToArray() -Fallback '未知错误'
    }
    $detail = '错误: ' + (($message -replace '\s+', ' ').Trim())
    Write-Host "[backup] 失败：$detail" -ForegroundColor Red
}
finally {
    $stopwatch.Stop()
    $elapsed = '{0:0.0}s' -f $stopwatch.Elapsed.TotalSeconds

    # 失败时补一次大小（文件可能已生成一半）
    if ($sizeText -eq '-' -and $fileName -ne '-') {
        $candidate = Join-Path $OutputDirectory $fileName
        if (Test-Path -LiteralPath $candidate) {
            $sizeText = Format-Size -Bytes (Get-Item -LiteralPath $candidate -Force).Length
        }
    }

    $timestamp = $startedAt.ToString('yyyy-MM-dd HH:mm:ss')
    $logLine = '{0} | {1} | {2} | {3} | {4} | exit={5} | {6}' -f `
        $timestamp, $status, $fileName, $sizeText, $elapsed, $exitCode, $detail

    try {
        if (-not (Test-Path -LiteralPath $logPath)) {
            $header = '# backup.log — 每次运行一行，字段用 " | " 分隔：时间 / 状态(OK/FAIL) / 文件名 / 大小 / 耗时 / 退出码 / 详情'
            Add-Content -LiteralPath $logPath -Value $header -Encoding utf8 -ErrorAction Stop
        }
        Add-Content -LiteralPath $logPath -Value $logLine -Encoding utf8 -ErrorAction Stop
    }
    catch {
        Write-Warning "写日志失败（$logPath）：$($_.Exception.Message)"
        if ($exitCode -eq 0) { $exitCode = 1 }   # 备份成功但日志没写进去，也要让人看见
    }

    Write-Host "[backup] $logLine"
    if ($exitCode -eq 0) {
        Write-Host "[backup] 成功，耗时 $elapsed" -ForegroundColor Green
    }
    else {
        Write-Host "[backup] 失败，耗时 $elapsed，详情见 $logPath" -ForegroundColor Red
    }
}

exit $exitCode
