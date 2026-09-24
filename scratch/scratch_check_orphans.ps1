$dbPath = "C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\Pond Operations Management System\Legacy Access DB\Bab SGo (r41) 26.09.18.accdb"
$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$dbPath;")
$conn.Open()

function Check-Orphans($childTable, $childCol) {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT COUNT(*) FROM [$childTable] c LEFT JOIN [GrowoutPondMaster] m ON c.[$childCol] = m.PondIndex WHERE m.PondIndex IS NULL"
    $count = $cmd.ExecuteScalar()
    Write-Output "Orphans in $childTable ($childCol): $count"
}

Check-Orphans "GrowoutPondStocking" "PondIndex"
Check-Orphans "GrowoutPondHarvestDaily" "PondIndex"
Check-Orphans "GrowoutPondIssues" "PondIndex"
Check-Orphans "GrowoutPondSampling" "PondIndex"
Check-Orphans "GrowoutPondHarvestSales" "HvtPondIndx"
Check-Orphans "GrowoutPondNote" "PondIndex"

$conn.Close()
