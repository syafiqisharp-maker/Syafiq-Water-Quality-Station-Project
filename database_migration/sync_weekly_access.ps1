param(
    [string]$dbPath = ""
)

$ErrorActionPreference = "Stop"

$legacyDbDir = "C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\Pond Operations Management System\Legacy Access DB"
$supabaseUrl = "https://keappoukeagyzpoxkrru.supabase.co"
$supabaseKey = "sb_publishable_kObmQ9Ha4NLrl9vQXy5k5w_Ie9-EQ4s"

$headers = @{
    "apikey" = $supabaseKey
    "Authorization" = "Bearer $supabaseKey"
    "Content-Type" = "application/json; charset=utf-8"
    "Prefer" = "resolution=merge-duplicates"
}

Write-Output "=========================================================="
Write-Output "  iSHARP ENTERPRISE SMART WEEKLY SYNC (Access -> Supabase)"
Write-Output "  Start Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Output "=========================================================="

# Auto-detect latest Access file if not specified
if (-not $dbPath -or -not (Test-Path $dbPath)) {
    Write-Output "Scanning for latest Access DB in: $legacyDbDir"
    $latestFile = Get-ChildItem -Path $legacyDbDir -Filter "*.accdb" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latestFile) {
        throw "No .accdb database file found in $legacyDbDir"
    }
    $dbPath = $latestFile.FullName
}

Write-Output "Using Source DB: $dbPath"
Write-Output "File Size: $([math]::Round((Get-Item $dbPath).Length / 1MB, 2)) MB"
Write-Output "Target Cloud: $supabaseUrl"
Write-Output ""

# Connect to Access via OLEDB
$connStr = "Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$dbPath;Persist Security Info=False;"
$conn = New-Object System.Data.OleDb.OleDbConnection($connStr)
$conn.Open()
Write-Output "[OK] Connected to Microsoft Access DB successfully."

# Data Conversion Helpers
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

function Get-SupabaseMaxIndex([string]$tableName) {
    $uri = "$supabaseUrl/rest/v1/" + $tableName + "?select=index_no&order=index_no.desc&limit=1"
    try {
        $res = Invoke-RestMethod -Uri $uri -Headers $headers -Method Get
        if ($res.Count -gt 0 -and $res[0].index_no -ne $null) {
            return [int]$res[0].index_no
        }
    } catch {
        Write-Warning ("Could not fetch max index for " + $tableName + ": " + $_.Exception.Message)
    }
    return 0
}

# -------------------------------------------------------------
# STAGE 1: Synchronize Master Cycles (growout_pond_master)
# Upsert active cycles + recently closed/modified cycles + any new cycles
# -------------------------------------------------------------
Write-Output ""
Write-Output "[1/7] Synchronizing Master Culture Cycles (growout_pond_master)..."

# Fetch all existing pond_index in Supabase to guarantee referential integrity
$sbPondIndices = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$offset = 0
$limit = 1000
while ($true) {
    $queryUrl = "$supabaseUrl/rest/v1/growout_pond_master?select=pond_index&limit=" + $limit + "&offset=" + $offset
    $res = Invoke-RestMethod -Uri $queryUrl -Headers $headers -Method Get
    if ($res.Count -eq 0) { break }
    foreach ($row in $res) {
        $sbPondIndices.Add($row.pond_index) | Out-Null
    }
    $offset += $limit
    if ($res.Count -lt $limit) { break }
}
Write-Output "  -> Supabase currently tracks $($sbPondIndices.Count) culture cycles."

$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT PondIndex, pond, modl, row, cropno, cycleno, [pond status], [pond active], [date cycle], [date ready], [culture status], [disease status], area, [pond type], [pond usage], [date cleaning], [DateRepair], [date filling], [date culture], [DateBabyBox], [DateQaqc], [date close], [final status], IdleStatus, [water type], Initiative FROM [GrowoutPondMaster]"
$reader = $cmd.ExecuteReader()

$masterBatch = @()
$masterCount = 0

