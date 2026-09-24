$dbPath = "C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\Pond Operations Management System\Legacy Access DB\Bab SGo (r41) 26.09.18.accdb"
$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$dbPath;")
$conn.Open()

$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT c.PondIndex, c.indexNo FROM [GrowoutPondIssues] c LEFT JOIN [GrowoutPondMaster] m ON c.PondIndex = m.PondIndex WHERE m.PondIndex IS NULL"
$reader = $cmd.ExecuteReader()
Write-Output "Orphan Issues:"
while ($reader.Read()) {
    Write-Output "  PondIndex: '$($reader['PondIndex'])', indexNo: $($reader['indexNo'])"
}
$reader.Close()

$cmd.CommandText = "SELECT c.HvtPondIndx, c.indexNo FROM [GrowoutPondHarvestSales] c LEFT JOIN [GrowoutPondMaster] m ON c.HvtPondIndx = m.PondIndex WHERE m.PondIndex IS NULL"
$reader = $cmd.ExecuteReader()
Write-Output "Orphan Sales:"
while ($reader.Read()) {
    Write-Output "  HvtPondIndx: '$($reader['HvtPondIndx'])', indexNo: $($reader['indexNo'])"
}
$reader.Close()

$conn.Close()
