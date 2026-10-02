$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path -LiteralPath '.env')) { npm run setup; if ($LASTEXITCODE -ne 0) { throw 'Falha na configuracao.' } }
if (-not (Test-Path -LiteralPath 'apps/web/dist/index.html')) { npm run build; if ($LASTEXITCODE -ne 0) { throw 'Falha na compilacao.' } }
Write-Host 'Painel: http://127.0.0.1:3000. Mantenha esta janela aberta para os backups diarios.'
npm start
