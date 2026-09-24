$headers = @{
    'apikey' = 'sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s'
    'Authorization' = 'Bearer sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s'
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$url = "https://keappoukeagyzpoxkrru.supabase.co/rest/v1/stocking_records?pond_status=eq.CLOSE&modl=eq.01&select=pond_index,pond,modl,row_no,cycle_no,pond_status,pond_active,stck_date,date_close,aerator_1hp,aerator_2hp&limit=1000"
$res = Invoke-RestMethod -Uri $url -Headers $headers
$sw.Stop()
Write-Output "Fetched $($res.Count) Closed cycles for Module 01 in $($sw.ElapsedMilliseconds) ms!"
