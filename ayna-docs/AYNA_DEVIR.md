# AYNA Devir Notu — FAZ 1 Tamamlandı

**Tarih:** 2026-09-20
**Branch:** `ayna`
**Commit:** `ayna: faz 1 - temel`

## Tamamlanan İşler

### Altyapı (BÖLÜM G-H)
- `supabase/ayna/001_schema.sql` — 19 tablo, RLS, trigger'lar, merge fonksiyonu
- `ayna-server/http.mjs` — JSON body parse, error handlers
- `ayna-server/time.mjs` — timestampToDate, now Istanbul
- `ayna-server/supabase.mjs` — createClient, getUser, getProfile
- `ayna-server/anthropic.mjs` — anthropic() wrapper
- `ayna-server/limits.mjs` — canUserProceed, recordUsage
- `api/ayna.mjs` — tek serverless endpoint (POST user + GET cron)

### Aksiyon & Job Dosyaları
- `ayna-server/actions/ping.mjs` — fonksiyonel (role control)
- `ayna-server/actions/scribe.mjs` — stub + runScribe export
- `ayna-server/actions/reflect.mjs` — stub
- `ayna-server/actions/coach.mjs` — stub
- `ayna-server/actions/onboarding-summary.mjs` — stub
- `ayna-server/actions/sync.mjs` — stub + runSync export
- `ayna-server/jobs/daily.mjs`, `weekly.mjs`, `monthly.mjs` — stub'lar

### Prompt & Tools (BÖLÜM I)
- `ayna-server/prompts.mjs` — KOC_TEMEL, TON, MOD, GOREV_*, KATIP, KATIP_TANISMA (birebir)
- `ayna-server/tools.mjs` — 6 tool schema (birebir)

### İstemci Dosyaları (J1-J11)
- `ayna/ayna-i18n.js` — TR+EN tam metinler (K1-K318 arası, birebir)
- `ayna/ayna-core.css` — J11 stilleri (PC=#a5b4fc, dark theme uyumlu)
- `ayna/ayna-core.js` — J1 (Ayna namespace, render, tabs, api, auth, onboarding)
- 6 tab stub: today, map, coach, rules, archive, settings

### Yapılandırma (F4-F7)
- `vercel.json` — functions + crons eklendi
- `.vercelignore` — ayna-docs/ ve supabase/ hariç
- `ayna-docs/AYNA_KURULUM.md` — BÖLÜM N birebir

### index.html (F4)
- `<!-- AYNA:BASLA/BITIR -->` marker'ları eklendi
- CSS linki head'e eklendi
- Desktop nav: `🪞 Ayna` linki eklendi
- Mobile nav: `🪞 Ayna` linki eklendi
- `page-ayna` container eklendi
- showPage: AYNA permission check + render call + pages array'e 'ayna' eklendi
- Script tag'leri eklendi (i18n, core, 6 tab)

## B16 Kontroller
- ✅ Tüm .mjs/.js dosyaları `node --check` geçti
- ✅ Secret taraması temiz
- ✅ High-byte: Yalnızca Türkçe karakterler (beklenen)

## Bir Sonraki Faz
FAZ 2: Bugünün Modülü (J3_today tam implementasyonu)

## Notlar
- `main` branch'e dokunulmadı, tüm work `ayna` branch'inde
- Mevcut CSS/JS dosyalarına dokunulmadı
- sw.js, middleware.js, package.json değişmedi
