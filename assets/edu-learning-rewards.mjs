export function learningRewards(courses) {
  const completed = new Set(), accessible = new Set(), completedCourses = new Set();
  for (const course of Array.isArray(courses) ? courses : []) {
    const items = Array.isArray(course.items) ? course.items : [];
    for (const item of items) {
      if (!item || item.locked || typeof item.id !== 'string') continue;
      accessible.add(item.id);
      if (item.done === true) completed.add(item.id);
    }
    if (items.length && items.every(item => item && !item.locked && item.done === true)) completedCourses.add(course.id);
  }
  const done = completed.size, finished = completedCourses.size, xp = done * 25 + finished * 100;
  const level = Math.floor(xp / 250) + 1;
  const badges = [
    { id: 'first', icon: '🌱', title: 'İlk Adım', target: 1, value: done, unit: 'ders' },
    { id: 'five', icon: '📚', title: 'Öğrenme Ritmi', target: 5, value: done, unit: 'ders' },
    { id: 'ten', icon: '🎯', title: 'Kararlı Öğrenci', target: 10, value: done, unit: 'ders' },
    { id: 'course', icon: '🏅', title: 'Bölüm Ustası', target: 1, value: finished, unit: 'tam bölüm' },
    { id: 'three', icon: '🏆', title: 'Bilgi Yolcusu', target: 3, value: finished, unit: 'tam bölüm' },
  ].map(b => ({ ...b, earned: b.value >= b.target }));
  return { done, total: accessible.size, finished, xp, level, levelXP: xp % 250, nextLevelXP: 250 - xp % 250, badges };
}
function draw(root, context) {
  if (!root) return;
  root.replaceChildren();
  root.hidden = !context?.account || context.admin || context.page !== 'egitim';
  if (root.hidden) return;
  const reward = learningRewards(context.courses), node = (tag, text, cls) => {
    const el = document.createElement(tag); if (text != null) el.textContent = text; if (cls) el.className = cls; return el;
  };
  const head = node('div', null, 'elr-head');
  const intro = node('div'); intro.append(node('span', 'ALFA EDU · GELİŞİM YOLCULUĞUN', 'daily-kicker'), node('h3', 'Emeklerin birikiyor.'));
  head.append(intro, node('strong', 'Seviye ' + reward.level, 'elr-level')); root.append(head);
  const stats = node('div', null, 'elr-stats');
  for (const [value, label] of [[reward.xp + ' XP', 'Öğrenme puanın'], [reward.done + ' / ' + reward.total, 'Tamamladığın içerikler'], [reward.finished, 'Bitirdiğin bölümler']]) {
    const box = node('div'); box.append(node('b', value), node('span', label)); stats.append(box);
  }
  root.append(stats);
  const bar = document.createElement('progress'); bar.max = 250; bar.value = reward.levelXP; bar.setAttribute('aria-label', 'Bir sonraki seviyeye ilerleme');
  root.append(bar, node('p', 'Bir sonraki seviyeye ' + reward.nextLevelXP + ' XP kaldı. Her tamamlanan içerik +25 XP, eksiksiz bölüm +100 XP.', 'hint'));
  const badges = node('div', null, 'elr-badges');
  for (const badge of reward.badges) {
    const box = node('div', null, 'elr-badge' + (badge.earned ? ' earned' : ''));
    box.append(node('span', badge.icon, 'elr-icon'), node('b', badge.title),
      node('small', badge.earned ? '✓ Kazanıldı' : Math.min(badge.value, badge.target) + ' / ' + badge.target + ' ' + badge.unit));
    badges.append(box);
  }
  root.append(badges);
  const next = reward.badges.find(b => !b.earned);
  root.append(node('p', next ? 'Sıradaki rozet: ' + next.title + ' — ' + (next.target - next.value) + ' ' + next.unit + ' daha tamamla.' : 'Tüm rozetleri kazandın! Öğrendiklerini uygulamaya devam et.', 'elr-next'));
  if (context.continue && !context.preview) {
    const button = node('button', 'Sıradaki derse devam et →', 'btn solid'); button.type = 'button'; button.onclick = context.continue; root.append(button);
  }
  root.append(node('p', 'Puan ve rozetler, bu tarayıcıda kendi hesabınla işaretlediğin tamamlamalara göre hesaplanır. Sembolik öğrenme ödülleridir; ücretli erişim veya sertifika vermez.', 'elr-disclaimer'));
}
if (typeof window !== 'undefined') {
  window.EduLearningRewards = { draw };
  if (typeof window.refreshEduLearningRewards === 'function') window.refreshEduLearningRewards();
}
