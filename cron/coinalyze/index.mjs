// Gunluk Coinalyze BTC turev ozetini Istanbul 09:00'da tetikler.
// Endpoint ayni gun icin tek mesaj garantisini kendisi verir (edu_shared state).
const TARGET = 'https://alfa-trader.com/api/ai?coinalyze=1';

export default {
  async scheduled(_controller, _env, ctx) {
    ctx.waitUntil(
      fetch(TARGET, {
        method: 'GET',
        headers: { 'x-vercel-cron': '1' },
        signal: AbortSignal.timeout(60000),
      })
        .then(async (res) => {
          const body = await res.text();
          if (!res.ok) console.error('coinalyze cron failed', res.status, body.slice(0, 300));
          else console.log('coinalyze cron ok', res.status, body.slice(0, 200));
        })
        .catch((e) => console.error('coinalyze cron error', e && e.message ? e.message : e)),
    );
  },
};
