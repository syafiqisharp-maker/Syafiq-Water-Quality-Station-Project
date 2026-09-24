$dbPath = "C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\Pond Operations Management System\Legacy Access DB\Bab SGo (r41) 26.09.18.accdb"
$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$dbPath;Persist Security Info=False;")
$conn.Open()

$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT TOP 10 PondIndex, pond, cycleno, cropno, [pond status], [pond active], [date cycle] FROM [GrowoutPondMaster] WHERE PondIndex LIKE '2010101%' ORDER BY [date cycle] ASC"
$reader = $cmd.ExecuteReader()

while ($reader.Read()) {
    Write-Output "PondIndex: $($reader['PondIndex']) | Pond: $($reader['pond']) | Cycle: $($reader['cycleno']) | Crop: $($reader['cropno']) | Status: $($reader['pond status']) | Active: $($reader['pond active']) | Date: $($reader['date cycle'])"
}
$reader.Close()
$conn.Close()
