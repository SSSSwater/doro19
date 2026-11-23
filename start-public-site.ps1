$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

npm run build
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

npm run preview:tunnel
exit $LASTEXITCODE