while ($reader.Read()) {
    $pIdx = SafeString $reader["PondIndex"]
    if (-not $pIdx) { continue }

    $rawActive = SafeString $reader["pond active"]
    $rawStatus = SafeString $reader["pond status"]
    $dtClose = SafeDate $reader["date close"]

    # Normalize casing and status to clean architectural standard
    $cleanActive = if ($rawActive) {
        $norm = $rawActive.Replace(" ", "").ToUpper()
        if ($norm -eq "INACTIVE") { "INACTIVE" } else { "ACTIVE" }
    } else { "ACTIVE" }

    $cleanStatus = if ($rawStatus) {
        $s = $rawStatus.Trim().ToUpper()
        if ($s -in @("NOT IN USED", "NOT IN USE", "NOT_IN_USE")) { "NOT IN USE" }
        elseif ($s -in @("PRODUCTION", "IDLE", "PREPARATION", "RESERVOIR", "MAINTENANCE", "CLOSE")) { $s }
        else { $s }
    } else { "IDLE" }

    # Filter: sync if active, or if not yet in Supabase, or if closed within the last 60 days
    $isNew = -not $sbPondIndices.Contains($pIdx)
    $isActive = ($cleanActive -eq "ACTIVE")
    $isRecentClose = ($dtClose -ne $null -and [datetime]$dtClose -ge (Get-Date).AddDays(-60))

    if (-not ($isNew -or $isActive -or $isRecentClose)) {
        continue
    }

    $pLabel = if ($pIdx.Length -ge 7) { "$($pIdx.Substring(1,2)).$($pIdx.Substring(3,2)).$($pIdx.Substring(5,2))" } else { SafeString $reader["pond"] }

    $obj = [ordered]@{
        pond_index = $pIdx
        pond = $pLabel
        farm = "SETiU"
        modl = SafeString $reader["modl"]
        row_no = SafeString $reader["row"]
        crop_no = SafeString $reader["cropno"]
        cycle_no = SafeString $reader["cycleno"]
        pond_status = $cleanStatus
        pond_active = $cleanActive
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
        date_close = $dtClose
    }
    $masterBatch += $obj
    $sbPondIndices.Add($pIdx) | Out-Null
    $masterCount++
}
$reader.Close()

if ($masterBatch.Count -gt 0) {
    Post-BatchToSupabase "growout_pond_master" $masterBatch "pond_index"
    Write-Output "  [OK] Upserted $masterCount active/recent culture cycles into growout_pond_master."
} else {
    Write-Output "  [OK] All master cycles already up-to-date."
}

# -------------------------------------------------------------
# STAGE 2: Synchronize Gatekeeper (active_operational_ponds)
# Reconcile currently active PRODUCTION ponds
# -------------------------------------------------------------
Write-Output ""
Write-Output "[2/7] Synchronizing Active Gatekeeper (active_operational_ponds)..."
$cmd.CommandText = "SELECT PondIndex, pond FROM [GrowoutPondMaster] WHERE [pond status] = 'PRODUCTION' AND ([pond active] = 'ACTiVE' OR [pond active] = 'ACTIVE')"
$reader = $cmd.ExecuteReader()
$accessActiveDict = @{}
while ($reader.Read()) {
    $pIdx = SafeString $reader["PondIndex"]
    $pLabel = if ($pIdx.Length -ge 7) { "$($pIdx.Substring(1,2)).$($pIdx.Substring(3,2)).$($pIdx.Substring(5,2))" } else { SafeString $reader["pond"] }
    $accessActiveDict[$pLabel] = $pIdx
}
$reader.Close()

$sbActive = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/active_operational_ponds?select=pond,pond_index" -Headers $headers -Method Get
$sbActiveDict = @{}
foreach ($item in $sbActive) {
    $sbActiveDict[$item.pond] = $item.pond_index
}

# Determine removals (ponds no longer in production)
$removedCount = 0
foreach ($p in $sbActiveDict.Keys) {
    if (-not $accessActiveDict.ContainsKey($p)) {
        try {
            $delUrl = "$supabaseUrl/rest/v1/active_operational_ponds?pond=eq." + $p
            $null = Invoke-RestMethod -Uri $delUrl -Headers $headers -Method Delete
            $removedCount++
        } catch {
            Write-Warning ("Could not remove pond " + $p + " from gatekeeper: " + $_.Exception.Message)
        }
    }
}

