const fs=require('fs');const zlib=require('zlib');
(async()=>{
 const origin=process.argv[2]||'http://localhost:3000';
 const html=await (await fetch(origin)).text();
 const urls=[...new Set([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m=>new URL(m[1].replaceAll('&amp;','&'),origin).href))];
 let bytes=0,gzip=0;const chunks=[];
 for(const url of urls){const r=await fetch(url);if(!r.ok)throw Error(`${r.status} ${url}`);const b=Buffer.from(await r.arrayBuffer());bytes+=b.length;gzip+=zlib.gzipSync(b).length;chunks.push({url,bytes:b.length});}
 const result={origin,scripts:urls.length,bytes,gzipBytes:gzip,date:new Date().toISOString(),chunks};
 fs.mkdirSync('live-test-results',{recursive:true});fs.writeFileSync(`live-test-results/startup-${process.argv[3]||'baseline'}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,chunks:undefined}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
