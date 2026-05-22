$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$outDir = Join-Path $root 'out'
$distDir = Join-Path $root 'dist'
$zipPath = Join-Path $distDir 'hidden-trap-shogi-itch.zip'
$indexPath = Join-Path $outDir 'index.html'

if (!(Test-Path -LiteralPath $indexPath)) {
  throw 'out/index.html was not found. Run npm run build before npm run itch:zip.'
}

New-Item -ItemType Directory -Force -Path $distDir | Out-Null

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

$items = Get-ChildItem -LiteralPath $outDir -Force | Where-Object { $_.Name -notlike '*.zip' }

if ($items.Count -eq 0) {
  throw 'out is empty. Run npm run build before npm run itch:zip.'
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  $outRoot = (Resolve-Path -LiteralPath $outDir).Path.TrimEnd('\', '/') + '\'
  $files = Get-ChildItem -LiteralPath $outDir -Recurse -File -Force |
    Where-Object { $_.Extension -ne '.zip' }

  $pathMap = @{}
  foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($outRoot.Length).Replace('\', '/')
    if (($relativePath -split '/') -contains '..') {
      throw "Unsafe relative path in export output: $relativePath"
    }
    $pathMap[$relativePath] = $relativePath
  }

  foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($outRoot.Length).Replace('\', '/')
    $zipPathForEntry = $pathMap[$relativePath]
    $isTextFile = @('.html', '.txt', '.js', '.json', '.css', '.svg').Contains($file.Extension.ToLowerInvariant())

    if ($isTextFile) {
      $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
      foreach ($key in $pathMap.Keys) {
        if ($key -ne $pathMap[$key]) {
          $content = $content.Replace($key, $pathMap[$key])
        }
      }

      $entry = $zip.CreateEntry($zipPathForEntry)
      $writer = New-Object System.IO.StreamWriter($entry.Open(), (New-Object System.Text.UTF8Encoding($false)))
      try {
        $writer.Write($content)
      }
      finally {
        $writer.Dispose()
      }
    }
    else {
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $zipPathForEntry) | Out-Null
    }
  }
}
finally {
  $zip.Dispose()
}

Write-Host "Created $zipPath"
Write-Host 'Zip root contains the itch.io HTML build files directly: index.html, _next/, mascots/, and other public assets.'
