$accessPath = "C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\Pond Operations Management System\Database\Bab SGo (r41) 26.09.18.accdb"
$conn = New-Object -ComObject ADODB.Connection
$conn.Open("Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$accessPath;")

$rs = New-Object -ComObject ADODB.Recordset
$rs.Open("SELECT TOP 20 [PondIndex], [Pond], [CycleNo], [CropNo] FROM [GrowoutPondMaster] WHERE [PondIndex] LIKE '%.0%' OR [PondIndex] LIKE '%.4%'", $conn)

while (-not $rs.EOF) {
    Write-Output "PondIndex: $($rs.Fields['PondIndex'].Value) | Pond: $($rs.Fields['Pond'].Value) | CycleNo: $($rs.Fields['CycleNo'].Value) | CropNo: $($rs.Fields['CropNo'].Value)"
    $rs.MoveNext()
}
$rs.Close()
$conn.Close()
