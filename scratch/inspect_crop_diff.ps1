$dbPath = "C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\Pond Operations Management System\Legacy Access DB\Bab SGo (r41) 26.09.18.accdb"
$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$dbPath;Persist Security Info=False;")
$conn.Open()

$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT PondIndex, cycleno, cropno, [date cycle], [final status], [culture status] FROM [GrowoutPondMaster] WHERE PondIndex LIKE '2010101%' ORDER BY [date cycle] ASC"
$reader = $cmd.ExecuteReader()

while ($reader.Read()) {
    Write-Output "Idx: $($reader['PondIndex']) | Cycle: $($reader['cycleno']) | Crop: $($reader['cropno']) | Date: $($reader['date cycle']) | Final: $($reader['final status']) | Cult: $($reader['culture status'])"
}
$reader.Close()
$conn.Close()
