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
Write-Output "iSHARP STAFF MASTER DIRECTORY POPULATION (121 Unique Staff)"
Write-Output "Source DB: $dbPath"
Write-Output "Target Cloud: $supabaseUrl"
Write-Output "=========================================================="

if (-not (Test-Path $dbPath)) {
    throw "Database file not found: $dbPath"
}

$connStr = "Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$dbPath;Persist Security Info=False;"
$conn = New-Object System.Data.OleDb.OleDbConnection($connStr)
$conn.Open()

$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT StaffNo, StaffName, Position FROM [GrowoutPondStaff] WHERE StaffNo IS NOT NULL"
$reader = $cmd.ExecuteReader()

$staffMap = [ordered]@{}

while ($reader.Read()) {
    $rawNo = [string]$reader["StaffNo"]
    $rawName = [string]$reader["StaffName"]
    $rawPos = [string]$reader["Position"]

    if ([string]::IsNullOrWhiteSpace($rawNo) -or [string]::IsNullOrWhiteSpace($rawName)) {
        continue
    }

    $staffNo = $rawNo.Trim()
    # Normalize double spaces
    $staffName = ($rawName -replace '\s+', ' ').Trim()
    $position = if ($rawPos) { ($rawPos -replace '\s+', ' ').Trim() } else { "Farm Operator" }

    if (-not $staffMap.Contains($staffNo)) {
        $staffMap[$staffNo] = [ordered]@{
            staff_no = $staffNo
            staff_name = $staffName
            staff_position = $position
            is_active = $true
        }
    }
}

$reader.Close()
$conn.Close()

Write-Output "Extracted $($staffMap.Count) unique staff members."

$batch = @($staffMap.Values)
$uri = "$supabaseUrl/rest/v1/pond_staff?on_conflict=staff_no"
$json = $batch | ConvertTo-Json -Depth 5
$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($json)

$null = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $bodyBytes -TimeoutSec 60

Write-Output "Successfully uploaded $($batch.Count) staff records into public.pond_staff!"
