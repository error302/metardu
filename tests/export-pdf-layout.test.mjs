import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync,mkdtempSync,readFileSync,readdirSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const root=fileURLToPath(new URL('../',import.meta.url))
const require=createRequire(import.meta.url)

if(process.argv[2]==='--generate'){
  const Module=require('node:module'),ts=require('typescript')
  // Resolve the real helper from its source location; only TypeScript syntax
  // is transpiled. jsPDF and file generation execute their installed code.
  Module._extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},
  }).outputText,filename)
  const {generatePDF}=require(path.join(root,'src/lib/export/helpers.ts'))
  await generatePDF({title:'Synthetic PDF layout',reference:'Synthetic layout verification only'},[
    {title:'Source evidence',rows:[
      {label:'A deliberately long provenance label that must wrap inside its own column',value:'Declared source retained.'},
      {label:'Evidence',value:('Measured inputs require independent review. ').repeat(100)+'END OF RETAINED EVIDENCE'},
    ]},
  ],[{title:'Retained observations',headers:['Station','RL (m)'],rows:[['SYN-ZERO','0.0000']]}])
}else{
  test('actual computation PDF wraps summary columns and paginates long evidence without clipping',async()=>{
    const base=path.join(root,'.cache/pdf-layout')
    mkdirSync(base,{recursive:true})
    const directory=mkdtempSync(path.join(base,'owned-'))
    const generated=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--generate'],{
      cwd:directory,encoding:'utf8',windowsHide:true,timeout:30000,
    })
    assert.equal(generated.status,0,generated.stderr)
    const files=readdirSync(directory).filter(name=>name.endsWith('.pdf'))
    assert.equal(files.length,1,'Actual PDF generation must produce one file')
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs')
    const document=await getDocument({data:new Uint8Array(readFileSync(path.join(directory,files[0]))),
      standardFontDataUrl:path.join(root,'node_modules/pdfjs-dist/standard_fonts/').replaceAll('\\','/'),
    }).promise
    try{
      assert(document.numPages>1,'The synthetic evidence must cross a page boundary')
      const texts=[],labelTexts=[]
      for(let number=1;number<=document.numPages;number++){
        const page=await document.getPage(number),viewport=page.getViewport({scale:1})
        for(const item of (await page.getTextContent()).items){
          if(!('str' in item)||!item.str.trim())continue
          texts.push(item.str)
          if(item.transform[4]<75*72/25.4)labelTexts.push(item.str)
          assert(item.transform[4]>=35,'Text must remain inside the left print margin')
          assert(item.transform[4]+item.width<=viewport.width-35,'Text must remain inside the right print margin')
          assert(item.transform[5]>=20&&item.transform[5]<=viewport.height-10,'Text must remain vertically on its page')
        }
      }
      const text=texts.join(' ').replaceAll(/\s+/g,' ')
      assert.match(text,/END OF RETAINED EVIDENCE/)
      assert.match(text,/SYN-ZERO/)
      assert.match(text,/0\.0000/)
      assert.match(labelTexts.join(' ').replaceAll(/\s+/g,' '),/A deliberately long provenance label that must wrap inside its own column/)
    }finally{await document.destroy()}
  })
}
