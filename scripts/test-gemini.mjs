// One real end-to-end check of key + model + number validator. Run: npm run test:gemini
import fs from 'node:fs';
import { dispatch } from '../server/dispatcher.js';
const net = JSON.parse(fs.readFileSync(new URL('../flight_network.json', import.meta.url)));
console.log('model:', process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite');
const d = await dispatch(net, { closures: [{ airport: 'BOM', start: '07:00', end: '11:00' }], actions: [] });
console.log('verification:', d.verification);
console.log(d.narrative.headline);
for (const s of d.narrative.steps) console.log(' -', s.action, '|', s.rationale);
console.log(d.narrative.summary);
if (d.verification.source !== 'gemini') console.log('\nNOTE: fell back to template (key/model/network problem or model output rejected).');
