param([Parameter(Mandatory)][string]$GoExe,[Parameter(Mandatory)][string]$ModuleCache,[Parameter(Mandatory)][string]$GoRoot,[Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$env:GOMODCACHE=$ModuleCache
$taskText=[Text.StringBuilder]::new()
[void]$taskText.AppendLine('Third-party notices for DeepSeek Harness Desktop Android')
[void]$taskText.AppendLine('AndroidX components, JourneyApps ZXing Android Embedded and ZXing Core use Apache License 2.0. Copyright their respective contributors. The complete Apache license is included below with the native dependency notices.')
$taskCount=0
Push-Location (Join-Path $PSScriptRoot '..\tailnet')
try {
 $taskModules=& $GoExe list -m -f '{{.Path}}|{{.Version}}|{{.Dir}}' all
 if ($LASTEXITCODE -ne 0) { throw 'Cannot enumerate Go module notices' }
 foreach($taskLine in $taskModules) {
  $taskFields=$taskLine.Split('|',3)
  if ($taskFields.Length -ne 3 -or !$taskFields[2] -or !(Test-Path -LiteralPath $taskFields[2])) { continue }
  foreach($taskFile in Get-ChildItem -LiteralPath $taskFields[2] -File | Where-Object { $_.Name -match '^(LICENSE|LICENCE|COPYING|NOTICE|COPYRIGHT)([._-].*)?$' }) {
   [void]$taskText.AppendLine("`n--- $($taskFields[0]) $($taskFields[1]) / $($taskFile.Name) ---")
   [void]$taskText.AppendLine([IO.File]::ReadAllText($taskFile.FullName));$taskCount++
  }
 }
} finally { Pop-Location }
[void]$taskText.AppendLine("`n--- Go standard library ---")
[void]$taskText.AppendLine([IO.File]::ReadAllText((Join-Path $GoRoot 'LICENSE')))
foreach($taskFile in Get-ChildItem -LiteralPath (Join-Path $GoRoot 'src\vendor') -Recurse -File | Where-Object { $_.Name -match '^(LICENSE|NOTICE)([._-].*)?$' }) {
 [void]$taskText.AppendLine("`n--- Go vendor / $([IO.Path]::GetRelativePath($GoRoot,$taskFile.FullName)) ---")
 [void]$taskText.AppendLine([IO.File]::ReadAllText($taskFile.FullName))
}
if ($taskCount -lt 10 -or !$taskText.ToString().Contains('Apache License')) { throw 'Dependency license collection incomplete' }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $OutputDirectory 'THIRD_PARTY_NOTICES.txt'),$taskText.ToString(),[Text.UTF8Encoding]::new($false))
Write-Output "Collected $taskCount native module license and notice files"