$headers = @{
    'apikey' = 'sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s'
    'Authorization' = 'Bearer sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s'
}

$url = "https://keappoukeagyzpoxkrru.supabase.co/rest/v1/stocking_records?select=pond_index,pond_status,pond_active&limit=8500"
$res = Invoke-RestMethod -Uri $url -Headers $headers
Write-Output "Total rows returned by Supabase PostgREST with limit=8500: $($res.Count)"

$statusGroup = $res | Group-Object pond_status
foreach ($g in $statusGroup) {
    Write-Output "Status $($g.Name): $($g.Count)"
}
