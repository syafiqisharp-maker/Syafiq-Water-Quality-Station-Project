$dbPath = "C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\Pond Operations Management System\Legacy Access DB\Bab SGo (r41) 26.09.18.accdb"
$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$dbPath;Persist Security Info=False;")
$conn.Open()

$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT COUNT(*) FROM [GrowoutPondMaster] WHERE PondIndex LIKE '%.0' OR PondIndex LIKE '%.1' OR PondIndex LIKE '%.2' OR PondIndex LIKE '%.3' OR PondIndex LIKE '%.4' OR PondIndex LIKE '%.5' OR PondIndex LIKE '%.6' OR PondIndex LIKE '%.7' OR PondIndex LIKE '%.8' OR PondIndex LIKE '%.9'"
$count = $cmd.ExecuteScalar()
Write-Output "Access rows with single digit after dot: $count"

$cmd.CommandText = "SELECT COUNT(*) FROM [GrowoutPondMaster]"
$total = $cmd.ExecuteScalar()
Write-Output "Access total rows: $total"

$conn.Close()
