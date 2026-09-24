$dbPath = "C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\Pond Operations Management System\Legacy Access DB\Bab SGo (r41) 26.09.18.accdb"
$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$dbPath;")
$conn.Open()

# 1. Check data type of PondIndex in GrowoutPondMaster
$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT TOP 1 PondIndex, [I HP], [2 HP], cycleno FROM [GrowoutPondMaster]"
$reader = $cmd.ExecuteReader([System.Data.CommandBehavior]::SchemaOnly)
$schema = $reader.GetSchemaTable()
foreach ($row in $schema.Rows) {
    Write-Output "Column: $($row['ColumnName']), DataType: $($row['DataType']), ProviderType: $($row['ProviderType'])"
}
$reader.Close()

# 2. Check sample PondIndex values with cycle 10, 20, 30, 40
$cmd.CommandText = "SELECT TOP 10 PondIndex, cycleno, [I HP], [2 HP] FROM [GrowoutPondMaster] WHERE cycleno IN ('10', '20', '30', '40') OR cycleno IN (10, 20, 30, 40)"
$reader = $cmd.ExecuteReader()
Write-Output "`nSample cycles 10/20/30/40 in GrowoutPondMaster:"
while ($reader.Read()) {
    Write-Output "PondIndex: '$($reader['PondIndex'])', cycleno: '$($reader['cycleno'])', 1HP: $($reader['I HP']), 2HP: $($reader['2 HP'])"
}
$reader.Close()

# 3. Check MNA-PWA Status
$cmd.CommandText = "SELECT TOP 10 [Index], [Pond Index], [1HP], [2HP] FROM [MNA-PWA Status]"
$reader = $cmd.ExecuteReader()
Write-Output "`nSample in [MNA-PWA Status]:"
while ($reader.Read()) {
    Write-Output "Index: $($reader['Index']), PondIndex: '$($reader['Pond Index'])', 1HP: $($reader['1HP']), 2HP: $($reader['2HP'])"
}
$reader.Close()

$conn.Close()
