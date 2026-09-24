$dbPath = "C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\Pond Operations Management System\Legacy Access DB\Bab SGo (r41) 26.09.18.accdb"
$supabaseUrl = "https://keappoukeagyzpoxkrru.supabase.co"
$supabaseKey = "sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s"

$headers = @{
    "apikey" = $supabaseKey
    "Authorization" = "Bearer $supabaseKey"
    "Content-Type" = "application/json; charset=utf-8"
    "Prefer" = "resolution=merge-duplicates"
}

$connStr = "Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$dbPath;Persist Security Info=False;"
$conn = New-Object System.Data.OleDb.OleDbConnection($connStr)
$conn.Open()

Write-Output "Extracting aerator data from GrowoutPondMaster..."
$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT PondIndex, [I HP], [2 HP] FROM [GrowoutPondMaster] WHERE [I HP] IS NOT NULL OR [2 HP] IS NOT NULL"
$reader = $cmd.ExecuteReader()

$batchStocking = @()
$batchAerator = @()
$total = 0

while ($reader.Read()) {
    $pIdx = [string]$reader["PondIndex"]
    $pIdx = $pIdx.Trim()
    if (-not $pIdx) { continue }

    $u1 = if ($reader["I HP"] -ne [DBNull]::Value) { [int]$reader["I HP"] } else { 0 }
    $u2 = if ($reader["2 HP"] -ne [DBNull]::Value) { [int]$reader["2 HP"] } else { 0 }

    $batchStocking += [ordered]@{
        pond_index = $pIdx
        aerator_1hp = $u1
        aerator_2hp = $u2
    }

    if ($u1 -gt 0) {
        $batchAerator += [ordered]@{
            pond_index = $pIdx
            aerator_model = "1.0 HP Paddlewheel"
            hp = 1.0
            total_units = $u1
            active_units = $u1
        }
    }
    if ($u2 -gt 0) {
        $batchAerator += [ordered]@{
            pond_index = $pIdx
            aerator_model = "2.0 HP Paddlewheel"
            hp = 2.0
            total_units = $u2
            active_units = $u2
        }
    }

    $total++

    if ($batchStocking.Count -ge 500) {
        $json = $batchStocking | ConvertTo-Json -Depth 5
        $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
        Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/stocking_records?on_conflict=pond_index" -Method Post -Headers $headers -Body $bodyBytes
        Write-Output "  -> Updated aerators for $total cycles in stocking_records..."
        $batchStocking = @()
    }

    if ($batchAerator.Count -ge 500) {
        $json = $batchAerator | ConvertTo-Json -Depth 5
        $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
        Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/pond_aerator_inventory" -Method Post -Headers $headers -Body $bodyBytes
        $batchAerator = @()
    }
}

if ($batchStocking.Count -gt 0) {
    $json = $batchStocking | ConvertTo-Json -Depth 5
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/stocking_records?on_conflict=pond_index" -Method Post -Headers $headers -Body $bodyBytes
}

if ($batchAerator.Count -gt 0) {
    $json = $batchAerator | ConvertTo-Json -Depth 5
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/pond_aerator_inventory" -Method Post -Headers $headers -Body $bodyBytes
}

$reader.Close()
$conn.Close()

Write-Output "Successfully synced aerators for $total cycles!"
