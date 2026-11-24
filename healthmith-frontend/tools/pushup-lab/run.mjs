// Local-only comparison. Videos are read by the browser, never sent to an API.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import ts from 'typescript';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const [video,expectedText,variant='standard',output=resolve(root,'test-results/pushup-comparison.json')]=process.argv.slice(2);
const expected=Number(expectedText);
if(!video||!Number.isInteger(expected)||expected<0||!['standard','knee','negative'].includes(variant)){console.error('Usage: node tools/pushup-lab/run.mjs VIDEO MANUAL_COUNT [standard|knee|negative] [OUTPUT.json]');process.exit(1);}
const counter=ts.transpileModule(await readFile(resolve(root,'src/lib/healthmith/frontal-pushup.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const server=createServer(async(req,res)=>{try{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/mediapipe/pose_landmarker_lite.task'&&process.env.PUSHUP_LAB_MODEL){return res.end(await readFile(resolve(process.env.PUSHUP_LAB_MODEL)));}
 if(pathname==='/counter.js'){res.setHeader('Content-Type','text/javascript');return res.end(counter);}
 if(pathname==='/'){res.setHeader('Content-Type','text/html');return res.end(await readFile(resolve(here,'index.html')));}
 const path=resolve(root,'public','.'+pathname);if(!path.startsWith(resolve(root,'public')+'/')){res.writeHead(404);return res.end();}
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm'};
 res.setHeader('Content-Type',mime[extname(path)]??'application/octet-stream');res.end(await readFile(path));
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
try{const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('input').setInputFiles(resolve(video));
 await page.waitForFunction(()=>window.result!==undefined,{},{timeout:600000});const result=await page.evaluate(()=>window.result);
 if(result.error)throw new Error(result.error);
 const report={...result,variant,reference_count:expected,frontal_error:result.frontal-expected,pixel_error:result.pixel-expected,recorded_at:new Date().toISOString(),note:'Counts are compared with the supplied reference. Confirm the reference independently before treating it as ground truth.'};
 await mkdir(dirname(resolve(output)),{recursive:true});await writeFile(resolve(output),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();server.close();}
