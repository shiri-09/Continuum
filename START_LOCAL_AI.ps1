[CmdletBinding()]
param([ValidateRange(1,60)][int]$WaitSeconds=30, [switch]$SkipWarmup)
$ErrorActionPreference='Stop'
$continuumRuntime=Join-Path $PSScriptRoot '.runtime/llamacpp'
$continuumExecutable=Join-Path $continuumRuntime 'bin/llama-server.exe'
$continuumCandidates=@(
  @{File='Qwen3-1.7B-Q4_K_M.gguf';Bytes=1282439264;Hash='d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5';Port=8082;Alias='qwen3:1.7b';Context=4096;Log='server1.7'},
  @{File='Qwen3-0.6B-Q4_0.gguf';Bytes=428970080;Hash=$null;Port=8081;Alias='qwen3:0.6b';Context=2048;Log='server'}
)
function Test-ContinuumModel($continuumCandidate){
  try{
    $continuumBase="http://127.0.0.1:$($continuumCandidate.Port)"
    $continuumHealth=Invoke-RestMethod "$continuumBase/health" -TimeoutSec 2
    $continuumModels=Invoke-RestMethod "$continuumBase/v1/models" -TimeoutSec 2
    return ($continuumHealth.status -eq 'ok' -and @($continuumModels.data.id) -contains $continuumCandidate.Alias)
  }catch{return $false}
}
function Warm-ContinuumModel($continuumCandidate){
  if($SkipWarmup){return}
  try{
    $continuumWarmBody=@{model=$continuumCandidate.Alias;messages=@(@{role='user';content='Reply with hello.'});max_tokens=32;temperature=0;stream=$false;chat_template_kwargs=@{enable_thinking=$false}} | ConvertTo-Json -Depth 5
    $null=Invoke-RestMethod "http://127.0.0.1:$($continuumCandidate.Port)/v1/chat/completions" -Method Post -ContentType 'application/json' -Body $continuumWarmBody -TimeoutSec 20
    Write-Host 'Local model warm-up complete.'
  }catch{Write-Warning 'Local model is healthy, but warm-up did not finish. The first reply may take longer.'}
}
foreach($continuumCandidate in $continuumCandidates){
  if(Test-ContinuumModel $continuumCandidate){Write-Host "Local $($continuumCandidate.Alias) ready on loopback port $($continuumCandidate.Port).";return}
  $continuumModel=Join-Path $continuumRuntime $continuumCandidate.File
  if(-not(Test-Path -LiteralPath $continuumExecutable) -or -not(Test-Path -LiteralPath $continuumModel)){continue}
  if((Get-Item -LiteralPath $continuumModel).Length -ne $continuumCandidate.Bytes){Write-Warning "Skipping incomplete model $($continuumCandidate.File).";continue}
  if($continuumCandidate.Hash -and (Get-FileHash -LiteralPath $continuumModel -Algorithm SHA256).Hash -ne $continuumCandidate.Hash){Write-Warning "Skipping model with unexpected SHA256: $($continuumCandidate.File).";continue}
  $continuumPortBusy=$false;$continuumProbe=[System.Net.Sockets.TcpClient]::new()
  try{$continuumProbe.Connect('127.0.0.1',$continuumCandidate.Port);$continuumPortBusy=$true}catch{}finally{$continuumProbe.Dispose()}
  if($continuumPortBusy){Write-Warning "Port $($continuumCandidate.Port) is occupied but the expected model is not ready. Nothing was stopped.";continue}
  try{
    # Relative model filenames avoid spaces in argument parsing. Vulkan1 is this laptop's verified GPU.
    $continuumArguments="-m $($continuumCandidate.File) --host 127.0.0.1 --port $($continuumCandidate.Port) --alias $($continuumCandidate.Alias) --ctx-size $($continuumCandidate.Context) --parallel 1 -ngl 99 --device Vulkan1 --cors-origins localhost --no-cors-credentials"
    $continuumProcess=Start-Process -FilePath $continuumExecutable -ArgumentList $continuumArguments -WorkingDirectory $continuumRuntime -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $continuumRuntime "$($continuumCandidate.Log).out.log") -RedirectStandardError (Join-Path $continuumRuntime "$($continuumCandidate.Log).err.log")
    Set-Content -LiteralPath (Join-Path $continuumRuntime "$($continuumCandidate.Log).pid") -Value $continuumProcess.Id
    $continuumDeadline=[DateTime]::UtcNow.AddSeconds($WaitSeconds)
    do{
      if(Test-ContinuumModel $continuumCandidate){Write-Host "Local $($continuumCandidate.Alias) ready (PID $($continuumProcess.Id)).";Warm-ContinuumModel $continuumCandidate;return}
      if($continuumProcess.HasExited){break};Start-Sleep -Milliseconds 300
    }while([DateTime]::UtcNow -lt $continuumDeadline)
    Write-Warning "$($continuumCandidate.Alias) is not ready yet; check its runtime log. Trying an available fallback."
  }catch{Write-Warning "Optional model startup failed: $($_.Exception.Message)"}
}
Write-Warning 'Optional local AI is unavailable. Core communication remains available. No download or installation was attempted.'
