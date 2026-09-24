$headers = @{
    'apikey' = 'sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s'
    'Authorization' = 'Bearer sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s'
}

$url = "https://keappoukeagyzpoxkrru.supabase.co/rest/v1/stocking_records?select=pond_index,modl,cycle_no,pond_status,pond_active,stck_date,date_cycle&limit=1000"
$res = Invoke-RestMethod -Uri $url -Headers $headers

$dates = $res | Where-Object { $_.date_cycle } | ForEach-Object { [datetime]$_.date_cycle }
$minDate = ($dates | Measure-Object -Minimum).Minimum
$maxDate = ($dates | Measure-Object -Maximum).Maximum

Write-Output "Date range in first 1000 rows: $minDate to $maxDate"
$modGroup = $res | Group-Object modl
foreach ($m in $modGroup) {
    Write-Output "Module $($m.Name): $($m.Count) cycles"
}