# Determine adds/updates (ponds currently in production)
$gateBatch = @()
foreach ($p in $accessActiveDict.Keys) {
    if (-not $sbActiveDict.ContainsKey($p) -or $sbActiveDict[$p] -ne $accessActiveDict[$p]) {
        $gateBatch += [ordered]@{
            pond = $p
            pond_index = $accessActiveDict[$p]
            activated_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss+08:00")
        }
    }
}

if ($gateBatch.Count -gt 0) {
    Post-BatchToSupabase "active_operational_ponds" $gateBatch "pond"
}
Write-Output "  [OK] Gatekeeper updated: $($accessActiveDict.Count) active ponds ($($gateBatch.Count) added/updated, $removedCount removed)."

# -------------------------------------------------------------
# STAGE 3: Incremental GrowoutPondStocking -> pond_stocking_batches
# Single Source of Truth for all stocking batches
# -------------------------------------------------------------
Write-Output ""
Write-Output "[3/7] Incremental Sync: GrowoutPondStocking -> pond_stocking_batches..."
$maxStocking = Get-SupabaseMaxIndex "pond_stocking_batches"
$cmd.CommandText = "SELECT PondIndex, stckdate, stcksource, stckspcs, stckpcs, stcktype, stckallow, stcktotal, stcktank, stcksize, stckplstts, BSLine, indexNo FROM [GrowoutPondStocking] WHERE indexNo > $maxStocking ORDER BY indexNo ASC"
$reader = $cmd.ExecuteReader()
$batch = @()
$newStockingCount = 0
while ($reader.Read()) {
    $pIdx = SafeString $reader["PondIndex"]
    if (-not $pIdx -or -not $sbPondIndices.Contains($pIdx)) { continue }

    $stckDate = SafeDate $reader["stckdate"]
    $stckSource = SafeString $reader["stcksource"]
    $stckSpecies = $(if ($reader["stckspcs"] -ne [DBNull]::Value) { SafeString $reader["stckspcs"] } else { "P. VANNAMEi" })
    $stckPcs = SafeDecimal $reader["stckpcs"]
    $stckType = $(if ($reader["stcktype"] -ne [DBNull]::Value) { SafeString $reader["stcktype"] } else { "SPT" })
    $stckAllow = SafeDecimal $reader["stckallow"]
    $stckTotal = SafeDecimal $reader["stcktotal"]
    $stckTank = SafeString $reader["stcktank"]
    $stckSize = SafeDecimal $reader["stcksize"]
    $stckPlstts = $(if ($reader["stckplstts"] -ne [DBNull]::Value) { SafeString $reader["stckplstts"] } else { "1. NPL" })
    $bsLine = SafeString $reader["BSLine"]

    $batch += [ordered]@{
        pond_index = $pIdx
        index_no = SafeInt $reader["indexNo"]
        stck_date = $stckDate
        stck_source = $stckSource
        stck_species = $stckSpecies
        stck_pcs = $stckPcs
        stck_type = $stckType
        stck_allow = $stckAllow
        stck_total = $stckTotal
        stck_tank = $stckTank
        stck_size = $stckSize
        stck_plstts = $stckPlstts
        bs_line = $bsLine
    }

    $newStockingCount++
    if ($batch.Count -ge 500) {
        Post-BatchToSupabase "pond_stocking_batches" $batch "index_no"
        $batch = @()
    }
}
$reader.Close()
if ($batch.Count -gt 0) {
    Post-BatchToSupabase "pond_stocking_batches" $batch "index_no"
}
Write-Output "  [OK] Added $newStockingCount new stocking batches to pond_stocking_batches (Max ID was $maxStocking)."


