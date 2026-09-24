$accessDbPath = "C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\Pond Operations Management System\Legacy Access DB\Bab SGo (r41) 26.09.18.accdb"
$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$accessDbPath;Persist Security Info=False;")
$conn.Open()

$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT TOP 10 [PondIndex], [Pond], [cycleno], [cropno] FROM [GrowoutPondMaster] WHERE [cropno] <> [cycleno]"
$reader = $cmd.ExecuteReader()

while ($reader.Read()) {
    Write-Output "PondIndex: $($reader['PondIndex']) | Cycle: $($reader['cycleno']) | Crop: $($reader['cropno'])"
}
$reader.Close()
$conn.Close()
