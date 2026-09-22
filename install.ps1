<#
.SYNOPSIS
    Install PARI-GP-ENGINE into the current Quarto project.

.DESCRIPTION
    Checks that Quarto (>= 1.9) and PARI/GP are available, then installs the
    extension with `quarto add`. The extension can also be installed directly,
    without cloning this repository:

        quarto add oeistools/PARI-GP-ENGINE

.PARAMETER Check
    Only report what is present and what is missing; install nothing.

.PARAMETER NoCheck
    Install without checking the prerequisites first.

.PARAMETER Gp
    Name or full path of the gp executable (default: gp).

.EXAMPLE
    ./install.ps1
.EXAMPLE
    ./install.ps1 -Check
#>
[CmdletBinding()]
param(
    [switch]$Check,
    [switch]$NoCheck,
    [string]$Gp = 'gp'
)

$Repo      = 'oeistools/PARI-GP-ENGINE'
$QuartoMin = [version]'1.9.0'
$script:Missing = 0

function Write-Ok   { param($m) Write-Host "  [OK] $m"   -ForegroundColor Green }
function Write-Bad  { param($m) Write-Host "  [--] $m"   -ForegroundColor Red; $script:Missing++ }
function Write-Warn { param($m) Write-Host "  [!!] $m"   -ForegroundColor Yellow }

function Test-Quarto {
    $exe = Get-Command quarto -ErrorAction SilentlyContinue
    if (-not $exe) {
        Write-Bad 'quarto not found - install it from https://quarto.org/docs/download/'
        return
    }
    $raw = (& quarto --version 2>$null | Select-Object -First 1).Trim()
    try { $v = [version]$raw } catch { $v = $null }
    if ($v -and $v -ge $QuartoMin) {
        Write-Ok "quarto $raw (engine extensions need >= $QuartoMin)"
    } else {
        Write-Bad "quarto $raw is too old - engine extensions need >= $QuartoMin"
    }
}

function Test-PariGp {
    $exe = Get-Command $Gp -ErrorAction SilentlyContinue
    if (-not $exe) {
        Write-Bad "$Gp not found - install PARI/GP from https://pari.math.u-bordeaux.fr/download.html"
        Write-Host '        Windows : download the self-installing binary, or use WSL'
        Write-Host '        conda   : conda install -c conda-forge pari'
        Write-Host ''
        Write-Host '        If gp is installed somewhere else, put this in your document:'
        Write-Host '            pari-gp:'
        Write-Host '              path: C:/Program Files/PARI/gp.exe'
        return
    }
    $raw = (& $Gp --version 2>&1 | Out-String)
    $ver = if ($raw -match 'Version\s+([0-9.]+)') { $Matches[1] } else { 'unknown' }
    Write-Ok "$Gp $ver at $($exe.Source)"

    $answer = ("print(6*7)`nquit`n" | & $Gp -q -f 2>&1 | Out-String).Trim()
    if ($answer -eq '42') {
        Write-Ok "$Gp evaluates expressions correctly"
    } else {
        Write-Bad "$Gp did not evaluate 6*7 as expected (got: $answer)"
    }
}

function Test-Extension {
    if ((Test-Path '_extensions/pari-gp/pari-gp.js') -or
        (Test-Path '_extensions/oeistools/pari-gp/pari-gp.js')) {
        Write-Ok 'the pari-gp engine is installed in this project'
    } else {
        Write-Warn 'the pari-gp engine is not installed in this project yet'
    }
}

Write-Host 'PARI-GP-ENGINE - checking prerequisites'
Write-Host ''
Test-Quarto
Test-PariGp
if ($Check) { Test-Extension }
Write-Host ''

if ($Check) {
    if ($script:Missing -eq 0) { Write-Host 'Everything needed is present.'; exit 0 }
    Write-Host "$($script:Missing) requirement(s) missing."; exit 1
}

if ($script:Missing -ne 0 -and -not $NoCheck) {
    Write-Host "Not installing: $($script:Missing) requirement(s) missing (use -NoCheck to override)."
    exit 1
}

Write-Host "Installing $Repo into $(Get-Location) ..."
& quarto add $Repo --no-prompt
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Bad 'quarto add failed'
    exit 1
}

Write-Host ''
Write-Ok 'installed'
Write-Host @'

Use it by setting the engine in a document's front matter:

    ---
    title: "My document"
    engine: pari-gp
    ---

    ```{gp}
    factor(2^100 - 1)
    ```

Then: quarto render my-document.qmd
'@