# -------------------------------------------------------------
# STAGE 4: Incremental GrowoutPondHarvestDaily -> pond_harvest_daily
# -------------------------------------------------------------
Write-Output ""
Write-Output "[4/7] Incremental Sync: GrowoutPondHarvestDaily..."
$maxHarvestDaily = Get-SupabaseMaxIndex "pond_harvest_daily"
$cmd.CommandText = "SELECT PondIndex, harvdate, harvstts, harvwgt, harvabw, harvRev, harvmtd, indexNo FROM [GrowoutPondHarvestDaily] WHERE indexNo > $maxHarvestDaily ORDER BY indexNo ASC"
$reader = $cmd.ExecuteReader()
$batch = @()
$newHarvestDailyCount = 0
while ($reader.Read()) {
    $pIdx = SafeString $reader["PondIndex"]
    if (-not $pIdx -or -not $sbPondIndices.Contains($pIdx)) { continue }

    $batch += [ordered]@{
        pond_index = $pIdx
        index_no = SafeInt $reader["indexNo"]
        harv_date = $(if ($reader["harvdate"] -ne [DBNull]::Value) { SafeDate $reader["harvdate"] } else { "2026-01-01" })
        harv_status = $(if ($reader["harvstts"] -ne [DBNull]::Value) { SafeString $reader["harvstts"] } else { "TERMINATION" })
        harv_weight = $(if ($reader["harvwgt"] -ne [DBNull]::Value) { SafeDecimal $reader["harvwgt"] } else { 0.0 })
        harv_abw = $(if ($reader["harvabw"] -ne [DBNull]::Value) { SafeDecimal $reader["harvabw"] } else { 0.0 })
        harv_revenue = $(if ($reader["harvRev"] -ne [DBNull]::Value) { SafeDecimal $reader["harvRev"] } else { 0.0 })
        harv_method = $(if ($reader["harvmtd"] -ne [DBNull]::Value) { SafeString $reader["harvmtd"] } else { "M" })
    }
    $newHarvestDailyCount++
    if ($batch.Count -ge 500) {
        Post-BatchToSupabase "pond_harvest_daily" $batch "index_no"
        $batch = @()
    }
}
$reader.Close()
if ($batch.Count -gt 0) {
    Post-BatchToSupabase "pond_harvest_daily" $batch "index_no"
}
Write-Output "  [OK] Added $newHarvestDailyCount new harvest daily logs (Max ID was $maxHarvestDaily)."

