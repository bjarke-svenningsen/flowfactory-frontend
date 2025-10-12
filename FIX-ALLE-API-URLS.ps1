# FIX-ALLE-API-URLS.ps1
# Erstatter alle Railway URLs med localhost:4000

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FIX ALLE API URLS TIL LOCALHOST" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$railwayUrl = "https://flowfactory-backend-production.up.railway.app"
$localhostUrl = "http://localhost:4000"

$jsFiles = Get-ChildItem -Path "js" -Filter "*.js" -Recurse

$totalReplacements = 0

foreach ($file in $jsFiles) {
    $content = Get-Content -Path $file.FullName -Raw
    
    if ($content -match [regex]::Escape($railwayUrl)) {
        $newContent = $content -replace [regex]::Escape($railwayUrl), $localhostUrl
        Set-Content -Path $file.FullName -Value $newContent -NoNewline
        
        $replacements = ([regex]::Matches($content, [regex]::Escape($railwayUrl))).Count
        $totalReplacements += $replacements
        
        Write-Host "✓ $($file.Name): $replacements erstattninger" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FÆRDIG!" -ForegroundColor Cyan  
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Total erstattninger: $totalReplacements" -ForegroundColor Green
Write-Host "Alle API URLs peger nu på: $localhostUrl" -ForegroundColor Green
Write-Host ""
Write-Host "Næste skridt:" -ForegroundColor Yellow
Write-Host "  1. Kør CLEAR-CACHE-AND-START.bat" -ForegroundColor Yellow
Write-Host "  2. Log ind og se dit data!" -ForegroundColor Yellow
Write-Host ""

Read-Host "Tryk Enter for at afslutte"
