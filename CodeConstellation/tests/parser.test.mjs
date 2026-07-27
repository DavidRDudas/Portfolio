/**
 * Tests for the Code Constellation parser.
 *
 *     node CodeConstellation/tests/parser.test.mjs
 *
 * No dependencies. The parser is DOM-free by design so it can be checked here
 * rather than only through the canvas.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(root, 'code-parser.js'), 'utf8'))();
const P = globalThis.CodeParser;

let pass=0, fail=0;
const ok=(n,c,x='')=>c?(pass++,console.log('  PASS',n)):(fail++,console.log('  FAIL',n,x));

console.log('[1] literals are blanked, offsets preserved');
const lit = 'const a = "if (x) { y }"; // while (true) {\nconst b = /}{[/]/g; const c = `a${ 1+1 }b`;';
const cl = P.blankLiterals(lit);
ok('same length', cl.length === lit.length);
ok('same line count', cl.split('\n').length === lit.split('\n').length);
ok('braces inside a string do not leak', (cl.match(/\{/g)||[]).length === 1, JSON.stringify(cl));
ok('"if" inside a string is not counted', P.complexityOf(cl) === 1, 'got '+P.complexityOf(cl));
ok('comment content gone', !cl.includes('while'));
ok('template interpolation still visible as code', cl.includes('1+1'));

console.log('\n[2] the case the old parser got wrong');
// The exact shape the previous regex parser mangled: a body containing a
// nested block, and a body containing an object literal.
const old = `function calculateDistance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    return Math.sqrt(dx * dx);
}

function moveObject(obj) {
    let speed = calculateDistance(0, 0, obj.x, obj.y);
    while (speed > 0) {
        obj.x += speed;
        speed--;
    }
}

function gameLoop() {
    const player = { x: 0, y: 0 };
    moveObject(player);
    let distance = calculateDistance(player.x, player.y, 100, 100);
}`;
const r = P.analyze(old);
const move = r.functions.find(f=>f.name==='moveObject');
const loop = r.functions.find(f=>f.name==='gameLoop');
ok('moveObject body includes the whole while loop', move.body.includes('speed--'), move.body);
ok('gameLoop body not truncated at the object literal', loop.body.includes('calculateDistance'));
ok('moveObject complexity counts the loop', move.complexity === 2, 'got '+move.complexity);
ok('call edges found', r.edges.length >= 3, JSON.stringify(r.edges));
ok('calculateDistance has 2 callers', r.functions.find(f=>f.name==='calculateDistance').fanIn === 2);
ok('gameLoop is an entry point (calls others, nothing calls it)', r.stats.entryPoints.some(f=>f.name==='gameLoop'));

console.log('\n[3] modern syntax the old parser ignored entirely');
const modern = `
const add = (a, b) => a + b;
const double = n => n * 2;
async function fetchAll(urls) {
  for (const u of urls) { if (u) { await fetch(u); } }
}
class Repo {
  constructor(db) { this.db = db; }
  async find(id) { return this.db.get(id); }
  static create() { return new Repo(null); }
  get size() { return 1; }
}
function* gen() { yield 1; }
function outer() {
  function inner() { return add(1,2); }
  return inner();
}
function fact(n) { return n <= 1 ? 1 : n * fact(n - 1); }
function ping(n){ return n>0 ? pong(n-1) : 0; }
function pong(n){ return ping(n-1); }
`;
const M = P.analyze(modern);
const names = M.functions.map(f=>f.name);
for (const n of ['add','double','fetchAll','Repo','constructor','find','create','size','gen','outer','inner','fact','ping','pong'])
  ok(`finds ${n}`, names.includes(n), names.join(','));
ok('arrow kind tagged', M.functions.find(f=>f.name==='add').kind === 'arrow');
ok('method tagged with class', M.functions.find(f=>f.name==='find').className === 'Repo');
ok('async detected', M.functions.find(f=>f.name==='fetchAll').isAsync === true);
ok('static detected', M.functions.find(f=>f.name==='create').isStatic === true);
ok('generator detected', M.functions.find(f=>f.name==='gen').isGenerator === true);
ok('nested fn gets a parent', M.functions.find(f=>f.name==='inner').parent === M.functions.find(f=>f.name==='outer').id);
ok('self-recursion flagged', M.functions.find(f=>f.name==='fact').recursive === true);
ok('mutual recursion -> binary pair', M.binaryPairs.length === 1, JSON.stringify(M.binaryPairs));
ok('fetchAll complexity counts for+if', M.functions.find(f=>f.name==='fetchAll').complexity === 3,
   'got '+M.functions.find(f=>f.name==='fetchAll').complexity);
ok('nesting depth measured', M.functions.find(f=>f.name==='fetchAll').maxDepth === 3,
   'got '+M.functions.find(f=>f.name==='fetchAll').maxDepth);

console.log('\n[3b] entry point vs dead code');
const cls = P.analyze(`
function main(){ return helper(); }
function helper(){ return 1; }
function neverUsed(){ return 42; }
class Thing { constructor(){ this.a = 1; } run(){ return helper(); } get size(){ return 2; } }
`);
const byName = n => cls.functions.find(f => f.name === n);
ok('entry point: calls others, nothing calls it', byName('main').isEntryPoint === true);
ok('entry point is not dead code', byName('main').isDeadCode === false);
ok('dead code: calls nothing, called by nothing', byName('neverUsed').isDeadCode === true);
ok('called function is neither', byName('helper').isDeadCode === false && byName('helper').isEntryPoint === false);
ok('constructor never counted as dead', byName('constructor').isDeadCode === false, 'new Foo() invokes it without naming it');
ok('constructor never counted as an entry point', byName('constructor').isEntryPoint === false);
ok('getter never counted as dead', byName('size').isDeadCode === false);
ok('stats.deadCode lists only neverUsed',
   cls.stats.deadCode.length === 1 && cls.stats.deadCode[0].name === 'neverUsed',
   cls.stats.deadCode.map(f=>f.name).join(','));

console.log('\n[4] robustness');
ok('empty input', P.analyze('').functions.length === 0);
ok('unterminated string does not hang', P.analyze('const a = "oops').functions.length === 0);
ok('unbalanced brace does not hang', P.analyze('function f() { if (a) {').functions.length >= 0);
ok('division is not mistaken for regex', P.analyze('function f(){ return a / b / c; }').functions.length === 1);
const big = 'function f0(){return 1;}\n' + Array.from({length:400},(_,i)=>`function f${i+1}(){ return f${i}() + 1; }`).join('\n');
const t0 = Date.now(); const B = P.analyze(big); const ms = Date.now()-t0;
ok(`400 functions parsed in ${ms}ms`, B.functions.length === 401 && ms < 3000);
ok('long chain computed', B.stats.longestChain === 401, 'got '+B.stats.longestChain);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
