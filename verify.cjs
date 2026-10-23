'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const m=require('./analog-rsl.cjs');
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
check('TT DC operating point agrees with the closed-form saturation solution',()=>{
  const s=m.DEFAULT_SPEC,d={wUm:8,lUm:0.5,rdOhm:8000,vgsV:0.65};
  const a=m.simulate(d,s),k=0.5*200e-6*d.wUm/d.lUm*(d.vgsV-0.45)**2;
  const vd=(s.vdd-k*d.rdOhm)/(1+k*d.rdOhm*(0.035/d.lUm));
  assert(a.saturated);assert(Math.abs(a.vdV-vd)<1e-10);
  assert(Math.abs(a.idUa*1e-6-(s.vdd-vd)/d.rdOhm)<1e-12);
});
check('Gain agrees with a numerical DC transfer derivative',()=>{
  const s=m.DEFAULT_SPEC,d={wUm:8,lUm:0.5,rdOhm:8000,vgsV:0.65},h=1e-5;
  const a=m.simulate(d,s),hi=m.simulate({...d,vgsV:d.vgsV+h},s),lo=m.simulate({...d,vgsV:d.vgsV-h},s);
  const num=Math.abs((hi.vdV-lo.vdV)/(2*h)),analytic=10**(a.gainDb/20);
  assert(Math.abs(num/analytic-1)<1e-6);
});
check('More output capacitance lowers the pole, with DC unchanged',()=>{
  const s=m.DEFAULT_SPEC,d=m.decode([0,0,0,0],s),a=m.simulate(d,s),b=m.simulate(d,{...s,clPf:s.clPf*2});
  assert(b.bwMHz<a.bwMHz);assert.equal(a.idUa,b.idUa);assert.equal(a.gainDb,b.gainDb);
});
check('Triode operating points fail saturation and headroom requirements',()=>{
  const a=m.assess({wUm:100,lUm:0.18,rdOhm:100000,vgsV:0.8},m.DEFAULT_SPEC);
  assert(!a.feasible);assert(a.violations.saturation>0);assert.equal(a.worst.swingV,0);
});
check('Impossible targets are not labeled as success',()=>{
  assert(!m.search({...m.DEFAULT_SPEC,gainDb:100,bwMHz:1e6},m.baseline(),32).feasible);
});
check('Identical seeds and simulation budgets reproduce results',()=>{
  assert.deepEqual(m.evaluate(m.baseline(),m.tasks(555,5),8),m.evaluate(m.baseline(),m.tasks(555,5),8));
  assert.throws(()=>m.search(m.DEFAULT_SPEC,m.baseline(),0));
  assert.throws(()=>m.search({...m.DEFAULT_SPEC,clPf:-1},m.baseline()));
});
check('Every promoted strategy passed both validation conditions',()=>{
  // Verify the archived cold-start experiment, without changing a user's learned state.
  const report=JSON.parse(fs.readFileSync(path.join(__dirname,'examples','training-report.json'),'utf8'));
  assert(report.history.some(x=>x.accepted));
  for(const h of report.history.filter(x=>x.accepted)){
    assert(h.candidate.meanLoss<h.old.meanLoss*0.99);
    assert(h.candidate.passRate>=h.old.passRate);
  }
  assert.equal(report.test.before.simulationsPerTask,report.test.after.simulationsPerTask);
  assert.notEqual(report.training.seed,report.test.seed);assert.notEqual(report.validation.seed,report.test.seed);
});
check('Archived first update is reproducible from the source and training seed',()=>{
  const report=JSON.parse(fs.readFileSync(path.join(__dirname,'examples','training-report.json'),'utf8'));
  const candidate=m.propose(m.baseline(),m.tasks(report.training.seed,report.training.tasks),1).policy;
  assert.deepEqual(candidate,report.history[0].candidatePolicy);
  const ev=m.evaluate(candidate,m.tasks(report.validation.seed,report.validation.tasks));
  assert.equal(ev.passRate,report.history[0].candidate.passRate);
  assert.equal(ev.meanLoss,report.history[0].candidate.meanLoss);
});
console.log(`${checks} verification checks passed.`);
