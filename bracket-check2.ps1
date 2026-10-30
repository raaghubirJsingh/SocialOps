$s = [System.IO.File]::ReadAllText('C:\SocialOps\apps\api\test\draft-from-intake.integration.spec.ts')
$chars = $s.ToCharArray()
$open = 0
$bad = 0
$lineNo = 1
$inStr = $false
$inBacktick = $false
$inLineComment = $false
$inBlockComment = $false
$i = 0
foreach ($c in $chars) {
  if ($inBlockComment) { if ($c -eq [char]42 -and $i + 1 -lt $chars.Count -and $chars[$i + 1] -eq [char]42) { $inBlockComment = $false; $i++ } }
  elseif ($inLineComment) { if ($c -eq [char]10) { $inLineComment = $false } }
  elseif ($inStr) { if ($c -eq "'") { $inStr = $false } }
  elseif ($inBacktick) { if ($c -eq [char]96) { $inBacktick = $false } }
  else {
    switch ($c) {
      "'" { $inStr = $true }
      '`' { $inBacktick = $true }
      '/' { if ($s[$i + 1] -eq '/') { $inLineComment = $true } }
      '*' { if ($s[$i + 1] -eq '/') { $inBlockComment = $true; $i++ } }
      '{' { $open++ }
      '}' { $open--; if ($open -lt 0) { Write-OUTPUT ('UNBALANCED ' + $open + ' at line ' + $lineNo) } $bad++ }
    }
  }
  if ($c -eq [char]10) { $lineNo++ }
  $i++
}
Write-OUTPUT ('final_open=' + $open)
Write-OUTPUT ('bad=' + $bad)
Write-OUTPUT ('file_lines=' + $chars.Count)
