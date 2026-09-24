$headers = @{
    'apikey' = 'sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s'
    'Authorization' = 'Bearer sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s'
}
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$results = @()
for ($i = 0; $i -lt 8; $i++) {
    $offset = $i * 1000
    $url = "https://keappoukeagyzpoxkrru.supabase.co/rest/v1/stocking_records?select=pond_index,pond,modl,row_no,cycle_no,pond_status,pond_active,stck_date,date_close,aerator_1hp,aerator_2hp&offset=$offset&limit=1000"
    $res = Invoke-RestMethod -Uri $url -Headers $headers
    $results += $res
    if ($res.Count -lt 1000) { break }
}
$sw.Stop()
Write-Host "Sequential fetch completed: $($results.Count) rows in $($sw.ElapsedMilliseconds) ms."
