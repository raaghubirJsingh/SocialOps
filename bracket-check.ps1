$s = [System.IO.File]::ReadAllText('C:\SocialOps\apps\api\test\draft-from-intake.integration.spec.ts')
$chars = $s.ToCharArray()
$open = 0
$bad = 0
$lineNo = 1
$inStr = $false
$inBacktick = $false
$inComment = $false
$i = 0
foreach ($c in $chars) {
  if ($inComment) { if ($c -eq [char]10) { $inComment = $false } }
  elseif ($inStr) { if ($c -eq "'") { $inStr = $false } }
  elseif ($inBacktick) { if ($c -eq [char]96) { $inBacktick = $false } }
  else {
    switch ($c) {
      "'" { $inStr = $true }
      '`' { $inBacktick = $true }
      '{' { $open++ }
      '}' { $open--; if ($open -lt 0) { Write-OUTPUT ('UNBALANCED at line ' + $lineNo) } $bad++ }
      '/' { if ($s[$i + 1] -eq '/') { $inComment = $true } }
    }
  }
  if ($c -eq [char]10) { $lineNo++ }
  $i++
}
Write-OUTPUT ('final_open=' + $open)
Write-OUTPUT ('bad=' + $bad)
Write-OUTPUT ('file_lines=' + $chars.Count)
