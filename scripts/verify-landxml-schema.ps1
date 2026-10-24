param(
  [Parameter(Mandatory=$true)][string[]]$XmlPath,
  [string]$SchemaPath = '.cache/map-export/LandXML-1.2.xsd'
)
$ErrorActionPreference='Stop'
# Public reference data, not executable code. Pin the exact official 1.2 schema
# retrieved from http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd.
$schemaHash=(Get-FileHash -LiteralPath $SchemaPath -Algorithm SHA256).Hash.ToLowerInvariant()
if($schemaHash -ne 'f4f732341970a923943f94592a3fde0838534515d564a699761e85420fad4d77'){
  throw 'LandXML schema hash does not match the independently retrieved official reference.'
}
$safeReader=[System.Xml.XmlReaderSettings]::new()
$safeReader.DtdProcessing=[System.Xml.DtdProcessing]::Prohibit
$safeReader.XmlResolver=$null
$schemas=[System.Xml.Schema.XmlSchemaSet]::new()
$schemas.XmlResolver=$null
$schemaReader=[System.Xml.XmlReader]::Create((Resolve-Path -LiteralPath $SchemaPath).Path,$safeReader)
try{[void]$schemas.Add('http://www.landxml.org/schema/LandXML-1.2',$schemaReader);$schemas.Compile()}finally{$schemaReader.Dispose()}
$results=foreach($file in $XmlPath){
  $issues=[System.Collections.Generic.List[string]]::new()
  $settings=[System.Xml.XmlReaderSettings]::new()
  $settings.DtdProcessing=[System.Xml.DtdProcessing]::Prohibit
  $settings.XmlResolver=$null
  $settings.ValidationType=[System.Xml.ValidationType]::Schema
  $settings.Schemas=$schemas
  $settings.ValidationFlags=[System.Xml.Schema.XmlSchemaValidationFlags]::ProcessIdentityConstraints -bor [System.Xml.Schema.XmlSchemaValidationFlags]::ReportValidationWarnings
  $settings.add_ValidationEventHandler([System.Xml.Schema.ValidationEventHandler]{param($sender,$eventArgs)$issues.Add($eventArgs.Message)})
  $reader=$null;$rootChecked=$false;$pointCount=0;$planFeatureCount=0
  try{
    $reader=[System.Xml.XmlReader]::Create((Resolve-Path -LiteralPath $file).Path,$settings)
    while($reader.Read()){
      if($reader.NodeType -ne [System.Xml.XmlNodeType]::Element){continue}
      if(-not $rootChecked){
        $rootChecked=$true
        if($reader.LocalName -ne 'LandXML' -or $reader.NamespaceURI -ne 'http://www.landxml.org/schema/LandXML-1.2'){throw 'The root is not LandXML 1.2.'}
      }
      if($reader.LocalName -eq 'CgPoint'){$pointCount++}
      if($reader.LocalName -eq 'PlanFeature'){$planFeatureCount++}
    }
    if(-not $rootChecked){throw 'The document has no root element.'}
  }catch{$issues.Add($_.Exception.Message)}finally{if($reader){$reader.Dispose()}}
  [pscustomobject]@{path=$file;passed=$issues.Count -eq 0;pointCount=$pointCount;planFeatureCount=$planFeatureCount;issues=@($issues)}
}
[pscustomobject]@{checkedAt=[DateTime]::UtcNow.ToString('o');schemaSha256=$schemaHash;schemaSource='http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd';results=@($results)} | ConvertTo-Json -Depth 6
if(@($results | Where-Object {-not $_.passed}).Count -gt 0){exit 1}
