// Lists every model your API key can call with generateContent. Run: npm run models
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('GEMINI_API_KEY missing (run via: npm run models)'); process.exit(1); }
let url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', all = [];
while (url) {
  const r = await fetch(url, { headers: { 'x-goog-api-key': key } });
  if (!r.ok) { console.error('HTTP', r.status, await r.text()); process.exit(1); }
  const d = await r.json(); all = all.concat(d.models || []);
  url = d.nextPageToken ? `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&pageToken=${d.nextPageToken}` : null;
}
const ok = all.filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'));
console.log(`${ok.length} usable models. Put one name in .env as GEMINI_MODEL=<name>:\n`);
for (const m of ok) console.log(m.name.replace('models/', '').padEnd(42), (m.displayName || ''));
