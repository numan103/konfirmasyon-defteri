// Drawing/replay suites exercise bare Spot markets, not the legacy TV migration
// (covered separately). Seed their own isolated browser storage explicitly.
export async function seedBareWatchlist(page) {
  await page.addInitScript(() => {
    if (!/^https?:$/.test(location.protocol)) return;
    if (!localStorage.getItem('alfa-watchlist:v1:guest')) {
      localStorage.setItem('alfa-watchlist:v1:guest', JSON.stringify({
        version: 2, name: 'Spot fixture', symbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT']
      }));
      localStorage.setItem('alfa-watchlist:tv-migrated:v1:guest', '1');
    }
  });
}
