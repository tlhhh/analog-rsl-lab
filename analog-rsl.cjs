/* Analog RSL lab — Node.js 18+, no packages, no network. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const HOME = __dirname;
const DATA = path.join(HOME, 'data');
const MODEL = 'educational-cs-v1';
const KP = 200e-6, VTH = 0.45;
const CORNERS = [
  {name:'TT', kp:1, dvth:0},
  {name:'SS-demo', kp:0.85, dvth:0.015},
  {name:'FF-demo', kp:1.15, dvth:-0.015},
];
function rng(seed) { let s=seed>>>0; return () => { s += 0x6D2B79F5; let t=s; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
function normal(r) { return Math.sqrt(-2*Math.log(Math.max(1e-12,r())))*Math.cos(2*Math.PI*r()); }
const sigmoid = x => 1/(1+Math.exp(-x));
const clip = (v,a,b) => Math.max(a,Math.min(b,v));
const mean = xs => xs.reduce((a,b)=>a+b,0)/xs.length;
function baseline() { return {model:MODEL,version:0,mu:[0,0,0,0],sd:[1.5,1.5,1.5,1.5]}; }
function tasks(seed,n) {
  const r=rng(seed);
  return Array.from({length:n},(_,i)=>({id:`${seed}-${i}`,vdd:1.8,gainDb:12+8*r(),bwMHz:1+7*r(),clPf:0.3+1.1*r(),pmaxMw:0.35+0.85*r(),swingV:0.12+0.08*r()}));
}
function validateSpec(s) {
  for (const k of ['vdd','gainDb','bwMHz','clPf','pmaxMw','swingV']) if (!Number.isFinite(s[k]) || s[k]<=0) throw new Error(`Invalid positive specification: ${k}`);
  if(s.vdd<=VTH+0.08 || s.swingV>=s.vdd/2) throw new Error('VDD/headroom specifications are outside this model.');
}
function draw(policy,r) { return policy.mu.map((v,i)=>clip(v+policy.sd[i]*normal(r),-7,7)); }
function decode(z,s) {
  const a=z.map(sigmoid), vov=0.08+0.32*a[0], lUm=0.18+0.82*a[1];
  const drop=(0.25+0.60*a[2])*s.vdd, id=(s.pmaxMw*1e-3/s.vdd)*(0.1+0.90*a[3]);
  const lambda=0.035/lUm, vd=s.vdd-drop;
  const wUm=clip(2*id*lUm/(KP*vov*vov*(1+lambda*vd)),0.3,400);
  return {wUm,lUm,rdOhm:drop/id,vgsV:VTH+vov};
}
// Independent reference evaluator: load-line DC solution, then local gm/gds.
// It does not read policy parameters, training history, or desired output values.
function simulate(d,s,c= CORNERS[0]) {
  const beta=KP*c.kp*d.wUm/d.lUm, ov=Math.max(0,d.vgsV-VTH-c.dvth), lambda=0.035/d.lUm;
  const mos = v => (v>=ov ? 0.5*beta*ov*ov : beta*(ov*v-0.5*v*v))*(1+lambda*v);
  let lo=0,hi=s.vdd;
  for(let i=0;i<44;i++) { const mid=(lo+hi)/2; if(mos(mid)>(s.vdd-mid)/d.rdOhm)hi=mid; else lo=mid; }
  const vd=(lo+hi)/2, id=(s.vdd-vd)/d.rdOhm, sat=vd>=ov && ov>0;
  const gm=sat ? beta*ov*(1+lambda*vd) : beta*vd*(1+lambda*vd);
  const gds=sat ? 0.5*beta*ov*ov*lambda : beta*((ov-vd)*(1+lambda*vd)+(ov*vd-0.5*vd*vd)*lambda);
  const rout=1/(1/d.rdOhm+gds), cout=s.clPf*1e-12+d.wUm*0.55e-15+5e-15;
  return {corner:c.name,vdV:vd,idUa:id*1e6,gmMs:gm*1e3,roKohm:gds>0?1/gds/1e3:null,
    gainDb:20*Math.log10(Math.max(1e-15,gm*rout)),bwMHz:1/(2*Math.PI*rout*cout)/1e6,
    powerMw:s.vdd*id*1e3,swingV:Math.max(0,Math.min(vd-ov,s.vdd-vd)),saturated:sat};
}
function assess(d,s) {
  const corners=CORNERS.map(c=>simulate(d,s,c));
  const worst={gainDb:Math.min(...corners.map(x=>x.gainDb)),bwMHz:Math.min(...corners.map(x=>x.bwMHz)),powerMw:Math.max(...corners.map(x=>x.powerMw)),swingV:Math.min(...corners.map(x=>x.swingV))};
  const violations={gain:Math.max(0,(s.gainDb-worst.gainDb)/6),bandwidth:Math.max(0,s.bwMHz/worst.bwMHz-1),power:Math.max(0,worst.powerMw/s.pmaxMw-1),swing:Math.max(0,s.swingV/Math.max(1e-6,worst.swingV)-1),saturation:corners.every(x=>x.saturated)?0:1};
  const feasible=Object.values(violations).every(x=>x<=1e-9);
  // Small resource cost breaks ties; violations dominate an ordinary design.
  const loss=10*Object.values(violations).reduce((a,v)=>a+Math.min(100,v*v),0)+0.08*worst.powerMw/s.pmaxMw+0.01*d.wUm*d.lUm/400;
  return {loss,feasible,worst,violations,corners};
}
function compare(a,b) { return Number(b.feasible)-Number(a.feasible) || a.loss-b.loss; }
function search(s,policy,budget=32,seed=1) {
  validateSpec(s); if(!Number.isInteger(budget)||budget<1)throw new Error('budget must be a positive integer');
  const r=rng(seed); let best=null;
  for(let i=0;i<budget;i++) { const z=draw(policy,r),design=decode(z,s),a=assess(design,s), item={z,design,...a}; if(!best || compare(item,best)<0)best=item; }
  return best;
}
function evaluate(policy,set,budget=32,seed=771) {
  const results=set.map((s,i)=>search(s,policy,budget,seed+i*97));
  return {tasks:set.length,budget,passRate:mean(results.map(x=>Number(x.feasible))),meanLoss:mean(results.map(x=>x.loss)),results};
}
function propose(policy,set,round) {
  const elite=[];
  for(let i=0;i<set.length;i++) {
    const r=rng(1009+round*100003+i*71),samples=[];
    for(let j=0;j<80;j++) {const z=draw(policy,r); samples.push({z,...assess(decode(z,set[i]),set[i])});}
    samples.sort(compare); elite.push(...samples.slice(0,4));
  }
  const mu=policy.mu.map((v,j)=>0.25*v+0.75*mean(elite.map(x=>x.z[j])));
  const sd=policy.sd.map((v,j)=>clip(0.35*v+0.65*Math.sqrt(mean(elite.map(x=>(x.z[j]-mu[j])**2))),0.18,1.7));
  return {policy:{model:MODEL,version:policy.version+1,mu,sd},elite};
}
function brief(e) {return {tasks:e.tasks,simulationsPerTask:e.budget,passRate:e.passRate,meanLoss:e.meanLoss};}
function save(file,obj) {fs.mkdirSync(DATA,{recursive:true});fs.writeFileSync(path.join(DATA,file),JSON.stringify(obj,null,2)+'\n');}
function loadPolicy() {
  const p=path.join(DATA,'policy.json'); if(!fs.existsSync(p))return baseline();
  const x=JSON.parse(fs.readFileSync(p,'utf8'));
  if(x.model!==MODEL || !Number.isInteger(x.version) || !Array.isArray(x.mu) || !Array.isArray(x.sd) || x.mu.length!==4 || x.sd.length!==4 || !x.mu.every(Number.isFinite) || !x.sd.every(v=>Number.isFinite(v)&&v>0))throw new Error('Invalid policy.json. Back it up and remove it to restart.');
  return x;
}
function train(rounds=10,fromDisk=true) {
  if(!Number.isInteger(rounds)||rounds<1||rounds>100)throw new Error('rounds must be an integer from 1 to 100');
  const training=tasks(1101,28),validation=tasks(2202,24); let policy=fromDisk?loadPolicy():baseline();
  const history=[],memory=[];
  let incumbent=evaluate(policy,validation);
  console.log(`起始策略 v${policy.version} | 验证达标率 ${(incumbent.passRate*100).toFixed(1)}% | 平均损失 ${incumbent.meanLoss.toFixed(4)}`);
  for(let round=1;round<=rounds;round++) {
    const candidate=propose(policy,training,round+policy.version*100),ev=evaluate(candidate.policy,validation);
    const accepted=ev.meanLoss<incumbent.meanLoss*0.99 && ev.passRate>=incumbent.passRate;
    history.push({round,accepted,old:brief(incumbent),candidate:brief(ev),candidatePolicy:candidate.policy});
    memory.push({round,source:'training-only',eliteActionMean:candidate.policy.mu,eliteActionSd:candidate.policy.sd,bestTrainingSamples:candidate.elite.slice(0,20).map((x,i)=>({taskId:training[Math.floor(i/4)].id,z:x.z,loss:x.loss,feasible:x.feasible}))});
    if(accepted){policy=candidate.policy;incumbent=ev;save('policy.json',policy);}
    console.log(`第 ${String(round).padStart(2)} 轮 | 候选达标率 ${(ev.passRate*100).toFixed(1)}% | 损失 ${ev.meanLoss.toFixed(4)} | ${accepted?'晋升策略':'保留原策略'}`);
  }
  // Test tasks are never supplied to propose() or the promotion decision.
  const heldout=tasks(3303,48),before=evaluate(baseline(),heldout),after=evaluate(policy,heldout);
  const report={model:MODEL,createdAt:new Date().toISOString(),policy,training:{seed:1101,tasks:28,candidatesPerTask:80},validation:{seed:2202,tasks:24,budget:32},test:{seed:3303,before:brief(before),after:brief(after)},history,
    caveat:'Analytical educational MOS model; synthetic task families and demonstration corners; no PDK/SPICE/silicon validation. Repeated validation may overfit. Test set must be replaced after tuning based on its results.'};
  save('policy.json',policy);save('training-report.json',report);save('training-memory.json',memory);
  console.log(`\n未参与策略选择的测试集（48 个任务，每个任务同为 32 次评估）`);
  console.log(`初始达标率 ${(before.passRate*100).toFixed(1)}% → 学习后 ${(after.passRate*100).toFixed(1)}%`);
  console.log(`平均损失 ${before.meanLoss.toFixed(4)} → ${after.meanLoss.toFixed(4)}`);
  return report;
}
function netlist(d,s) {
  return `* Educational resistor-loaded common-source amplifier; NOT a foundry PDK\n* Parameter values match the TT DC model; AC parasitics are lumped approximations\nVDD vdd 0 ${s.vdd}\nVIN gate 0 DC ${d.vgsV} AC 1\nRD vdd out ${d.rdOhm}\nM1 out gate 0 0 NDEMO W=${d.wUm}u L=${d.lUm}u\nCOUT out 0 ${s.clPf*1e-12+d.wUm*0.55e-15+5e-15}\n.model NDEMO NMOS (LEVEL=1 VTO=${VTH} KP=${KP} LAMBDA=${0.035/d.lUm})\n.op\n.ac dec 80 1 1G\n.end\n`;
}
const DEFAULT_SPEC={vdd:1.8,gainDb:16,bwMHz:4,clPf:0.8,pmaxMw:0.8,swingV:0.15};
function design(specFile,budget=128) {
  const s=specFile?JSON.parse(fs.readFileSync(path.resolve(specFile),'utf8')):DEFAULT_SPEC;
  const p=loadPolicy(),result=search(s,p,budget,92837),out={model:MODEL,spec:s,policyVersion:p.version,budget,...result};
  save('latest-design.json',out);fs.writeFileSync(path.join(DATA,'latest-design.cir'),netlist(result.design,s));
  console.log(`\n设计策略 v${p.version} | ${result.feasible?'简化模型三个演示角均达标':'当前预算内未找到全部达标的设计'}`);
  const d=result.design,w=result.worst,fmt=x=>Number(x.toPrecision(5));
  console.log(`W=${fmt(d.wUm)} um | L=${fmt(d.lUm)} um | RD=${fmt(d.rdOhm/1e3)} kohm | VGS=${fmt(d.vgsV)} V`);
  console.table([
    {metric:'|Av| (dB)',target:`>= ${s.gainDb}`,worst:fmt(w.gainDb)},
    {metric:'BW (MHz)',target:`>= ${s.bwMHz}`,worst:fmt(w.bwMHz)},
    {metric:'Power (mW)',target:`<= ${s.pmaxMw}`,worst:fmt(w.powerMw)},
    {metric:'Headroom (V)',target:`>= ${s.swingV}`,worst:fmt(w.swingV)},
  ]);
  console.log(`结果：${path.join(DATA,'latest-design.json')}\n演示网表：${path.join(DATA,'latest-design.cir')}`);
  return out;
}
function main() {
  const [cmd='demo',arg]=process.argv.slice(2);
  if(cmd==='demo'){train(10);design();}
  else if(cmd==='fresh-demo'){train(10,false);design();}
  else if(cmd==='train')train(arg===undefined?10:Number(arg));
  else if(cmd==='design')design(arg);
  else if(cmd==='evaluate') { const e=evaluate(loadPolicy(),tasks(4404,48));console.log(JSON.stringify(brief(e),null,2)); }
  else if(cmd==='help')console.log('node analog-rsl.cjs [demo | fresh-demo | train 10 | design spec.json | evaluate | help]\nNo arguments: continue training and design. State is saved in ./data.\nfresh-demo replaces saved policy with a new cold-start run.');
  else throw new Error(`Unknown command: ${cmd}`);
}
module.exports={rng,baseline,tasks,decode,simulate,assess,search,evaluate,propose,train,design,netlist,DEFAULT_SPEC,CORNERS};
if(require.main===module){try{main();}catch(e){console.error('错误：'+e.message);process.exitCode=1;}}
