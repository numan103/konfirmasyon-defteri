// Yonetici kimligi ve bildirim hedefi.
//
// Onemli: UID, e-posta ve onay/red butonlari GRUBA degil, yoneticinin OZEL
// sohbetine gider. Botun yoneticiye DM atabilmesi icin yonetici botu bir kez
// baslatmis olmalidir.
//
//   TG_ADMIN_CHAT_ID  - (opsiyonel) bildirimlerin gidecegi ozel chat id
//   TG_ADMIN_IDS      - (opsiyonel) yonetici telegram id'leri, virgulle
//   TG_ADMIN_ID       - (eski) tek yonetici id'si
//
// Hicbiri tanimli degilse varsayilan yonetici id'si kullanilir. Bilincli olarak
// TG_CHAT_ID'ye (grup) geri dusme YOKTUR; boylece UID'ler grupta gorunmez.

const DEFAULT_ADMIN_IDS = '5122809433';

export function adminTelegramIds() {
  const raw = process.env.TG_ADMIN_IDS || process.env.TG_ADMIN_ID || DEFAULT_ADMIN_IDS;
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}

export function isAdminTelegram(id) {
  if (id === undefined || id === null) return false;
  return adminTelegramIds().indexOf(String(id)) >= 0;
}

export function adminNotifyChatId() {
  const explicit = (process.env.TG_ADMIN_CHAT_ID || '').trim();
  if (explicit) return explicit;
  const ids = adminTelegramIds();
  return ids.length ? ids[0] : '';
}
