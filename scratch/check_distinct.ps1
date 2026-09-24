$headers = @{
    'apikey' = 'sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s'
    'Authorization' = 'Bearer sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s'
}
$res = Invoke-RestMethod -Uri 'https://keappoukeagyzpoxkrru.supabase.co/rest/v1/stocking_records?select=pond_status,pond_active&limit=1000' -Headers $headers
$statuses = $res | ForEach-Object { $_.pond_status } | Select-Object -Unique
$actives = $res | ForEach-Object { $_.pond_active } | Select-Object -Unique
Write-Host "Statuses: $($statuses -join ', ')"
Write-Host "Actives: $($actives -join ', ')"
