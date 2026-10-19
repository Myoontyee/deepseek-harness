param(
 [string]$ToolsRoot='D:\DeepseekHarness\tools\android',
 [string]$OutputRoot='D:\DeepseekHarness\SetupBackage',
 [string]$KeyStore,
 [string]$PasswordFile,
 [string]$ProxyUrl='http://127.0.0.1:17897',
 [string]$Version='0.2.1-rc.2.20261019.2',
 [int]$VersionCode=2026101902,
 [switch]$Unsigned
)
$ErrorActionPreference='Stop'
$taskRepo=Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$taskProcess=[Diagnostics.Process]::GetCurrentProcess()
$taskProcess.PriorityClass='Normal'
$taskProcess.ProcessorAffinity=[IntPtr]([int]([Math]::Pow(2,[Math]::Min(8,[Environment]::ProcessorCount))-1))
$env:GOMAXPROCS='2';$env:GOFLAGS='-p=2';$env:GOTOOLCHAIN='local'
$env:GOPATH=Join-Path $ToolsRoot 'go-workspace'
$env:GOMODCACHE=Join-Path $ToolsRoot 'go-mod-cache'
$env:GOCACHE=Join-Path $ToolsRoot 'go-build-cache'
$env:GOPROXY='https://proxy.golang.org,direct'
$env:HTTPS_PROXY=$ProxyUrl;$env:HTTP_PROXY=$ProxyUrl
$taskProxyArguments=@()
if ($ProxyUrl) {
 $taskProxy=[Uri]$ProxyUrl
 $taskProxyArguments=@("-Dhttps.proxyHost=$($taskProxy.Host)","-Dhttps.proxyPort=$($taskProxy.Port)","-Dhttp.proxyHost=$($taskProxy.Host)","-Dhttp.proxyPort=$($taskProxy.Port)")
}
$env:JAVA_HOME=Join-Path $ToolsRoot 'jdk\jdk-17.0.20.1+1'
$env:ANDROID_HOME=Join-Path $ToolsRoot 'sdk'
$env:GRADLE_USER_HOME=Join-Path $ToolsRoot 'gradle-cache'
$taskGo=Join-Path $ToolsRoot 'go-1.27.1\go\bin\go.exe'
$taskNdk=Join-Path $env:ANDROID_HOME 'ndk\28.2.13676358\toolchains\llvm\prebuilt\windows-x86_64\bin'
$taskNative=Join-Path $taskRepo 'apps\android\app\src\main\jniLibs\arm64-v8a\libdsh_tailnet.so'
if (!(Test-Path -LiteralPath $taskGo)) { throw 'Install Go 1.27.1 under ToolsRoot first' }
if (!$Unsigned -and (!(Test-Path -LiteralPath $KeyStore) -or !(Test-Path -LiteralPath $PasswordFile))) { throw 'Local Android signing files are required' }
Push-Location (Join-Path $taskRepo 'apps\android\tailnet')
try {
 Write-Output 'Resolving and caching native dependencies'
 & $taskGo mod tidy
 if ($LASTEXITCODE -ne 0) { throw 'Go dependency resolution failed' }
 $env:CGO_ENABLED='0';$env:GOOS='windows';$env:GOARCH='amd64'
 & $taskGo test ./...
 if ($LASTEXITCODE -ne 0) { throw 'Android network bridge tests failed' }
 if (!(Test-Path -LiteralPath (Join-Path $taskNdk 'aarch64-linux-android26-clang.cmd'))) { throw 'Android NDK 28.2.13676358 is not ready' }
 $env:GOOS='android';$env:GOARCH='arm64';$env:CGO_ENABLED='1'
 $env:CC=Join-Path $taskNdk 'aarch64-linux-android26-clang.cmd'
 New-Item -ItemType Directory -Path (Split-Path $taskNative -Parent) -Force | Out-Null
 Write-Output 'Building ARM64 Tailscale component locally'
 & $taskGo build -trimpath -buildmode=pie -tags osusergo -ldflags '-s -w -extldflags=-Wl,-z,max-page-size=16384' -o $taskNative .
 if ($LASTEXITCODE -ne 0) { throw 'Native Android component build failed' }
 & (Join-Path $taskNdk 'llvm-readelf.exe') -h $taskNative | Select-String 'Class:|Machine:|Type:'
 if ($LASTEXITCODE -ne 0) { throw 'Native Android component validation failed' }
 $taskLicenses=Join-Path $taskRepo 'apps\android\app\src\main\assets\licenses'
 New-Item -ItemType Directory -Path $taskLicenses -Force | Out-Null
 Copy-Item -LiteralPath (Join-Path $env:GOMODCACHE 'tailscale.com@v1.104.1\LICENSE') -Destination (Join-Path $taskLicenses 'Tailscale-LICENSE.txt') -Force
 Copy-Item -LiteralPath (Join-Path $ToolsRoot 'go-1.27.1\go\LICENSE') -Destination (Join-Path $taskLicenses 'Go-LICENSE.txt') -Force
 & $taskGo list -m all | Set-Content (Join-Path $taskLicenses 'Go-dependencies.txt') -Encoding utf8
 & (Join-Path $PSScriptRoot 'collect-notices.ps1') -GoExe $taskGo -ModuleCache $env:GOMODCACHE -GoRoot (Join-Path $ToolsRoot 'go-1.27.1\go') -OutputDirectory $taskLicenses
} finally { Pop-Location }
$env:DSH_ANDROID_VERSION_NAME=$Version;$env:DSH_ANDROID_VERSION_CODE=[string]$VersionCode
Write-Output 'Building packaged phone chat interface'
Push-Location $taskRepo
try { node apps/android/ui/build.mjs; if ($LASTEXITCODE -ne 0) { throw 'Phone chat interface build failed' } } finally { Pop-Location }
Write-Output 'Building APK with cached Android dependencies'
& (Join-Path $ToolsRoot 'gradle-8.11.1\bin\gradle.bat') --no-daemon --max-workers=2 @taskProxyArguments -p (Join-Path $taskRepo 'apps\android') :app:testReleaseUnitTest :app:assembleRelease
if ($LASTEXITCODE -ne 0) { throw 'APK build failed' }
$taskInput=Join-Path $taskRepo 'apps\android\app\build\outputs\apk\release\app-release-unsigned.apk'
New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
if ($Unsigned) {
 $taskOutput=Join-Path $OutputRoot "deepseek-harness-$Version-android-arm64-unsigned.apk"
 Copy-Item -LiteralPath $taskInput -Destination $taskOutput
} else {
 $taskOutput=Join-Path $OutputRoot "deepseek-harness-$Version-android-arm64.apk"
 $taskSigner=Join-Path $env:ANDROID_HOME 'build-tools\35.0.0\apksigner.bat'
 & $taskSigner sign --ks $KeyStore --ks-key-alias dsh-companion --ks-pass "file:$PasswordFile" --out $taskOutput $taskInput
 if ($LASTEXITCODE -ne 0) { throw 'Local APK signing failed' }
 $taskVerification=& $taskSigner verify --verbose --print-certs $taskOutput
 if ($LASTEXITCODE -ne 0 -or ($taskVerification -join "`n") -notmatch 'e7f22b5b96df116121f091ad59eda08e7ce33225e39bebd89532660ce2949940') { throw 'APK signing certificate does not match the installed app' }
 $taskVerification | Select-String 'Verified|Verifies|SHA-256'
}
& (Join-Path $env:ANDROID_HOME 'build-tools\35.0.0\aapt2.exe') dump badging $taskOutput | Select-String '^package:|^application-label:|^native-code:'
if ($LASTEXITCODE -ne 0) { throw 'APK metadata validation failed' }
Get-FileHash -LiteralPath $taskOutput -Algorithm SHA256 | Format-List
Write-Output "LOCAL_ANDROID_APK_COMPLETE $taskOutput"
