param(
    [string]$dbPath = "C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\Pond Operations Management System\Legacy Access DB\Bab SGo (r41) 26.09.25.accdb"
)

$ErrorActionPreference = "Stop"

$supabaseUrl = "https://keappoukeagyzpoxkrru.supabase.co"
$supabaseKey = "sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s"

$headers = @{
    "apikey" = $supabaseKey
    "Authorization" = "Bearer $supabaseKey"
    "Content-Type" = "application/json; charset=utf-8"
    "Prefer" = "resolution=merge-duplicates"
}

Write-Output "=========================================================="
Write-Output "iSHARP STAFF MIGRATION ENGINE (GrowoutPondStaff -> Supabase)"
Write-Output "Source DB: $dbPath"
Write-Output "Target Cloud: $supabaseUrl"
Write-Output "Start Time: $(Get-Date)"
Write-Output "=========================================================="

if (-not (Test-Path $dbPath)) {
    throw "Database file not found: $dbPath"
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

function SafeString($val) {
    if ($val -eq $null -or $val -eq [DBNull]::Value) { return $null }
    $s = [string]$val
    $s = $s.Trim()
    if ($s.Length -eq 0) { return $null }
    return $s
}

function SafeInt($val) {
    if ($val -eq $null -or $val -eq [DBNull]::Value) { return $null }
    try {
        return [int]$val
    } catch {
        return $null
    }
}

function Post-BatchToSupabase([string]$endpoint, [array]$batch, [string]$conflictKey) {
    if ($batch.Count -eq 0) { return }
    $uri = "$supabaseUrl/rest/v1/$endpoint"
    if ($conflictKey) {
        $uri += "?on_conflict=$conflictKey"
    }
    $json = $batch | ConvertTo-Json -Depth 5
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $retryCount = 0
    while ($retryCount -lt 3) {
        try {
            $null = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $bodyBytes -TimeoutSec 60
            return
        } catch {
            $retryCount++
            $errDetails = $_.Exception.Message
            if ($_.ErrorDetails) {
                $errDetails = $_.ErrorDetails.Message
            } elseif ($_.Exception.Response) {
                try {
                    $stream = $_.Exception.Response.GetResponseStream()
                    $reader = New-Object System.IO.StreamReader($stream)
                    $errDetails = $reader.ReadToEnd()
                } catch {}
            }
            Write-Warning "Retry $retryCount for ${endpoint}: $errDetails"
            Start-Sleep -Seconds 2
        }
    }
    throw "Failed to upload batch to ${endpoint} after 3 retries."
}

$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT Pond, StaffNo, Position, StaffName, StartDate, EndDate, Remark, indexNo FROM [GrowoutPondStaff]"
$reader = $cmd.ExecuteReader()

$batchSize = 250
$batch = @()
$total = 0

while ($reader.Read()) {
    $rawPond = SafeString $reader["Pond"]
    $staffName = SafeString $reader["StaffName"]
    if (-not $staffName) { continue }

    $pLabel = $rawPond
    if ($rawPond -and $rawPond.Length -ge 7) {
        $pLabel = "$($rawPond.Substring(1,2)).$($rawPond.Substring(3,2)).$($rawPond.Substring(5,2))"
    }

    $obj = [ordered]@{
        index_no = SafeInt $reader["indexNo"]
        staff_no = SafeString $reader["StaffNo"]
        staff_name = $staffName
        staff_position = SafeString $reader["Position"]
        pond = $pLabel
        base_pond = $rawPond
        start_date = SafeDate $reader["StartDate"]
        end_date = SafeDate $reader["EndDate"]
        remark = SafeString $reader["Remark"]
        assigned_date = SafeDate $reader["StartDate"]
    }

    $batch += $obj
    $total++

    if ($batch.Count -ge $batchSize) {
        Post-BatchToSupabase "pond_staff" $batch "index_no"
        Write-Output "  -> Uploaded $total staff records..."
        $batch = @()
    }
}

if ($batch.Count -gt 0) {
    Post-BatchToSupabase "pond_staff" $batch "index_no"
    Write-Output "  -> Uploaded $total staff records total."
}

$reader.Close()
$conn.Close()

Write-Output "`n=========================================================="
Write-Output "STAFF MIGRATION COMPLETED SUCCESSFULLY!"
Write-Output "Total Staff Records Uploaded: $total"
Write-Output "=========================================================="
