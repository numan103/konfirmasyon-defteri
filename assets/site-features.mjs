// Site özellik kayıt defteri.
// "YENİ" rozetlerinin ömrü ve sağ üstteki panel BURADAN yönetilir.
// Yeni bir özellik eklediğinde buraya bir satır ekle: since = yayına girdiği gün.
// since tarihinden itibaren 3 gün rozet görünür, 4. gün otomatik düşer.
// Aynı kayıt sunucu tarafından da okunur; yeni satır Telegram'a bildirilir.

export const NEW_DAYS = 3;

export const FEATURES = [
  // Önceden yayına alınanlar: 3 gün çoktan doldu, rozetleri düşük.
  { id: 'defter', label: 'Check List', desc: 'İşlem öncesi kriterleri puanla, kararını ver.', url: '?page=defter', page: 'defter', icon: '✅', since: '2026-11-01' },
  { id: 'review', label: 'Haftalık Değerlendirme', desc: 'Haftalık RR, eğri ve retrospektif.', url: '?page=review', page: 'review', icon: '📊', since: '2026-11-01' },
  { id: 'pano', label: 'Çalışma Panosu', desc: 'Kişisel beyaz tahta ve not alanı.', url: '?page=pano', page: 'pano', icon: '🛠️', since: '2026-11-01' },
  // Yeni eklenenler: bugünden itibaren 3 gün "YENİ" kalır.
  { id: 'morning-checkin', label: 'Sabah Kartı', desc: 'Açılışta ruh halini 10 saniyede işaretle.', url: '?page=home', page: 'home', icon: '☀️', since: '2026-11-20' },
  { id: 'checkin-config', label: 'Kendi kriterini ekle', desc: 'Karta istediğin soruyu ekle veya çıkar; sorular sana özel kalır.', url: '?page=home', page: 'home', icon: '✎', since: '2026-11-20' },
  { id: 'ayna-sync', label: "Ayna'ya otomatik kayıt", desc: 'Sabah işaretlerin günlük olarak kişisel günlük asistanına işlenir.', url: '?page=ayna', page: 'ayna', icon: '📓', since: '2026-11-20' },
];

export function findFeature(id) {
  return FEATURES.find(f => f && f.id === id) || null;
}

// YYYY-MM-DD ile bugün arasındaki gün farkı (saat farkına takılmaz).
export function dayDiff(since, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(since || ''));
  if (!m) return null;
  const start = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(now);
  const today = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((today - start) / 86400000);
}

export function isNew(feature, now = new Date()) {
  if (!feature) return false;
  const diff = dayDiff(feature.since, now);
  return diff !== null && diff >= 0 && diff < NEW_DAYS;
}

export function isNewId(id, now = new Date()) {
  return isNew(findFeature(id), now);
}

export function activeFeatures(now = new Date()) {
  return FEATURES.filter(f => isNew(f, now));
}

export function activeIds(now = new Date()) {
  return activeFeatures(now).map(f => f.id);
}

if (typeof window !== 'undefined') {
  window.ALFA_SITE_FEATURES = {
    FEATURES, NEW_DAYS,
    findFeature, dayDiff, isNew, isNewId, activeFeatures, activeIds,
  };
  // Kısa takma adlar; dışarıdan kontrol etmek isteyenler için.
  window.ALFA_NEW_FEATURES = FEATURES;
  window.ALFA_NEW_DAYS = NEW_DAYS;
}
