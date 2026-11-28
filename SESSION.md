# Ortak oturum rehberi

Bu repo’daki **üç oturum da aynı klasörde** çalışır:
`C:\Users\Pc\.local\share\opencode\worktree\345b6f\web-controls-sprint`

Yani hangi oturumda değişiklik yapılırsa yapılsın, dosyalar **anında ortaktır**. Ayrı worktree / ayrı branch yok, elle senkron gerekmez.

## Oturumlar

| Sekme | Kapsam |
|---|---|
| **Other tasks / Coinalyze** | Günlük Coinalyze postu, schedule, deploy, genel işler |
| **Alfa Charts Web** | Desktop / tablet: grafikler, indicator/pane, workspace, explorer, watchlist, range menüleri |
| **Alfa Charts Mobil** | Telefon / landscape / touch: FAB, tool sheet, carousel, swipe, PWA/share/alarm |

## Paralel çalışma (beklemeye gerek yok)

Üç seans aynı anda çalışabilir. Dosyalar zaten **anında ortak**; birinin değiştirdiği dosyayı diğeri hemen görür. “İş bitsin, sonra güncellensin” diye bir adım yok.

Tek risk: **iki seans aynı dosyaya aynı anda yazarsa** son yazan kazanır. Bunu önlemek için dosya sahipliği:

| Seans | Sahip olduğu dosyalar |
|---|---|
| Web | `assets/alfa-charts.css`, `assets/alfa-charts.mjs`, desktop/indicator/workspace/explorer/pane dosyaları, `tests/browser/*web*` |
| Mobil | `assets/alfa-charts-mobile.css`, `assets/alfa-charts-mobile.mjs`, FAB/carousel/touch dosyaları, `tests/*mobile*` |
| Coinalyze | `lib/coinalyze*.mjs`, `cron/coinalyze/*`, `vercel.json`, `docs/coinalyze-daily.md` |

`alfa-charts.html`, `docs/alfa-qa-*.md`, `package.json` gibi ortak dosyalarda değişiklik yapmadan önce `.session-claim` dosyasına seans adını yaz; iş bitince sil. Başka seansın claim’i duruyorsa o dosyaya dokunma, kendi kapsamındaki işe devam et. Böylece hiçbir seans diğerinin işini bozmaz.

Kural (kısa):
1. Web telefon davranışını, mobil desktop davranışını değiştirmez.
2. Her iş sonunda commit at; geçmiş ortaklaşır.
3. Telegram’a yeniden gönderim yapılmaz; kullanıcı açıkça istemedikçe dokunulmaz.

Kök `AGENTS.md`, `docs/alfa-qa-invariants.md` ve `docs/alfa-qa-agent-playbook.md` bağlayıcıdır. Not: bu çalışma modunda kullanıcı ayrı worktree istemediği için aynı klasör + dosya sahipliği kullanılıyor.
