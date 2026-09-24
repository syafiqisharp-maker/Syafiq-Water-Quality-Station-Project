$dbPath = "C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\Pond Operations Management System\Legacy Access DB\Bab SGo (r41) 26.09.18.accdb"
$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$dbPath;")
$conn.Open()

$tablesSchema = $conn.GetSchema("Tables")
$tableNames = @()
foreach ($row in $tablesSchema.Rows) {
    if ($row["TABLE_TYPE"] -eq "TABLE") {
        $name = [string]$row["TABLE_NAME"]
        if (-not $name.StartsWith("MSys") -and -not $name.StartsWith("~")) {
            $tableNames += $name
        }
    }
}

Write-Output "Found $($tableNames.Count) user tables. Fetching counts..."
$results = @()
foreach ($t in $tableNames) {
    try {
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = "SELECT COUNT(*) FROM [$t]"
        $count = $cmd.ExecuteScalar()
        $results += [PSCustomObject]@{ Table = $t; Rows = [int]$count }
    } catch {
        $results += [PSCustomObject]@{ Table = $t; Rows = -1 }
    }
}

$results | Sort-Object -Property Rows -Descending | Format-Table -AutoSize
$conn.Close()
