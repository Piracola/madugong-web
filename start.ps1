# MDG 马督工 - 一键启动
$ErrorActionPreference = "Stop"
$host.UI.RawUI.WindowTitle = "MDG 马督工"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BackendDir = Join-Path $ScriptDir "backend"
$FrontendDir = Join-Path $ScriptDir "frontend"

# ── 清理残留进程 ───────────────────────────────
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}
Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}

# ── 检查 .env ──────────────────────────────────
$BackendEnv = Join-Path $BackendDir ".env"
if (-not (Test-Path $BackendEnv)) {
    $RootEnv = Join-Path $ScriptDir ".env"
    $EnvExample = Join-Path $ScriptDir ".env.example"
    if (Test-Path $RootEnv) {
        Copy-Item $RootEnv $BackendEnv
    } elseif (Test-Path $EnvExample) {
        Copy-Item $EnvExample $BackendEnv
        Write-Host "[!] 已创建 backend\.env，请填入 API Key 后重新运行" -ForegroundColor Yellow
        Read-Host "按回车退出"
        exit 1
    }
}

# ── Python 虚拟环境 ────────────────────────────
$VenvDir = Join-Path $BackendDir "venv"
if (-not (Test-Path $VenvDir)) {
    Write-Host "[*] 创建 Python 虚拟环境..."
    python -m venv $VenvDir
}

$VenvPython = Join-Path $VenvDir "Scripts\python.exe"

Write-Host "[*] 检查后端依赖..."
& $VenvPython -m pip install -q -r (Join-Path $BackendDir "requirements.txt")

# ── 前端依赖 ──────────────────────────────────
$NodeModules = Join-Path $FrontendDir "node_modules"
if (-not (Test-Path $NodeModules)) {
    Write-Host "[*] 安装前端依赖..."
    Push-Location $FrontendDir
    npm install -q
    Pop-Location
}

# ── 启动 ───────────────────────────────────────
Write-Host ""
Write-Host "[*] 启动后端 (localhost:8000) ..." -ForegroundColor Green
$backendJob = Start-Process -FilePath $VenvPython -ArgumentList "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000" -WorkingDirectory $BackendDir -PassThru

Start-Sleep -Seconds 3

Write-Host "[*] 启动前端 (localhost:5173) ..." -ForegroundColor Green
$frontendJob = Start-Process -FilePath "cmd" -ArgumentList "/c", "cd /d `"$FrontendDir`" && npm run dev" -PassThru

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  前端: http://localhost:5173"
Write-Host "  后端: http://localhost:8000"
Write-Host "  按 Ctrl+C 或关闭窗口停止全部服务"
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Start-Process "http://localhost:5173"

# 阻塞等待，Ctrl+C 或关闭窗口时清理子进程
try {
    while ($true) { Start-Sleep -Seconds 1 }
} finally {
    Write-Host "`n[*] 停止服务..."
    Stop-Process -Id $backendJob.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $frontendJob.Id -Force -ErrorAction SilentlyContinue
    Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Write-Host "[*] 已停止"
}
