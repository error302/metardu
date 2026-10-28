await import('./verify-pdf-native-runtime.mjs')
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire, Module } from 'node:module'
import path from 'node:path'
const require=createRequire(import.meta.url), root=process.cwd()
const manifest=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'))
const lock=JSON.parse(await readFile(path.join(root,'package-lock.json'),'utf8'))
const expected={next:'15.5.28',sharp:'0.35.5',dompurify:'3.4.17',nodemailer:'10.2.1','@sentry/nextjs':'10.75.2',puppeteer:'25.16.0',zod:'4.6.7','source-map-js':'1.2.2','fast-uri':'3.1.9',handlebars:'4.7.10'}
for(const [name,version]of Object.entries(expected)){
 const installed=JSON.parse(await readFile(path.join(root,'node_modules',name,'package.json'),'utf8'))
 assert.equal(installed.version,version,`${name}: run a clean locked install before verification`)
 assert.equal(lock.packages['node_modules/'+name].version,version)
 if(manifest.dependencies[name])assert.equal(manifest.dependencies[name],version)
}
assert.equal(manifest.dependencies['@ducanh2912/next-pwa'],undefined)
assert.equal(manifest.devDependencies['@ducanh2912/next-pwa'],'10.2.9')
assert.equal(manifest.optionalDependencies?.puppeteer,undefined,'The statically imported PDF renderer must be a required runtime dependency')
const puppeteer=await import('puppeteer')
assert.equal(typeof puppeteer.default.launch,'function','The required PDF renderer must actually import without downloading or launching a browser')
console.log('PASS installed runtime patches match the lockfile and manifest; PWA build dependency retained')
const {z}=require('zod')
let collectionVisits=0
const bounded=z.array(z.preprocess(value=>{collectionVisits++;return value},z.string())).max(2).safeParse(Array(10000).fill(42))
assert.equal(bounded.success,false)
assert.equal(collectionVisits,0,'Oversized constrained collections must be rejected before visiting their elements')
console.log('PASS patched constrained-collection validation rejects oversized input before element traversal')

const sharp=require('sharp')
assert.equal(sharp.versions.sharp,expected.sharp)
const rsvg=sharp.versions.rsvg.split('.').map(Number)
assert.ok(rsvg[0]>2||rsvg[0]===2&&(rsvg[1]>63||rsvg[1]===63&&rsvg[2]>=2),'patched SVG renderer required')
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#ff0000"/><path d="M4 16H28" stroke="#ffffff" stroke-width="2"/></svg>')
const png=await sharp(svg).resize(64,64).png().toBuffer()
const metadata=await sharp(png).metadata()
assert.equal(metadata.width,64);assert.equal(metadata.height,64);assert.equal(metadata.format,'png')
const raw=await sharp(png).ensureAlpha().raw().toBuffer()
assert.deepEqual([...raw.subarray((2*64+2)*4,(2*64+2)*4+4)],[255,0,0,255])
console.log('PASS patched native SVG rasterization, PNG encoding and pixel content')

const {JSDOM}=require('jsdom'), ts=require('typescript')
const dom=new JSDOM('',{url:'https://example.invalid/'})
const previousWindow=globalThis.window
try{
 globalThis.window=dom.window
 const file=path.join(root,'src/lib/security/sanitize.ts')
 const loaded=new Module(file);loaded.filename=file;loaded.paths=Module._nodeModulePaths(path.dirname(file))
 loaded._compile(ts.transpileModule(await readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file)
 const clean=loaded.exports.sanitizeHtml('<svg viewBox="0 0 10 10" onload="alert(1)"><path d="M0 0L10 10" stroke="black"/><script>alert(1)</script><foreignObject>bad</foreignObject></svg>')
 assert.match(clean,/<path/);assert.match(clean,/viewBox/);assert.doesNotMatch(clean,/onload|script|foreignObject|alert/i)
}finally{if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;dom.window.close()}
console.log('PASS actual METARDU sanitization preserves inert plan geometry and removes executable SVG')

const nodemailer=require('nodemailer')
const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'})
const mail=await transport.sendMail({from:'METARDU <noreply@example.invalid>',to:'Surveyor <surveyor@example.invalid>',subject:'METARDU synthetic dependency check',text:'Synthetic record. No field authority is established.'})
assert.deepEqual(mail.envelope.to,['surveyor@example.invalid']);assert.match(mail.message.toString(),/Subject: METARDU synthetic dependency check/)
assert.match(mail.message.toString(),/Synthetic record\. No field authority is established\./)
console.log('PASS native email composition through local stream transport; no email sent')

const ExcelJS=require('exceljs'), workbook=new ExcelJS.Workbook(), sheet=workbook.addWorksheet('Synthetic observations')
sheet.addRow(['Point','Easting','Northing','Offset']);sheet.addRow(['SYN-P1',0,9945000,0.0032])
const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(await workbook.xlsx.writeBuffer())
assert.equal(reopened.worksheets[0].getRow(2).getCell(2).value,0)
assert.equal(reopened.worksheets[0].getRow(2).getCell(4).value,0.0032)
console.log('PASS real XLSX ZIP creation and readback preserves zero coordinates and precision')

for(const [location,entry]of Object.entries(lock.packages).filter(([location])=>location.endsWith('/brace-expansion'))){
 const installed=JSON.parse(await readFile(path.join(root,location,'package.json'),'utf8'))
 assert.equal(installed.version,entry.version)
 const library=require(path.join(root,location)), expand=typeof library==='function'?library:library.expand
 assert.deepEqual(expand('point-{1..3}.csv'),['point-1.csv','point-2.csv','point-3.csv'])
}
const {SourceMapGenerator,SourceMapConsumer}=require('source-map-js'), generator=new SourceMapGenerator()
generator.addMapping({generated:{line:1,column:0},source:'survey.ts',original:{line:7,column:2}})
assert.deepEqual(new SourceMapConsumer(generator.toJSON()).originalPositionFor({line:1,column:0}),{source:'survey.ts',line:7,column:2,name:null})
const uri=require('fast-uri').parse('https://EXAMPLE.invalid/project')
assert.equal(uri.scheme,'https');assert.equal(uri.host,'example.invalid')
console.log('PASS compatible brace expansion, source-map lookup and URI normalization')
const Handlebars=require('handlebars')
assert.equal(Handlebars.compile('Point {{name}}')({name:'SYN-P1'}),'Point SYN-P1')
assert.throws(()=>Handlebars.compile({type:'Program',body:[],blockParams:{length:'invalid'}})())
console.log('PASS patched test-template compiler renders strings and rejects malformed AST metadata')
