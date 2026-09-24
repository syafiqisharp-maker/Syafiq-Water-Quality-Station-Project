$headers = @{
    "apikey" = "sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s"
    "Authorization" = "Bearer sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s"
    "Content-Type" = "application/json"
    "Prefer" = "resolution=merge-duplicates"
}

$body = @"
[{
    "pond_index":  "2010103.37",
    "pond":  "01.01.03",
    "farm":  "SETiU",
    "modl":  "01",
    "row_no":  "01",
    "crop_no":  "33",
    "cycle_no":  "37",
    "pond_status":  "CLOSE",
    "pond_active":  "iN ACTiVE",
    "area":  0.5,
    "pond_type":  "FULL LiNiNG",
    "pond_usage":  "GROWOUT",
    "culture_status":  "STANDARD",
    "disease_status":  "LOW SR",
    "final_status":  "FORCED HARVEST",
    "idle_days":  0,
    "idle_status":  null,
    "water_type":  "SEA WATER",
    "initiative":  "ENHANCE IMMUN PL ,EXCELVITA c",
    "date_cycle":  "2024-06-07",
    "date_cleaning":  "2024-07-01",
    "date_repair":  "2024-07-03",
    "date_filling":  "2024-07-09",
    "date_culture":  "2024-07-10",
    "date_baby_box":  "2024-07-23",
    "date_qaqc":  "2024-07-23",
    "date_ready":  "2024-07-23",
    "date_close":  "2024-10-16"
}]
"@

try {
    $res = Invoke-RestMethod -Uri "https://keappoukeagyzpoxkrru.supabase.co/rest/v1/stocking_records?on_conflict=pond_index" -Method Post -Headers $headers -Body $body
    Write-Output "Invoke-RestMethod SUCCESS!"
} catch {
    Write-Output "Status code: $($_.Exception.Response.StatusCode.value__)"
    $stream = $_.Exception.Response.GetResponseStream()
    $stream.Position = 0
    $sr = New-Object System.IO.StreamReader($stream)
    Write-Output "Error: $($sr.ReadToEnd())"
}
