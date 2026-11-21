// Telegram splits long pastes into ~4096-character messages. Reunite only
// adjacent continuations of an explicitly labelled Alfa Edu article.
export const MAX_ARTICLE_CHARS = 200000;
export function isEducationArticle(entry) {
  return entry?.education === true || /^\s*#?\s*(?:alfa[\s_-]*edu|eğitim|egitim)\b/iu.test(String(entry?.body || entry?.title || ''));
}
function messageNumber(entry) {
  const match = String(entry?.sourceLink || '').match(/^https:\/\/t\.me\/alfakasim\/977\/(\d+)$/);
  return match ? Number(match[1]) : null;
}
export function groupMagazineArticles(input) {
  const list = (Array.isArray(input) ? input : []).filter(Boolean).slice().sort((a, b) =>
    Date.parse(a.publishedAt) - Date.parse(b.publishedAt) || (messageNumber(a) || 0) - (messageNumber(b) || 0));
  const result = [];
  for (let i = 0; i < list.length; i++) {
    const first = list[i];
    if (first.sourceParts?.length > 1 || !isEducationArticle(first)) { result.push({ ...first, education: isEducationArticle(first) }); continue; }
    const parts = [first];
    while (i + 1 < list.length && parts.length < 50) {
      const previous = parts.at(-1), next = list[i + 1];
      const delta = Date.parse(next.publishedAt) - Date.parse(first.publishedAt);
      const continuation = previous.body?.length >= 3500 && /^\s*[\p{Ll}\d(–—-]/u.test(String(next.body || ''));
      if (messageNumber(next) !== messageNumber(previous) + 1 || delta < 0 || delta > 5000 ||
          next.authorId !== first.authorId || isEducationArticle(next) || !continuation) break;
      if (parts.reduce((sum, p) => sum + String(p.body || '').length + 2, 0) + String(next.body || '').length > MAX_ARTICLE_CHARS) break;
      parts.push(next); i++;
    }
    const merged = { ...first, education: true,
      body: parts.map(p => String(p.body || '')).join('\n\n'),
      images: [...new Set(parts.flatMap(p => p.images || []))].slice(0, 24),
      sourceParts: parts.map(p => ({ id: p.id, sourceLink: p.sourceLink })),
      title: String(first.body || '').split(/\r?\n/).map(s => s.trim()).find(s => s && !/^#?\s*alfa[\s_-]*edu\s*$/iu.test(s))?.slice(0, 200) || first.title
    };
    // Telegram often follows a long paste with the same text as a PDF document.
    // Keep it attached to the article instead of showing a second, empty card.
    const candidate = list[i + 1];
    if (parts.length > 1 && candidate && !merged.pdf && isEducationArticle(candidate) &&
        messageNumber(candidate) === messageNumber(parts.at(-1)) + 1 &&
        candidate.authorId === first.authorId &&
        Date.parse(candidate.publishedAt) - Date.parse(first.publishedAt) <= 10 * 60000 &&
        String(candidate.body || '').length <= 300 && !(candidate.images || []).length) {
      if (candidate.pdf) merged.pdf = candidate.pdf;
      else if (/^https:\/\/t\.me\/alfakasim\/977\/\d+$/.test(candidate.sourceLink || '')) {
        merged.pdfLink = candidate.sourceLink;
        merged.pdfName = String(candidate.title || 'Eğitim PDF’si').slice(0, 160);
      }
      i++;
    }
    result.push(merged);
  }
  return result;
}
if (typeof window !== 'undefined') window.AlfaMagazineArticles = { group: groupMagazineArticles, isEducationArticle };
