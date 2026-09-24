param(
    [string]$dbPath = "C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\Pond Operations Management System\Legacy Access DB\Bab SGo (r41) 26.09.18.accdb"
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
Write-Output "iSHARP ENTERPRISE MIGRATION ENGINE (180MB -> Supabase Cloud)"
Write-Output "Source DB: $dbPath"
Write-Output "Target Cloud: $supabaseUrl"
Write-Output "Start Time: $(Get-Date)"
Write-Output "=========================================================="

$connStr = "Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$dbPath;Persist Security Info=False;"
$conn = New-Object System.Data.OleDb.OleDbConnection($connStr)
$conn.Open()

# Type Conversion Helpers
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
    try {
        return [decimal]$val
    } catch {
        return $null
    }
}

function SafeInt($val) {
    if ($val -eq $null -or $val -eq [DBNull]::Value) { return $null }
    try {
        return [int]$val
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

# Batch Post Function
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
            $null = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $bodyBytes -TimeoutSec 120
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

# Cache all valid master pond indices for referential integrity
$validMasterPondIndices = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

# -------------------------------------------------------------
# STAGE 1: GrowoutPondMaster (7,923 Cycles) -> stocking_records
# -------------------------------------------------------------
Write-Output "`n[STAGE 1/7] Migrating GrowoutPondMaster (All Culture Cycles)..."
$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT PondIndex, pond, modl, row, cropno, cycleno, [pond status], [pond active], [date cycle], [date ready], [culture status], [disease status], area, [pond type], [pond usage], [I HP], [2 HP], [date cleaning], [DateRepair], [date filling], [date culture], [DateBabyBox], [DateQaqc], [date close], [final status], IdleStatus, [water type], Initiative FROM [GrowoutPondMaster]"
$reader = $cmd.ExecuteReader()

$batchSize = 500
$batch = @()
$totalMaster = 0

while ($reader.Read()) {
    $rawIdx = SafeString $reader["PondIndex"]
    if (-not $rawIdx) { continue }
    $pIdx = $rawIdx
    $validMasterPondIndices.Add($pIdx) | Out-Null

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
    $totalMaster++

    if ($batch.Count -ge $batchSize) {
        Post-BatchToSupabase "stocking_records" $batch "pond_index"
        Write-Output "  -> Processed $totalMaster cycles..."
        $batch = @()
    }
}
if ($batch.Count -gt 0) {
    Post-BatchToSupabase "stocking_records" $batch "pond_index"
    Write-Output "  -> Processed $totalMaster cycles total."
}
$reader.Close()

# -------------------------------------------------------------
# STAGE 2: GrowoutPondStocking (8,335 Batches) -> pond_stocking_batches
# -------------------------------------------------------------
Write-Output "`n[STAGE 2/7] Migrating GrowoutPondStocking (Stocking Batches)..."
$cmd.CommandText = "SELECT PondIndex, stckdate, stcksource, stckspcs, stckpcs, stcktype, stckallow, stcktotal, stcktank, stcksize, stckplstts, BSLine, indexNo FROM [GrowoutPondStocking]"
$reader = $cmd.ExecuteReader()

$batch = @()
$totalStocking = 0

while ($reader.Read()) {
    $pIdx = SafeString $reader["PondIndex"]
    if (-not $pIdx -or -not $validMasterPondIndices.Contains($pIdx)) { continue }

    $obj = [ordered]@{
        pond_index = $pIdx
        index_no = SafeInt $reader["indexNo"]
        stck_date = SafeDate $reader["stckdate"]
        stck_source = SafeString $reader["stcksource"]
        stck_species = $(if ($reader["stckspcs"] -ne [DBNull]::Value) { SafeString $reader["stckspcs"] } else { "P. VANNAMEi" })
        stck_pcs = SafeDecimal $reader["stckpcs"]
        stck_type = $(if ($reader["stcktype"] -ne [DBNull]::Value) { SafeString $reader["stcktype"] } else { "SPT" })
        stck_allow = SafeDecimal $reader["stckallow"]
        stck_total = SafeDecimal $reader["stcktotal"]
        stck_tank = SafeString $reader["stcktank"]
        stck_size = SafeDecimal $reader["stcksize"]
        stck_plstts = $(if ($reader["stckplstts"] -ne [DBNull]::Value) { SafeString $reader["stckplstts"] } else { "1. NPL" })
        bs_line = SafeString $reader["BSLine"]
    }
    $batch += $obj
    $totalStocking++

    if ($batch.Count -ge $batchSize) {
        Post-BatchToSupabase "pond_stocking_batches" $batch "index_no"
        Write-Output "  -> Processed $totalStocking stocking batches..."
        $batch = @()
    }
}
if ($batch.Count -gt 0) {
    Post-BatchToSupabase "pond_stocking_batches" $batch "index_no"
    Write-Output "  -> Processed $totalStocking stocking batches total."
}
$reader.Close()

# -------------------------------------------------------------
# STAGE 3: GrowoutPondHarvestDaily (9,555 Rows) -> pond_harvest_daily
# -------------------------------------------------------------
Write-Output "`n[STAGE 3/7] Migrating GrowoutPondHarvestDaily (Harvest Runs)..."
$cmd.CommandText = "SELECT PondIndex, harvdate, harvstts, harvwgt, harvabw, harvRev, harvmtd, indexNo FROM [GrowoutPondHarvestDaily]"
$reader = $cmd.ExecuteReader()

$batchSize = 1000
$batch = @()
$totalHarvest = 0

while ($reader.Read()) {
    $pIdx = SafeString $reader["PondIndex"]
    if (-not $pIdx -or -not $validMasterPondIndices.Contains($pIdx)) { continue }

    $obj = [ordered]@{
        pond_index = $pIdx
        index_no = SafeInt $reader["indexNo"]
        harv_date = $(if ($reader["harvdate"] -ne [DBNull]::Value) { SafeDate $reader["harvdate"] } else { "2026-01-01" })
        harv_status = $(if ($reader["harvstts"] -ne [DBNull]::Value) { SafeString $reader["harvstts"] } else { "TERMINATION" })
        harv_weight = $(if ($reader["harvwgt"] -ne [DBNull]::Value) { SafeDecimal $reader["harvwgt"] } else { 0.0 })
        harv_abw = $(if ($reader["harvabw"] -ne [DBNull]::Value) { SafeDecimal $reader["harvabw"] } else { 0.0 })
        harv_revenue = $(if ($reader["harvRev"] -ne [DBNull]::Value) { SafeDecimal $reader["harvRev"] } else { 0.0 })
        harv_method = $(if ($reader["harvmtd"] -ne [DBNull]::Value) { SafeString $reader["harvmtd"] } else { "M" })
    }
    $batch += $obj
    $totalHarvest++

    if ($batch.Count -ge $batchSize) {
        Post-BatchToSupabase "pond_harvest_daily" $batch "index_no"
        Write-Output "  -> Processed $totalHarvest harvest rows..."
        $batch = @()
    }
}
if ($batch.Count -gt 0) {
    Post-BatchToSupabase "pond_harvest_daily" $batch "index_no"
    Write-Output "  -> Processed $totalHarvest harvest rows total."
}
$reader.Close()

# -------------------------------------------------------------
# STAGE 4: GrowoutPondIssues (14,385 Rows) -> pond_issues
# -------------------------------------------------------------
Write-Output "`n[STAGE 4/7] Migrating GrowoutPondIssues (Pathology & Disease Logs)..."
$cmd.CommandText = "SELECT PondIndex, issuedate, issueCat, issuestts, issuetest, issueflag, issueGrade, issueNote, indexNo FROM [GrowoutPondIssues]"
$reader = $cmd.ExecuteReader()

$batch = @()
$totalIssues = 0

while ($reader.Read()) {
    $pIdx = SafeString $reader["PondIndex"]
    if (-not $pIdx -or -not $validMasterPondIndices.Contains($pIdx)) { continue }

    $obj = [ordered]@{
        pond_index = $pIdx
        index_no = SafeInt $reader["indexNo"]
        issue_date = $(if ($reader["issuedate"] -ne [DBNull]::Value) { SafeDate $reader["issuedate"] } else { "2026-01-01" })
        issue_category = $(if ($reader["issueCat"] -ne [DBNull]::Value) { SafeString $reader["issueCat"] } else { "DISEASE" })
        issue_status = $(if ($reader["issuestts"] -ne [DBNull]::Value) { SafeString $reader["issuestts"] } else { "EHP" })
        issue_test = $(if ($reader["issuetest"] -ne [DBNull]::Value) { SafeString $reader["issuetest"] } else { "MICROSCOPY" })
        issue_flag = $(if ($reader["issueflag"] -ne [DBNull]::Value) { SafeString $reader["issueflag"] } else { "GREEN" })
        issue_grade = $(if ($reader["issueGrade"] -ne [DBNull]::Value) { SafeString $reader["issueGrade"] } else { "G0" })
        issue_note = $(if ($reader["issueNote"] -ne [DBNull]::Value) { SafeString $reader["issueNote"] } else { "NEGATIVE" })
    }
    $batch += $obj
    $totalIssues++

    if ($batch.Count -ge $batchSize) {
        Post-BatchToSupabase "pond_issues" $batch "index_no"
        Write-Output "  -> Processed $totalIssues issue rows..."
        $batch = @()
    }
}
if ($batch.Count -gt 0) {
    Post-BatchToSupabase "pond_issues" $batch "index_no"
    Write-Output "  -> Processed $totalIssues issue rows total."
}
$reader.Close()

# -------------------------------------------------------------
# STAGE 5: GrowoutPondHarvestSales (33,383 Rows) -> pond_harvest_sales
# -------------------------------------------------------------
Write-Output "`n[STAGE 5/7] Migrating GrowoutPondHarvestSales (Commercial Buyer Grading & Sales)..."
$cmd.CommandText = "SELECT indexNo, HvtPondIndx, HvtDate, HvtABW, GoodWGT, GoodPRC, [2ndGradeWGT], [2ndGradePRC], SmallWGT, BelowWGT, RubbishwGT, RawWGT, HvtSLS, HvtBuyer FROM [GrowoutPondHarvestSales]"
$reader = $cmd.ExecuteReader()

$batch = @()
$totalSales = 0

while ($reader.Read()) {
    $pIdx = SafeString $reader["HvtPondIndx"]
    if (-not $pIdx -or -not $validMasterPondIndices.Contains($pIdx)) { continue }

    $obj = [ordered]@{
        pond_index = $pIdx
        index_no = SafeInt $reader["indexNo"]
        hvt_date = SafeDate $reader["HvtDate"]
        hvt_buyer = SafeString $reader["HvtBuyer"]
        hvt_abw = SafeDecimal $reader["HvtABW"]
        good_wgt = SafeDecimal $reader["GoodWGT"]
        good_prc = SafeDecimal $reader["GoodPRC"]
        second_grade_wgt = SafeDecimal $reader["2ndGradeWGT"]
        second_grade_prc = SafeDecimal $reader["2ndGradePRC"]
        small_wgt = SafeDecimal $reader["SmallWGT"]
        below_wgt = SafeDecimal $reader["BelowWGT"]
        rubbish_wgt = SafeDecimal $reader["RubbishwGT"]
        raw_wgt = SafeDecimal $reader["RawWGT"]
        net_sales = SafeDecimal $reader["HvtSLS"]
    }
    $batch += $obj
    $totalSales++

    if ($batch.Count -ge $batchSize) {
        Post-BatchToSupabase "pond_harvest_sales" $batch "index_no"
        Write-Output "  -> Processed $totalSales sales rows..."
        $batch = @()
    }
}
if ($batch.Count -gt 0) {
    Post-BatchToSupabase "pond_harvest_sales" $batch "index_no"
    Write-Output "  -> Processed $totalSales sales rows total."
}
$reader.Close()

# -------------------------------------------------------------
# STAGE 6: GrowoutPondNote (1,652 Rows) -> pond_notes
# -------------------------------------------------------------
Write-Output "`n[STAGE 6/7] Migrating GrowoutPondNote (Logbook Notes)..."
$cmd.CommandText = "SELECT PondIndex, Remark, indexNo FROM [GrowoutPondNote] WHERE Remark IS NOT NULL"
$reader = $cmd.ExecuteReader()

$batch = @()
$totalNotes = 0

while ($reader.Read()) {
    $pIdx = SafeString $reader["PondIndex"]
    $rem = SafeString $reader["Remark"]
    if (-not $pIdx -or -not $rem -or -not $validMasterPondIndices.Contains($pIdx)) { continue }

    $obj = [ordered]@{
        pond_index = $pIdx
        index_no = SafeInt $reader["indexNo"]
        note = $rem
        logged_by = "ACCESS_MIGRATION"
    }
    $batch += $obj
    $totalNotes++

    if ($batch.Count -ge $batchSize) {
        Post-BatchToSupabase "pond_notes" $batch "index_no"
        Write-Output "  -> Processed $totalNotes note rows..."
        $batch = @()
    }
}
if ($batch.Count -gt 0) {
    Post-BatchToSupabase "pond_notes" $batch "index_no"
    Write-Output "  -> Processed $totalNotes note rows total."
}
$reader.Close()

# -------------------------------------------------------------
# STAGE 7: GrowoutPondSampling (51,918 Rows) -> biometrics_sampling
# -------------------------------------------------------------
Write-Output "`n[STAGE 7/7] Migrating GrowoutPondSampling (Weekly Biometrics History)..."
$cmd.CommandText = "SELECT PondIndex, smpldate, SmplDoc, smplabw, smplsurv, SmplDFed, SmplTFed, Psmpldate, PSmplDoc, Psmplabw, Psmplsurv, PSmplDFed, PSmplTFed, sttgabw, sttgsurv, sttgbms, sttgDFed, sttgTFed, smplbms, indexNo FROM [GrowoutPondSampling]"
$reader = $cmd.ExecuteReader()

$batch = @()
$totalSampling = 0

while ($reader.Read()) {
    $pIdx = SafeString $reader["PondIndex"]
    if (-not $pIdx -or -not $validMasterPondIndices.Contains($pIdx)) { continue }

    $obj = [ordered]@{
        pond_index = $pIdx
        index_no = SafeInt $reader["indexNo"]
        smpl_date = $(if ($reader["smpldate"] -ne [DBNull]::Value) { SafeDate $reader["smpldate"] } else { "2026-01-01" })
        smpl_doc = $(if ($reader["SmplDoc"] -ne [DBNull]::Value) { SafeInt $reader["SmplDoc"] } else { 0 })
        smpl_abw = $(if ($reader["smplabw"] -ne [DBNull]::Value) { SafeDecimal $reader["smplabw"] } else { 0.0 })
        smpl_surv = SafeDecimal $reader["smplsurv"]
        smpl_dfed = SafeDecimal $reader["SmplDFed"]
        smpl_tfed = SafeDecimal $reader["SmplTFed"]
        smpl_bms = SafeDecimal $reader["smplbms"]
        p_smpl_date = SafeDate $reader["Psmpldate"]
        p_smpl_doc = SafeInt $reader["PSmplDoc"]
        p_smpl_abw = SafeDecimal $reader["Psmplabw"]
        p_smpl_surv = SafeDecimal $reader["Psmplsurv"]
        p_smpl_dfed = SafeDecimal $reader["PSmplDFed"]
        p_smpl_tfed = SafeDecimal $reader["PSmplTFed"]
        sttg_abw = SafeDecimal $reader["sttgabw"]
        sttg_surv = SafeDecimal $reader["sttgsurv"]
        sttg_bms = SafeDecimal $reader["sttgbms"]
        sttg_dfed = SafeDecimal $reader["sttgDFed"]
        sttg_tfed = SafeDecimal $reader["sttgTFed"]
    }
    $batch += $obj
    $totalSampling++

    if ($batch.Count -ge $batchSize) {
        Post-BatchToSupabase "biometrics_sampling" $batch "index_no"
        Write-Output "  -> Processed $totalSampling sampling rows..."
        $batch = @()
    }
}
if ($batch.Count -gt 0) {
    Post-BatchToSupabase "biometrics_sampling" $batch "index_no"
    Write-Output "  -> Processed $totalSampling sampling rows total."
}
$reader.Close()

$conn.Close()

Write-Output "`n=========================================================="
Write-Output "DATABASE MIGRATION COMPLETED SUCCESSFULLY!"
Write-Output "Total Cycles Migrated: $totalMaster"
Write-Output "Total Stocking Batches: $totalStocking"
Write-Output "Total Harvest Runs: $totalHarvest"
Write-Output "Total Pathology Issues: $totalIssues"
Write-Output "Total Sales & Buyer Grading: $totalSales"
Write-Output "Total Pond Notes: $totalNotes"
Write-Output "Total Biometrics Samplings: $totalSampling"
Write-Output "End Time: $(Get-Date)"
Write-Output "=========================================================="
