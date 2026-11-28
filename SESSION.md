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

## Kural (çok kısa)

1. Web oturumu telefon davranışını, mobil oturum desktop davranışını değiştirmez.
2. Ortak bir dosyaya (`alfa-charts.html`, `assets/*`, `lib/*`) dokunacaksan önce `git status` ile bak; başka oturumdan yarım iş kalmış olabilir.
3. İş bitince commit at; böylece diğer oturumlar da aynı commit’i görür.
4. Telegram’a yeniden gönderim yapılmaz; kullanıcı açıkça istemedikçe dokunulmaz.

Kök `AGENTS.md`, `docs/alfa-qa-invariants.md` ve `docs/alfa-qa-agent-playbook.md` bağlayıcıdır.
