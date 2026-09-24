$headers = @{
    'apikey' = 'sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s'
    'Authorization' = 'Bearer sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s'
}
$allData = @()
for ($offset=0; $offset -lt 8500; $offset += 1000) {
    $res = Invoke-RestMethod -Uri ("https://keappoukeagyzpoxkrru.supabase.co/rest/v1/stocking_records?select=pond_status,pond_active&offset=$offset&limit=1000") -Headers $headers
    $allData += $res
    if ($res.Count -lt 1000) { break }
}
Write-Host "Total rows scanned: $($allData.Count)"
$statuses = $allData | ForEach-Object { $_.pond_status } | Group-Object | Select-Object Name, Count
$actives = $allData | ForEach-Object { $_.pond_active } | Group-Object | Select-Object Name, Count
Write-Host "`n--- POND STATUS DISTRIBUTION ---"
$statuses | Format-Table -AutoSize | Out-String | Write-Host
Write-Host "--- POND ACTIVE DISTRIBUTION ---"
$actives | Format-Table -AutoSize | Out-String | Write-Host
