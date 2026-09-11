[CmdletBinding()]
param(
    [string]$PythonExecutable = "python",
    [switch]$Seed,
    [switch]$Smoke,
    [ValidateRange(1, 65535)]
    [int]$ApiPort = 8000,
    [ValidateRange(1, 65535)]
    [int]$FrontendPort = 4173
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $repoRoot "backend"
$prototypePath = Join-Path $repoRoot "prototype"
$frontendOrigin = "http://127.0.0.1:$FrontendPort"
$apiOrigin = "http://127.0.0.1:$ApiPort"
$apiBaseUrl = "$apiOrigin/api/v1"
$apiProcess = $null
$frontendProcess = $null

function Resolve-Executable {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (Test-Path -LiteralPath $Name -PathType Leaf) {
        return (Resolve-Path -LiteralPath $Name).Path
    }
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "找不到必需命令：$Name"
    }
    return $command.Source
}

function Assert-PortAvailable {
    param([Parameter(Mandatory = $true)][int]$Port)

    $occupied = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
        Where-Object { $_.Port -eq $Port }
    if ($occupied) {
        throw "本机端口 $Port 已被占用；脚本不会停止或覆盖现有进程。"
    }
}

function Wait-HttpReady {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$Name,
        [int]$Attempts = 40
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                return
            }
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    }
    throw "$Name 未在预期时间内就绪：$Url"
}

$resolvedPython = Resolve-Executable -Name $PythonExecutable
$npmCommand = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
if (-not $npmCommand) {
    $npmCommand = Get-Command "npm" -ErrorAction SilentlyContinue
}
if (-not $npmCommand) {
    throw "找不到必需命令：npm"
}
$resolvedNpm = $npmCommand.Source
$resolvedNode = Resolve-Executable -Name "node"
$viteEntrypoint = Join-Path $prototypePath "node_modules\vite\bin\vite.js"
if (-not (Test-Path -LiteralPath $viteEntrypoint -PathType Leaf)) {
    throw "前端依赖尚未安装；请先在 prototype 目录运行 npm ci。"
}

$pythonVersionText = (& $resolvedPython -c 'import sys; print(".".join(map(str, sys.version_info[:3])))').Trim()
if ([version]$pythonVersionText -lt [version]"3.12") {
    throw "需要 Python 3.12 或更高版本，当前为 $pythonVersionText"
}
$nodeVersionText = (& $resolvedNode --version).Trim().TrimStart("v")
if ([version]$nodeVersionText -lt [version]"22.0") {
    throw "需要 Node.js 22 或更高版本，当前为 $nodeVersionText"
}

Assert-PortAvailable -Port $ApiPort
Assert-PortAvailable -Port $FrontendPort

Push-Location $backendPath
try {
    & $resolvedPython -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) {
        throw "Alembic 迁移失败。"
    }
    if ($Seed) {
        & $resolvedPython -m app.seed
        if ($LASTEXITCODE -ne 0) {
            throw "演示种子初始化失败。"
        }
    }
}
finally {
    Pop-Location
}

$previousCorsOrigins = [Environment]::GetEnvironmentVariable("CORS_ORIGINS", "Process")
$previousApiBaseUrl = [Environment]::GetEnvironmentVariable("VITE_API_BASE_URL", "Process")

try {
    $env:CORS_ORIGINS = $frontendOrigin
    $apiProcess = Start-Process `
        -FilePath $resolvedPython `
        -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$ApiPort") `
        -WorkingDirectory $backendPath `
        -WindowStyle Hidden `
        -PassThru
    Wait-HttpReady -Url "$apiOrigin/health/ready" -Name "后端"

    $env:VITE_API_BASE_URL = $apiBaseUrl
    $frontendProcess = Start-Process `
        -FilePath $resolvedNode `
        -ArgumentList @($viteEntrypoint, "--host", "127.0.0.1", "--port", "$FrontendPort", "--strictPort") `
        -WorkingDirectory $prototypePath `
        -WindowStyle Hidden `
        -PassThru
    Wait-HttpReady -Url $frontendOrigin -Name "前端"

    $webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $config = Invoke-RestMethod -Uri "$apiBaseUrl/config" -WebSession $webSession
    $catalog = Invoke-RestMethod -Uri "$apiBaseUrl/tea-items?page=1&page_size=20" -WebSession $webSession
    if (-not $config.meta.request_id -or -not $catalog.meta.request_id) {
        throw "公开接口未返回正式 envelope。"
    }
    if (@($catalog.data.items).Count -eq 0) {
        throw "公开茶品目录为空；需要演示数据时请加 -Seed。"
    }

    if ($Smoke) {
        $item = @($catalog.data.items)[0]
        $inquiryBody = @{
            kind = "sample"
            tea_id = $item.tea_id
            tea_item_id = $item.id
            need = "本地联调自动验收，不需要实际联系。"
            contact = @{ channel = "phone"; value = "13800138000" }
            consent = @{
                accepted = $true
                notice_version = $config.data.inquiry_notice.version
                purpose = $config.data.inquiry_notice.purpose
            }
        } | ConvertTo-Json -Depth 8
        $inquiry = Invoke-RestMethod `
            -Method Post `
            -Uri "$apiBaseUrl/inquiries" `
            -WebSession $webSession `
            -Headers @{ Origin = $frontendOrigin; "Idempotency-Key" = [guid]::NewGuid().ToString() } `
            -ContentType "application/json; charset=utf-8" `
            -Body $inquiryBody
        if (-not $inquiry.meta.request_id -or -not $inquiry.data.id) {
            throw "咨询冒烟请求未返回正式 envelope。"
        }
        if (($inquiry | ConvertTo-Json -Depth 8) -match "13800138000") {
            throw "咨询回执不应回显完整联系方式。"
        }
        Write-Host "咨询冒烟：通过（回执 $($inquiry.data.id)）"
    }

    Write-Host "本地联调服务已就绪："
    Write-Host "  用户端：$frontendOrigin/"
    Write-Host "  管理后台：$frontendOrigin/#/admin"
    Write-Host "  API 文档：$apiOrigin/docs"
    Write-Host "  API PID：$($apiProcess.Id)"
    Write-Host "  前端 PID：$($frontendProcess.Id)"
    Write-Host "完成后可只停止本脚本创建的进程：Stop-Process -Id $($apiProcess.Id),$($frontendProcess.Id)"
}
catch {
    if ($frontendProcess -and -not $frontendProcess.HasExited) {
        Stop-Process -Id $frontendProcess.Id
    }
    if ($apiProcess -and -not $apiProcess.HasExited) {
        Stop-Process -Id $apiProcess.Id
    }
    throw
}
finally {
    [Environment]::SetEnvironmentVariable("CORS_ORIGINS", $previousCorsOrigins, "Process")
    [Environment]::SetEnvironmentVariable("VITE_API_BASE_URL", $previousApiBaseUrl, "Process")
}
