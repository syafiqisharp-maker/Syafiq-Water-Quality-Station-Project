$headers = @{
    'apikey' = 'sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s'
    'Authorization' = 'Bearer sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s'
}

$url = "https://keappoukeagyzpoxkrru.supabase.co/rest/v1/stocking_records?pond_index=in.(2010101.40,2010101.4)&select=pond_index,pond,cycle_no,crop_no,pond_status,pond_active,stck_date,date_cycle,stck_total,created_at"
$res = Invoke-RestMethod -Uri $url -Headers $headers
$res | ConvertTo-Json -Depth 5
