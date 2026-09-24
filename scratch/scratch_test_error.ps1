$dbPath = "C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\Pond Operations Management System\Legacy Access DB\Bab SGo (r41) 26.09.18.accdb"

$headers = @{
    "apikey" = "sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s"
    "Authorization" = "Bearer sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s"
    "Content-Type" = "application/json"
    "Prefer" = "resolution=merge-duplicates"
}

$connStr = "Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$dbPath;Persist Security Info=False;"
$conn = New-Object System.Data.OleDb.OleDbConnection($connStr)
$conn.Open()

function SafeDate($val) {
    if ($val -eq $null -or $val -eq [DBNull]::Value) { return $null }
    try {
        $dt = [datetime]$val
        if ($dt.Year -lt 1990 -or $dt.Year -gt 2099) { return $null }
        return $dt.ToString("yyyy-MM-dd")
    } catch {
        return $null
    }
}
function SafeDecimal($val) {
    if ($val -eq $null -or $val -eq [DBNull]::Value) { return $null }
    try { return [decimal]$val } catch { return $null }
}
function SafeString($val) {
    if ($val -eq $null -or $val -eq [DBNull]::Value) { return $null }
    $s = [string]$val
    $s = $s.Trim()
    if ($s.Length -eq 0) { return $null }
    return $s
}

$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT TOP 200 PondIndex, pond, modl, row, cropno, cycleno, [pond status], [pond active], [date cycle], [date ready], [culture status], [disease status], area, [pond type], [pond usage], [I HP], [2 HP], [date cleaning], [DateRepair], [date filling], [date culture], [DateBabyBox], [DateQaqc], [date close], [final status], IdleStatus, [water type], Initiative FROM [GrowoutPondMaster]"
$reader = $cmd.ExecuteReader()

$batch = @()
while ($reader.Read()) {
    $rawIdx = SafeString $reader["PondIndex"]
    if (-not $rawIdx) { continue }
    $pIdx = $rawIdx

    $pLabel = if ($pIdx.Length -ge 7) { "$($pIdx.Substring(1,2)).$($pIdx.Substring(3,2)).$($pIdx.Substring(5,2))" } else { SafeString $reader["pond"] }

    $obj = [ordered]@{
        pond_index = $pIdx
        pond = $pLabel
        farm = "SETiU"
        modl = SafeString $reader["modl"]
        row_no = SafeString $reader["row"]
        crop_no = SafeString $reader["cropno"]
        cycle_no = SafeString $reader["cycleno"]
        pond_status = $(if ($reader["pond status"] -ne [DBNull]::Value) { SafeString $reader["pond status"] } else { "iDLE" })
        pond_active = $(if ($reader["pond active"] -ne [DBNull]::Value) { SafeString $reader["pond active"] } else { "ACTiVE" })
        area = $(if ($reader["area"] -ne [DBNull]::Value) { SafeDecimal $reader["area"] } else { 0.50 })
        pond_type = $(if ($reader["pond type"] -ne [DBNull]::Value) { SafeString $reader["pond type"] } else { "FULL LiNiNG" })
        pond_usage = $(if ($reader["pond usage"] -ne [DBNull]::Value) { SafeString $reader["pond usage"] } else { "GROWOUT" })
        culture_status = $(if ($reader["culture status"] -ne [DBNull]::Value) { SafeString $reader["culture status"] } else { "STANDARD" })
        disease_status = $(if ($reader["disease status"] -ne [DBNull]::Value) { SafeString $reader["disease status"] } else { "NO ISSUES" })
        final_status = SafeString $reader["final status"]
        idle_days = 0
        idle_status = SafeString $reader["IdleStatus"]
        water_type = $(if ($reader["water type"] -ne [DBNull]::Value) { SafeString $reader["water type"] } else { "SEA WATER" })
        initiative = SafeString $reader["Initiative"]
        date_cycle = SafeDate $reader["date cycle"]
        date_cleaning = SafeDate $reader["date cleaning"]
        date_repair = SafeDate $reader["DateRepair"]
        date_filling = SafeDate $reader["date filling"]
        date_culture = SafeDate $reader["date culture"]
        date_baby_box = SafeDate $reader["DateBabyBox"]
        date_qaqc = SafeDate $reader["DateQaqc"]
        date_ready = SafeDate $reader["date ready"]
        date_close = SafeDate $reader["date close"]
    }
    $batch += $obj
}
$conn.Close()

$json = $batch | ConvertTo-Json -Depth 5
Write-Output "Sending batch of $($batch.Count) rows..."
try {
    $res = Invoke-RestMethod -Uri "https://keappoukeagyzpoxkrru.supabase.co/rest/v1/stocking_records?on_conflict=pond_index" -Method Post -Headers $headers -Body $json
    Write-Output "SUCCESS!"
} catch [System.Net.WebException] {
    Write-Output "CAUGHT WebException!"
    $res = $_.Exception.Response
    if ($res) {
        Write-Output "Status: $($res.StatusCode) - $($res.StatusDescription)"
        $stream = $res.GetResponseStream()
        if ($stream) {
            $reader = New-Object System.IO.StreamReader($stream)
            $body = $reader.ReadToEnd()
            Write-Output "Server Response Body: '$body'"
        }
    } else {
        Write-Output "No response object."
    }
} catch {
    Write-Output "Other Exception: $($_.Exception.Message)"
}
