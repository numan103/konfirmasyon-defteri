// Çalıştır: node scripts/verify-influencer-orders.mjs
import { runInfluencerProbe } from '../lib/influencer-order-probe.mjs';

const { ok, checks } = await runInfluencerProbe();
for (const item of checks) console.log((item.ok ? 'OK  ' : 'BAD ') + item.name + ' — ' + item.detail);
if (!ok) {
  console.error('Influencer ödeme ön kontrolleri başarısız.');
  process.exitCode = 1;
} else {
  console.log('Influencer ödeme ön kontrolleri tamamlandı; satın alma/onay akışı birim testinde doğrulanır.');
}
