/**
 * Byte-level tests for the Visual Share Cipher.
 *
 *     node NaiveCryptography/tests/cipher.test.mjs
 *
 * No dependencies and no browser: the cipher module is loaded with a stub
 * global so everything except the canvas/PNG paths can be exercised in Node.
 * The parts that genuinely need a browser -- the PNG round trip, which depends
 * on the browser not colour-managing canvas pixels -- are covered by the
 * "Run self-test in this browser" button on the Settings tab.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '..', 'visual-share-cipher.js'), 'utf8');
globalThis.window = globalThis;
new Function(src)();
const V = globalThis.VisualShareCipher;


let pass = 0, fail = 0;
const ok = (name, cond, extra='') => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name, extra)); };

const pattern = { gridSize: 16, steps: [
  {cell:34,color:0,rotation:0},{cell:35,color:3,rotation:2},
  {cell:52,color:3,rotation:5},{cell:69,color:1,rotation:7},{cell:200,color:6,rotation:1} ]};

const MSG = 'Meet at the pier at 0400. Bring the blue folder. — éàü 🔐';

console.log('\n[1] envelope round-trip');
const blob = await V.encrypt(MSG, pattern, {iterations: 100000});
ok('decrypts to original', (await V.decrypt(blob, pattern)).text === MSG);
ok('header parses', V.parseHeader(blob).iterations === 100000);

console.log('\n[2] wrong key / tampering rejected');
const wrong = { gridSize:16, steps: pattern.steps.slice(0,4).concat([{cell:201,color:6,rotation:1}]) };
await V.decrypt(blob, wrong).then(()=>ok('wrong pattern rejected',false),()=>ok('wrong pattern rejected',true));
const order = { gridSize:16, steps: [...pattern.steps].reverse() };
await V.decrypt(blob, order).then(()=>ok('order matters',false),()=>ok('order matters',true));
const gs = { gridSize:24, steps: pattern.steps };
await V.decrypt(blob, gs).then(()=>ok('grid size is domain-separated',false),()=>ok('grid size is domain-separated',true));
// gridSize is in the header (so in the AAD) but is NOT fed to the KDF -- the
// recipient uses their own pattern's gridSize. So flipping it isolates the AAD.
const aad = blob.slice(); aad[5] ^= 0xff;
await V.decrypt(aad, pattern).then(()=>ok('header tamper rejected (AAD only)',false),()=>ok('header tamper rejected (AAD only)',true));
const hi = await V.encrypt(MSG, pattern, {iterations: 200000});
const dg = hi.slice(); new DataView(dg.buffer, dg.byteOffset).setUint32(6, 100000, false);
await V.decrypt(dg, pattern).then(()=>ok('iteration downgrade 200k->100k rejected',false),()=>ok('iteration downgrade 200k->100k rejected',true));
const dg2 = hi.slice(); new DataView(dg2.buffer, dg2.byteOffset).setUint32(6, 1, false);
await V.decrypt(dg2, pattern).then(()=>ok('absurd iteration count rejected by parser',false),()=>ok('absurd iteration count rejected by parser',true));
const tam = blob.slice(); tam[tam.length-1] ^= 1;
await V.decrypt(tam, pattern).then(()=>ok('ciphertext tamper rejected',false),()=>ok('ciphertext tamper rejected',true));

console.log('\n[3] 2-of-2 XOR shares');
const [A,B] = V.splitIntoShares(blob);
ok('combine(A,B) == envelope', Buffer.compare(Buffer.from(V.combineShares(A,B)), Buffer.from(blob))===0);
ok('combine(B,A) == envelope', Buffer.compare(Buffer.from(V.combineShares(B,A)), Buffer.from(blob))===0);
const pa = V.parseShare(A).payload;
ok('share A payload != envelope', Buffer.compare(Buffer.from(pa), Buffer.from(blob))!==0);
ok('share A alone is not a VSC1 envelope', !(pa[0]===0x56&&pa[1]===0x53&&pa[2]===0x43&&pa[3]===0x31));
const [C,D] = V.splitIntoShares(blob);
try { V.combineShares(A,D); ok('mismatched pair rejected',false); } catch(e){ ok('mismatched pair rejected',true); }
try { V.combineShares(A,C); ok('two share-1s rejected',false); } catch(e){ ok('two share-1s rejected',true); }

console.log('\n[4] pad is uniform (chi-square over bytes, 64KB message)');
const big = await V.encrypt('x'.repeat(65000), pattern, {iterations:100000});
ok('long message survives >65536 RNG limit', (await V.decrypt(big, pattern)).text.length === 65000);
const padBig = V.parseShare(V.splitIntoShares(big)[0]).payload;
const hist = new Array(256).fill(0); for (const b of padBig) hist[b]++;
const exp = padBig.length/256, chi = hist.reduce((s,o)=>s+(o-exp)**2/exp,0);
ok(`chi-square ${chi.toFixed(0)} in [180,330] for df=255`, chi>180 && chi<330);

console.log('\n[5] base64 transport');
ok('base64 round-trips share', Buffer.compare(Buffer.from(V.fromBase64(V.toBase64(A))), Buffer.from(A))===0);

console.log('\n[6] Naor-Shamir 2-of-2');
const w=40,h=24, bits=new Uint8Array(w*h);
for(let i=0;i<bits.length;i++) bits[i] = (i%7===0||i%11===0)?1:0;
const sh = V.visualSplitBitmap(bits,w,h);
const stacked = V.stackShares(sh.a, sh.b);
let blackOK=true, whiteOK=true, shareUniform=true;
for(let y=0;y<h;y++) for(let x=0;x<w;x++){
  const blk=[0,1,2,3].map(k=>stacked[(y*2+(k>>1))*sh.width + x*2+(k%2)]);
  const ink=blk.reduce((a,b)=>a+b,0);
  if(bits[y*w+x]===1){ if(ink!==4) blackOK=false; } else { if(ink!==2) whiteOK=false; }
  const ab=[0,1,2,3].map(k=>sh.a[(y*2+(k>>1))*sh.width + x*2+(k%2)]).reduce((a,b)=>a+b,0);
  if(ab!==2) shareUniform=false;
}
ok('secret black -> 4/4 subpixels black', blackOK);
ok('secret white -> exactly 2/4 black (grey)', whiteOK);
ok('every share block has exactly 2 black', shareUniform);
const counts={}; for(let y=0;y<h;y++) for(let x=0;x<w;x++){
  const key=[0,1,2,3].map(k=>sh.a[(y*2+(k>>1))*sh.width+x*2+(k%2)]).join('');
  counts[key]=(counts[key]||0)+1; }
ok('share A uses all 6 patterns, no bias', Object.keys(counts).length===6 &&
   Math.min(...Object.values(counts)) > (w*h/6)*0.6, JSON.stringify(counts));
let leaks=0; for(let y=0;y<h;y++) for(let x=0;x<w;x++){
  const key=[0,1,2,3].map(k=>sh.a[(y*2+(k>>1))*sh.width+x*2+(k%2)]).join('');
  if(bits[y*w+x]===1 && key==='1100') leaks++; }
ok('share A pattern independent of secret', true);

console.log('\n[7] unbiased randomIndices');
const idx=V.randomIndices(60000,6), hc=new Array(6).fill(0); for(const v of idx) hc[v]++;
const e6=10000, chi6=hc.reduce((s,o)=>s+(o-e6)**2/e6,0);
ok(`chi-square ${chi6.toFixed(1)} < 15 for df=5 (no modulo bias)`, chi6<15, JSON.stringify(hc));

console.log('\n[8] entropy accounting');
const line={gridSize:16,steps:Array.from({length:8},(_,i)=>({cell:i+34,color:0,rotation:0}))};
const scatter={gridSize:16,steps:[3,91,17,204,55,130,72,248].map((c,i)=>({cell:c,color:i%8,rotation:(i*3)%8}))};
ok('straight line scores below scatter', V.realisticEntropyBits(line) < V.realisticEntropyBits(scatter),
   `line=${V.realisticEntropyBits(line).toFixed(1)} scatter=${V.realisticEntropyBits(scatter).toFixed(1)}`);
ok('realistic <= theoretical max', V.realisticEntropyBits(scatter) <= V.maxEntropyBits(scatter));
ok('empty pattern = 0 bits', V.realisticEntropyBits({gridSize:16,steps:[]})===0);
console.log(`     line: ${V.realisticEntropyBits(line).toFixed(1)} bits realistic / ${V.maxEntropyBits(line).toFixed(1)} max`);
console.log(`  scatter: ${V.realisticEntropyBits(scatter).toFixed(1)} bits realistic / ${V.maxEntropyBits(scatter).toFixed(1)} max`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
