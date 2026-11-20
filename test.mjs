import fs from 'fs';
import { simulate, recommend, explainFlight, toHHMM } from './engine.js';
const net = JSON.parse(fs.readFileSync('./flight_network.json','utf8'));
let ok = true; const check=(n,c)=>{console.log((c?'PASS':'FAIL')+' '+n); if(!c) ok=false;};

// 1. Baseline = zero disruption
const b = simulate(net,{});
check('baseline 0 delayed', b.summary.delayedFlights===0 && b.summary.cancelledFlights===0);
check('baseline 0 stranded', b.summary.strandedPax===0 && b.summary.missedConnections===0);
check('baseline crews legal', b.crews.every(c=>!c.breach && c.slack>=0));
check('baseline times match schedule', b.flights.every(f=>f.depDelay===0&&f.arrDelay===0));

// 2. Mumbai storm
const sc = { closures:[{airport:'BOM',start:'10:00',end:'11:30'}] };
for (const [s,e] of [['09:00','10:30'],['10:00','11:30'],['12:00','13:30'],['14:00','15:30']]) {
  const r = simulate(net,{closures:[{airport:'BOM',start:s,end:e}]});
  console.log(`BOM ${s}-${e}:`, JSON.stringify(r.summary));
}
const r = simulate(net,sc);
console.log('\nBOM 10:00-11:30 delayed/cancelled flights:');
for (const f of r.flights.filter(f=>f.status!=='on_time'))
  console.log(f.flight_id, f.origin+'-'+f.destination, f.status, f.status==='cancelled'?f.cancelReason:`+${f.arrDelay}m arr`);
const worst = r.flights.filter(f=>f.status==='delayed').sort((a,b)=>b.arrDelay-a.arrDelay)[0];
if (worst) console.log('\nWhy', worst.flight_id, '→', explainFlight(r,worst.flight_id));

// determinism
check('deterministic', JSON.stringify(simulate(net,sc).summary)===JSON.stringify(simulate(net,sc).summary));

// 3. Recovery
const rec = recommend(net,sc);
console.log('\nRecovery plan:', JSON.stringify(rec.plan));
for (const s of rec.steps) console.log(`step${s.step}`, JSON.stringify(s.action), 'cost', s.before.cost,'→',s.after.cost,'stranded',s.before.strandedPax,'→',s.after.strandedPax);
check('recovery never worse', rec.recovered.summary.cost <= rec.baselineDisrupted.summary.cost);
console.log(ok?'\nALL OK':'\nFAILURES');