# -------------------------------------------------------------
# STAGE 5: Incremental GrowoutPondHarvestSales -> pond_harvest_sales
# -------------------------------------------------------------
Write-Output ""
Write-Output "[5/7] Incremental Sync: GrowoutPondHarvestSales..."
$maxHarvestSales = Get-SupabaseMaxIndex "pond_harvest_sales"
$cmd.CommandText = "SELECT indexNo, HvtPondIndx, HvtDate, HvtABW, GoodWGT, GoodPRC, [2ndGradeWGT], [2ndGradePRC], SmallWGT, BelowWGT, RubbishwGT, RawWGT, HvtSLS, HvtBuyer FROM [GrowoutPondHarvestSales] WHERE indexNo > $maxHarvestSales ORDER BY indexNo ASC"
$reader = $cmd.ExecuteReader()
$batch = @()
$newHarvestSalesCount = 0
while ($reader.Read()) {
    $pIdx = SafeString $reader["HvtPondIndx"]
    if (-not $pIdx -or -not $sbPondIndices.Contains($pIdx)) { continue }

    $batch += [ordered]@{
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
    $newHarvestSalesCount++
    if ($batch.Count -ge 500) {
        Post-BatchToSupabase "pond_harvest_sales" $batch "index_no"
        $batch = @()
    }
}
$reader.Close()
if ($batch.Count -gt 0) {
    Post-BatchToSupabase "pond_harvest_sales" $batch "index_no"
}
Write-Output "  [OK] Added $newHarvestSalesCount new harvest sales logs (Max ID was $maxHarvestSales)."

# -------------------------------------------------------------
# STAGE 6: Incremental GrowoutPondIssues -> pond_issues & Notes
# -------------------------------------------------------------
Write-Output ""
Write-Output "[6/7] Incremental Sync: GrowoutPondIssues and Notes..."
$maxIssues = Get-SupabaseMaxIndex "pond_issues"
$cmd.CommandText = "SELECT PondIndex, issuedate, issueCat, issuestts, issuetest, issueflag, issueGrade, issueNote, indexNo FROM [GrowoutPondIssues] WHERE indexNo > $maxIssues ORDER BY indexNo ASC"
$reader = $cmd.ExecuteReader()
$batch = @()
$newIssuesCount = 0
while ($reader.Read()) {
    $pIdx = SafeString $reader["PondIndex"]
    if (-not $pIdx -or -not $sbPondIndices.Contains($pIdx)) { continue }

    $batch += [ordered]@{
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
    $newIssuesCount++
    if ($batch.Count -ge 500) {
        Post-BatchToSupabase "pond_issues" $batch "index_no"
        $batch = @()
    }
}
$reader.Close()
if ($batch.Count -gt 0) {
    Post-BatchToSupabase "pond_issues" $batch "index_no"
}
Write-Output "  [OK] Added $newIssuesCount new pathology issues (Max ID was $maxIssues)."

# Check notes
$maxNotes = Get-SupabaseMaxIndex "pond_notes"
$cmd.CommandText = "SELECT PondIndex, Remark, indexNo FROM [GrowoutPondNote] WHERE indexNo > $maxNotes AND Remark IS NOT NULL ORDER BY indexNo ASC"
$reader = $cmd.ExecuteReader()
$batch = @()
$newNotesCount = 0
while ($reader.Read()) {
    $pIdx = SafeString $reader["PondIndex"]
    $rem = SafeString $reader["Remark"]
    if (-not $pIdx -or -not $rem -or -not $sbPondIndices.Contains($pIdx)) { continue }

    $batch += [ordered]@{
        pond_index = $pIdx
        index_no = SafeInt $reader["indexNo"]
        note = $rem
        logged_by = "ACCESS_WEEKLY_SYNC"
    }
    $newNotesCount++
    if ($batch.Count -ge 500) {
        Post-BatchToSupabase "pond_notes" $batch "index_no"
        $batch = @()
    }
}
$reader.Close()
if ($batch.Count -gt 0) {
    Post-BatchToSupabase "pond_notes" $batch "index_no"
}
Write-Output "  [OK] Added $newNotesCount new pond notes (Max ID was $maxNotes)."

# -------------------------------------------------------------
# STAGE 7: Incremental GrowoutPondSampling -> biometrics_sampling
# -------------------------------------------------------------
Write-Output ""
Write-Output "[7/7] Incremental Sync: GrowoutPondSampling (Biometrics)..."
$maxSampling = Get-SupabaseMaxIndex "biometrics_sampling"
$cmd.CommandText = "SELECT PondIndex, smpldate, SmplDoc, smplabw, smplsurv, SmplDFed, SmplTFed, Psmpldate, PSmplDoc, Psmplabw, Psmplsurv, PSmplDFed, PSmplTFed, sttgabw, sttgsurv, sttgbms, sttgDFed, sttgTFed, smplbms, indexNo FROM [GrowoutPondSampling] WHERE indexNo > $maxSampling ORDER BY indexNo ASC"
$reader = $cmd.ExecuteReader()
$batch = @()
$newSamplingCount = 0
while ($reader.Read()) {
    $pIdx = SafeString $reader["PondIndex"]
    if (-not $pIdx -or -not $sbPondIndices.Contains($pIdx)) { continue }

    $batch += [ordered]@{
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
    $newSamplingCount++
    if ($batch.Count -ge 500) {
        Post-BatchToSupabase "biometrics_sampling" $batch "index_no"
        $batch = @()
    }
}
$reader.Close()
if ($batch.Count -gt 0) {
    Post-BatchToSupabase "biometrics_sampling" $batch "index_no"
}
Write-Output "  [OK] Added $newSamplingCount new biometrics samplings (Max ID was $maxSampling)."

$conn.Close()

Write-Output ""
Write-Output "=========================================================="
Write-Output "  WEEKLY SYNC COMPLETED SUCCESSFULLY!"
Write-Output "  Master Cycles Upserted:       $masterCount"
Write-Output "  Active Operational Ponds:     $($accessActiveDict.Count)"
Write-Output "  New Stocking Batches:         $newStockingCount"
Write-Output "  New Daily Harvest Runs:       $newHarvestDailyCount"
Write-Output "  New Harvest Sales Records:    $newHarvestSalesCount"
Write-Output "  New Pathology Issues:         $newIssuesCount"
Write-Output "  New Pond Notes:               $newNotesCount"
Write-Output "  New Biometrics Samplings:     $newSamplingCount"
Write-Output "  Finish Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Output "=========================================================="
