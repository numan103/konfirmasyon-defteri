const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
export const signedR = n => (n > 0 ? '+' : '') + new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(n) + 'R';
export function renderMentorCurve(host, summary) {
  host.replaceChildren();
  host.append(el('span', 'MENTORSHIP · SONUÇLANAN İŞLEMLER', 'mentor-trades-kicker'));
  const headline = el('div', undefined, 'mentor-curve-headline');
  headline.append(el('strong', signedR(summary.netR), summary.netR >= 0 ? 'positive' : 'negative'), el('span', summary.count + ' kayıt · ' + summary.wins + ' artı / ' + summary.losses + ' eksi / ' + summary.flat + ' başa baş'));
  host.append(headline);
  const series = summary.series || [];
  if (series.length) {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 440 160'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Günlük kapanışlarla kümülatif R eğrisi. Başlangıç 0R, son değer ' + signedR(summary.netR));
    svg.classList.add('mentor-curve-svg');
    const values = [0, ...series.map(p => p.cumulativeR)], min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
    const times = series.map(p => Date.parse(p.day + 'T00:00:00+03:00'));
    times.unshift(times[0] - 86400000);
    const x = i => 46 + (times[i] - times[0]) / (times.at(-1) - times[0] || 1) * 382;
    const y = v => 130 - (v - min) / range * 112;
    for (const value of [...new Set([min, 0, max])]) {
      const line = document.createElementNS(ns, 'line');
      for (const [key, val] of Object.entries({ x1: 46, x2: 428, y1: y(value), y2: y(value), stroke: 'currentColor', 'stroke-opacity': value === 0 ? .35 : .12, 'stroke-dasharray': '4 4' })) line.setAttribute(key, String(val));
      const label = document.createElementNS(ns, 'text'); label.setAttribute('x', '1'); label.setAttribute('y', String(y(value) + 4)); label.setAttribute('fill', 'currentColor'); label.setAttribute('font-size', '10'); label.textContent = signedR(value);
      svg.append(line, label);
    }
    const line = document.createElementNS(ns, 'path');
    line.setAttribute('d', values.map((v,i) => (i ? 'L' : 'M') + x(i).toFixed(2) + ',' + y(v).toFixed(2)).join(' '));
    line.setAttribute('fill', 'none'); line.setAttribute('stroke', summary.netR >= 0 ? '#59d6ad' : '#f28a91'); line.setAttribute('stroke-width', '2.5'); line.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(line); host.appendChild(svg);
    const dates = el('div', undefined, 'mentor-curve-dates'); dates.append(el('span', summary.from), el('span', summary.to)); host.appendChild(dates);
  } else host.append(el('p', 'Eşleşmesi teyitli sonuçlar geldikçe eğri oluşacak.'));
  host.append(el('p', 'Günlük kümülatif R · başlangıç 0R · artı, eksi ve başa baş sonuçlar dahil. Yalnızca aktarılan kayıtlar; tam işlem geçmişi veya doğrulanmış getiri değildir.', 'mentor-trades-note'));
}
export function resultTeasers(host, records) {
  host.replaceChildren();
  if (!records.length) { host.append(el('p', 'Henüz yayımlanabilir sonuç yok.')); return; }
  const list = el('div', undefined, 'mentor-results-list');
  for (const record of records.slice(0, 8)) {
    const row = el('div', undefined, 'mentor-result-row');
    row.append(el('b', record.coin), el('span', 'Sonuç'), el('strong', signedR(record.r), record.r >= 0 ? 'positive' : 'negative'),
      el('small', new Date(record.date * 1000).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })));
    list.appendChild(row);
  }
  host.appendChild(list);
}
