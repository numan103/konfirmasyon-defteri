export const EDU_PLANS = Object.freeze([
  { id: 'video', name: { tr: 'Video Eğitim', en: 'Video Training' }, usd: 50,
    account: { tr: '10K Classic', en: '10K Classic' }, groupMonths: 1, groupLessons: 0, privateLessons: 0 },
  { id: 'live', name: { tr: 'Canlı Grup Eğitimi', en: 'Live Group Training' }, usd: 99,
    account: { tr: '25K Classic', en: '25K Classic' }, groupMonths: 1, groupLessons: 4, privateLessons: 0 },
  { id: 'personal', name: { tr: 'Personal Coaching', en: 'Personal Coaching' }, usd: 250,
    account: { tr: '50K Classic veya onaylı Pro muadili', en: '50K Classic or an approved Pro equivalent' }, groupMonths: 1, groupLessons: 4, privateLessons: 2,
    upgrade: { account: { tr: '100K Classic', en: '100K Classic' }, privateLessons: 4 } },
]);
export const PRIVATE_LESSON_MINUTES = Object.freeze({ min: 90, max: 180 });
export function eduApplicationURL(id, route = 'cash', lang = 'tr') {
  const plan = EDU_PLANS.find(p => p.id === id);
  if (!plan || !['cash', 'breakout', 'breakout100k'].includes(route) || (route === 'breakout100k' && !plan.upgrade)) return null;
  const en = lang === 'en';
  const account = route === 'breakout100k' ? plan.upgrade.account : plan.account;
  const lessonNote = route === 'breakout100k' ? (en ? ' Private lessons: 4 total instead of 2.' : ' Özel ders hakkı: 2 yerine toplam 4 birebir ders.') : '';
  const message = en
    ? 'Hello, I would like to apply for Alfa Edu — ' + plan.name.en + '. ' + (route === 'cash' ? 'Education price: $' + plan.usd + '.' : 'Breakout first-purchase offer: ' + account.en + '.' + lessonNote + ' Partner code: ALFA. Please confirm the referral link and first-purchase eligibility before I buy.')
    : 'Merhaba, Alfa Edu — ' + plan.name.tr + ' paketine başvurmak istiyorum. ' + (route === 'cash' ? 'Eğitim ücreti: ' + plan.usd + ' dolar.' : 'Breakout ilk hesap alımı fırsatı: ' + account.tr + '.' + lessonNote + ' Partner kodu: ALFA. Satın almadan önce referans bağlantısını ve ilk alım uygunluğumu teyit etmek istiyorum.');
  return 'https://t.me/traderahmetd?text=' + encodeURIComponent(message);
}
