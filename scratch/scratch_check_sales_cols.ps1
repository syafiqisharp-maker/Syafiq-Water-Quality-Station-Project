$dbPath = "C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\Pond Operations Management System\Legacy Access DB\Bab SGo (r41) 26.09.18.accdb"
$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$dbPath;")
$conn.Open()

function Get-Cols($tableName) {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT TOP 1 * FROM [$tableName]"
    $reader = $cmd.ExecuteReader([System.Data.CommandBehavior]::SchemaOnly)
    $schema = $reader.GetSchemaTable()
    $cols = @()
    foreach ($row in $schema.Rows) {
        $cols += $row["ColumnName"]
    }
    $reader.Close()
    return ($cols -join ", ")
}

Write-Output "GrowoutPondHarvestSales columns:"
Write-Output (Get-Cols "GrowoutPondHarvestSales")

Write-Output "`nGrowoutPondNote columns:"
Write-Output (Get-Cols "GrowoutPondNote")

Write-Output "`nGrowoutPondStaff columns:"
Write-Output (Get-Cols "GrowoutPondStaff")

$conn.Close()
