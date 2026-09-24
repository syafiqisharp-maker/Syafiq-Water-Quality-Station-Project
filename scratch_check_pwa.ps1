$dbPath = "C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\Pond Operations Management System\Legacy Access DB\Bab SGo (r41) 26.09.18.accdb"
$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$dbPath;")
$conn.Open()

# 1. Check statistics of [I HP] and [2 HP] in GrowoutPondMaster
$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT COUNT(*) as total, COUNT([I HP]) as cnt1, COUNT([2 HP]) as cnt2, AVG([I HP]) as avg1, AVG([2 HP]) as avg2 FROM [GrowoutPondMaster]"
$reader = $cmd.ExecuteReader()
while ($reader.Read()) {
    Write-Output "GrowoutPondMaster: Total=$($reader['total']), Has1HP=$($reader['cnt1']), Has2HP=$($reader['cnt2']), Avg1HP=$($reader['avg1']), Avg2HP=$($reader['avg2'])"
}
$reader.Close()

# 2. Check sample distinct combinations of [I HP] and [2 HP]
$cmd.CommandText = "SELECT DISTINCT [I HP], [2 HP], COUNT(*) as ponds FROM [GrowoutPondMaster] GROUP BY [I HP], [2 HP]"
$reader = $cmd.ExecuteReader()
Write-Output "`nDistinct Aerator configurations in GrowoutPondMaster:"
while ($reader.Read()) {
    Write-Output "  1HP: '$($reader['I HP'])', 2HP: '$($reader['2 HP'])' -> $($reader['ponds']) cycles"
}
$reader.Close()

# 3. Check MNA-PWA Status
$cmd.CommandText = "SELECT COUNT(*) as total, AVG([1HP]) as avg1, AVG([2HP]) as avg2 FROM [MNA-PWA Status]"
$reader = $cmd.ExecuteReader()
Write-Output "`n[MNA-PWA Status]:"
while ($reader.Read()) {
    Write-Output "Total=$($reader['total']), Avg1HP=$($reader['avg1']), Avg2HP=$($reader['avg2'])"
}
$reader.Close()

$conn.Close()
