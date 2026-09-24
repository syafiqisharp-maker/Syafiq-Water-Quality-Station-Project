$headers = @{
    'apikey' = 'sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s'
    'Authorization' = 'Bearer sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s'
}

# Find all records created on 2026-09-23 (the old seed rows)
$url = "https://keappoukeagyzpoxkrru.supabase.co/rest/v1/stocking_records?created_at=lt.2026-09-24T00:00:00&select=pond_index,pond,cycle_no,pond_status,created_at&limit=500"
$oldRows = Invoke-RestMethod -Uri $url -Headers $headers
Write-Output "Old seed rows from 2026-09-23 count: $($oldRows.Count)"

$singleDigits = $oldRows | Where-Object { $_.pond_index -match '\.[0-9]$' }
Write-Output "Old seed rows ending in single digit after dot: $($singleDigits.Count)"
$singleDigits | Select-Object -First 10 | Format-Table
