$dbPath = "C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\Pond Operations Management System\Legacy Access DB\Bab SGo (r41) 26.09.18.accdb"
$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$dbPath;")
$conn.Open()

# Check sample PondIndex values in Access
$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT TOP 20 PondIndex, cycleno, [I HP], [2 HP] FROM [GrowoutPondMaster] WHERE PondIndex LIKE '%.10' OR PondIndex LIKE '%.20' OR PondIndex LIKE '%.30' OR PondIndex LIKE '%.40'"
$reader = $cmd.ExecuteReader()
Write-Output "Access PondIndex ending in .10 / .20 / .30 / .40:"
while ($reader.Read()) {
    Write-Output "PondIndex: '$($reader['PondIndex'])', cycleno: '$($reader['cycleno'])', 1HP: $($reader['I HP']), 2HP: $($reader['2 HP'])"
}
$reader.Close()

# Also check if there are PondIndex ending in .1 or .2 or .3 or .4 where cycleno is 10, 20, 30, 40
$cmd.CommandText = "SELECT TOP 20 PondIndex, cycleno FROM [GrowoutPondMaster] WHERE PondIndex LIKE '%.1' OR PondIndex LIKE '%.2' OR PondIndex LIKE '%.3' OR PondIndex LIKE '%.4'"
$reader = $cmd.ExecuteReader()
Write-Output "`nAccess PondIndex ending in single digit (.1 / .2 / .3 / .4):"
while ($reader.Read()) {
    Write-Output "PondIndex: '$($reader['PondIndex'])', cycleno: '$($reader['cycleno'])'"
}
$reader.Close()

$conn.Close()
