$headers = @{
    'apikey' = 'sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s'
    'Authorization' = 'Bearer sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s'
}

$tables = @('biometrics_sampling', 'pond_stocking_batches', 'pond_harvest_daily', 'pond_harvest_sales', 'pond_issues', 'pond_notes', 'pond_aerator_inventory', 'water_quality_logs')

foreach ($t in $tables) {
    $url = "https://keappoukeagyzpoxkrru.supabase.co/rest/v1/$t?pond_index=eq.2010101.4&select=pond_index&limit=5"
    try {
        $res = Invoke-RestMethod -Uri $url -Headers $headers
        Write-Output "$t has row 2010101.4: $($res.Count)"
    } catch {
        Write-Output "$t query error: $($_.Exception.Message)"
    }
}
