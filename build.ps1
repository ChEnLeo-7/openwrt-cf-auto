param([string]$Version = "0.2.0")
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$Root = Get-Location
$BuildDir = Join-Path $Root "build"
Remove-Item $BuildDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null

# 引擎缺失时自动下载（vendor 二进制不入 git 仓库）
$CFSTVer = "v2.3.5"
foreach ($arch in @("amd64", "arm64")) {
    $cfst = Join-Path $Root "vendor\linux-$arch\cfst"
    if (-not (Test-Path $cfst)) {
        Write-Output "=== 下载 CloudflareSpeedTest linux/$arch ($CFSTVer) ==="
        $arc = if ($arch -eq "arm64") { "cfst_linux_arm64.tar.gz" } else { "cfst_linux_amd64.tar.gz" }
        $url = "https://github.com/XIU2/CloudflareSpeedTest/releases/download/$CFSTVer/$arc"
        $tmp = Join-Path $env:TEMP $arc
        curl.exe -sSL --ssl-no-revoke -o $tmp $url
        if ($LASTEXITCODE -ne 0) { curl.exe -sSL --ssl-no-revoke -o $tmp "https://gh-proxy.org/$url" }
        New-Item -ItemType Directory -Force -Path (Join-Path $Root "vendor\linux-$arch") | Out-Null
        tar -xzf $tmp -C (Join-Path $Root "vendor\linux-$arch") --strip-components=1
    }
}

foreach ($arch in @("amd64", "arm64")) {
    Write-Output "=== 构建 linux/$arch ==="
    $env:GOOS = "linux"; $env:GOARCH = $arch; $env:CGO_ENABLED = "0"
    $binOut = Join-Path $BuildDir "cf-auto-panel_linux_$arch"
    go build -trimpath -ldflags "-s -w" -o $binOut .
    if ($LASTEXITCODE -ne 0) { throw "go build 失败 ($arch)" }

    $cfstSrc = Join-Path $Root "vendor\linux-$arch\cfst"
    $ipkArch = if ($arch -eq "arm64") { "aarch64" } else { "x86_64" }
    $ipkOut = Join-Path $BuildDir "cf-auto_${Version}_${ipkArch}.ipk"

    python (Join-Path $Root "packaging\build_ipk.py") `
        --out $ipkOut --arch $ipkArch --version $Version `
        --bin $binOut --cfst $cfstSrc
    if ($LASTEXITCODE -ne 0) { throw "ipk 打包失败 ($arch)" }
}
$env:GOOS = ""; $env:GOARCH = ""; $env:CGO_ENABLED = ""

Write-Output "=== 产物 ==="
Get-ChildItem $BuildDir -Filter *.ipk | Select-Object Name, Length
Write-Output "ALL_DONE"
