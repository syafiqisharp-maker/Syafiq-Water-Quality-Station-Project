$url = "https://keappoukeagyzpoxkrru.supabase.co/rest/v1/stocking_records?aerator_2hp=gt.0&select=pond_index,cycle_no,pond,modl,row_no,aerator_1hp,aerator_2hp&limit=10"
$headers = @{
    "apikey" = "sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s"
    "Authorization" = "Bearer sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s"
}
$res = Invoke-RestMethod -Uri $url -Headers $headers
$res | ConvertTo-Json
