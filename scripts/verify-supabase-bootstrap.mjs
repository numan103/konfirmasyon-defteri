// Çalıştır: node scripts/verify-supabase-bootstrap.mjs
// SUPABASE_URL / SUPABASE_PUBLISHABLE / PUBLIC_SITE_URL tanımlıysa onlar kullanılır.
import { runBootstrapProbe } from '../lib/supabase-bootstrap.mjs';

const { ok, checks } = await runBootstrapProbe();
for (const item of checks) console.log((item.ok ? 'OK  ' : 'BAD ') + item.name + ' — ' + item.detail);
if (!ok) {
  console.error('Supabase bootstrap doğrulaması başarısız.');
  process.exitCode = 1;
} else {
  console.log('Supabase bootstrap doğrulaması tamamlandı (secret gösterilmedi).');
}
