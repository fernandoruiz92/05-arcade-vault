# PostToolUse hook: formats and lints files created/edited by Write or Edit.
# Reads the hook event JSON from stdin, and if the touched file is a
# React/TS/JS or Markdown file, runs Prettier (--write) and, for code files,
# ESLint (--fix). If ESLint still reports errors it can't auto-fix, the hook
# emits {"decision":"block","reason":"..."} so Claude Code surfaces them back
# to Claude in the same turn.

[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$rawInput = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($rawInput)) {
    exit 0
}

try {
    $event = $rawInput | ConvertFrom-Json
} catch {
    exit 0
}

$filePath = $event.tool_input.file_path
if ([string]::IsNullOrWhiteSpace($filePath)) {
    exit 0
}

if (-not (Test-Path -LiteralPath $filePath)) {
    exit 0
}

$ext = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
$targetExts = @('.ts', '.tsx', '.js', '.jsx', '.md')
if ($targetExts -notcontains $ext) {
    exit 0
}

$projectDir = $env:CLAUDE_PROJECT_DIR
if ([string]::IsNullOrWhiteSpace($projectDir)) {
    $projectDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

$prettierBin = Join-Path $projectDir 'node_modules\.bin\prettier.cmd'
$eslintBin = Join-Path $projectDir 'node_modules\.bin\eslint.cmd'

if (Test-Path -LiteralPath $prettierBin) {
    try {
        & $prettierBin --write $filePath | Out-Null
    } catch {
        # Prettier can't format invalid syntax; ESLint below will still
        # surface the underlying error, so ignore failures here.
    }
}

if ($ext -ne '.md' -and (Test-Path -LiteralPath $eslintBin)) {
    $eslintOutput = & $eslintBin --fix $filePath
    $eslintExit = $LASTEXITCODE

    if ($eslintExit -ne 0) {
        $reasonText = "ESLint encontro errores en '$filePath' que no pudo corregir automaticamente con --fix:`n`n" + ($eslintOutput -join "`n")
        $payload = @{ decision = 'block'; reason = $reasonText } | ConvertTo-Json -Compress
        Write-Output $payload
        exit 0
    }
}

exit 0
