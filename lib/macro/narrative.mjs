import { istanbul, verifiedDate } from './core.mjs';

function realYieldDirection(sources, cutoff) {
  const s = sources.find(s => s.instrument === 'real_yield' && s.comparisonDirection);
  if (!s) return null;
  const current = Number(s.currentTenYearValue), previous = Number(s.previousTenYearValue);
  if (!/^-?\d+(?:\.\d+)?$/.test(s.currentTenYearValue || '') || !/^-?\d+(?:\.\d+)?$/.test(s.previousTenYearValue || '') || !verifiedDate(s.observedAt) || !verifiedDate(s.previousObservedAt) || Date.parse(s.observedAt) > Date.parse(cutoff) || Date.parse(s.previousObservedAt) >= Date.parse(s.observedAt) || s.comparisonDirection !== (current > previous ? 'increase' : current < previous ? 'decrease' : 'unchanged')) throw new Error('report_invalid_observation');
  return s.comparisonDirection;
}

// Presentation only: facts and event times have already passed the report
// validator. Original sources remain in private report metadata, not the message.
// Causal polarity stays application-owned rather than model-generated.
export function analystNarrative({ cutoff, developments, sources, events, electionStage, freshNewsCount }) {
  const direction = realYieldDirection(sources, cutoff);
  const labour = sources.some(s => s.topic === 'employment');
  const reference = sources.some(s => s.referencePeriod);
  const introduction = developments.join(' ');
  const policyBase = labour
    ? 'İşgücü piyasasındaki değişim, para politikasının ne kadar süre sıkı kalabileceği açısından önemli. Güçlü istihdam büyüme endişelerini azaltabilir; ancak enflasyon baskısı sürüyorsa faiz indirimi beklentilerini de sınırlayabilir. Bu nedenle iyi bir ekonomik veri, riskli varlıklar için her zaman iyi haber anlamına gelmez.'
    : 'Bu gelişmelerin fiyatlara etkisi, büyüme görünümü kadar para politikasının nasıl şekilleneceğine de bağlı. Ekonomiyi destekleyen bir açıklama risk iştahını artırabilir; fakat aynı anda faizlerin daha uzun süre yüksek kalacağı düşüncesini güçlendiriyorsa bu etki dengelenebilir. Haber ile piyasa sonucu arasında otomatik bir bağ kurmak doğru olmaz.';
  const policy = policyBase;
  const btc = 'BTC açısından belirleyici ayrım, büyüme iyimserliğinin mi yoksa finansal koşullardaki sıkılaşmanın mı ağır basacağı. Dolar ve getiriler birlikte yükselirse sermayenin riskli varlıklara yönelmesi zorlaşabilir. Buna karşılık faiz baskısının azalması ve likidite koşullarının gevşemesi daha destekleyici bir zemin oluşturabilir. Bunun kalıcı bir eğilime dönüşmesi için yalnız fiyat hareketinin değil, bu koşulların da aynı yönde ilerlemesi gerekir; doların yeniden güçlenmesi olumlu senaryoyu zayıflatır. İlk tepkiyle kalıcı fiyatlamayı ayırmak gerekiyor. Bir verinin ardından görülen hareket, diğer göstergeler tarafından desteklenmiyorsa hızla tersine dönebilir. Daha sağlam bir değerlendirme, büyüme, enflasyon ve finansal koşulların birlikte izlenmesini gerektirir; tek bir başlığın bütün resmi açıkladığını varsaymak yanıltıcı olur.';
  const goldLead = direction === 'increase'
    ? 'Son karşılaştırmada reel getirinin yükselmesi, faiz getirisi olmayan spot altının fırsat maliyetini artıran bir unsur.'
    : direction === 'decrease'
      ? 'Son karşılaştırmada reel getirinin gerilemesi, faiz getirisi olmayan spot altının fırsat maliyetini azaltan bir unsur.'
      : direction === 'unchanged'
        ? 'Son karşılaştırmada reel getiri değişmediği için bu kanaldan yeni bir yön sinyali çıkarmak güç.'
        : 'Spot altında asıl ayrım nominal faizden çok reel faizin ve doların birlikte nasıl hareket ettiği.';
  const gold = goldLead + ' Bununla birlikte doların seyri ve güvenli liman talebi sonucu değiştirebilir. Belirsizliğin artması altına talep yaratabilir; risk iştahının güçlenmesi ise otomatik olarak destek sayılmaz. Reel faiz ve doların birlikte gerilemesi daha olumlu, ikisinin birlikte güçlenmesi daha baskılayıcı bir ortam oluşturabilir. Bu çerçeve koşulludur; gerçekleşmiş fiyat tepkisi veya kesin yön tahmini değildir.';
  const flow = sources.find(s => s.flowType === 'spot_btc_etf_net_flows');
  const etf = flow
    ? 'ETF tarafındaki akış ölçümü sınırlı bir fon kümesini kapsadığı için bütün piyasanın talebiyle aynı şey değildir.'
    : 'Net ETF akışları doğrulanmadığından kurumsal talebin arttığını ya da azaldığını söylemek için yeterli dayanak yok.';
  const election = electionStage === 'unknown' || electionStage === 'preliminary'
    ? 'Seçimlerde ülke genelinde kesinleşmiş sonuç teyidi bulunmadığından politika etkileri hakkında da kesin hüküm kurmuyorum.'
    : 'Seçim başlığındaki değerlendirme, doğrulanan sonuç aşaması ve coğrafi kapsamla sınırlı tutuluyor; olası politika adımları gerçekleşmiş kabul edilmiyor.';
  const calendar = events.length
    ? 'Yakın takvimde ' + events.map(e => istanbul(e.at) + ' Türkiye saatiyle ' + e.title).join('; ') + ' izleniyor; öncesindeki kısa fiyat tepkisi ile haftalık politika etkisi ayrılmalı.'
    : 'Önümüzdeki iki gün için saati teyit edilmiş kritik bir olay bulunmaması, takvimin risksiz olduğu anlamına gelmiyor.';
  const caveat = reference
    ? 'Aylık karşılaştırmalar referans dönemini anlatıyor; açıklanma saati veya beklentiye göre sürpriz ölçümü yerine geçmiyor.'
    : 'Piyasa beklentisi ve doğrudan fiyat tepkisi ayrıca doğrulanmadıkça verinin sürpriz yarattığı söylenemez.';
  const freshness = freshNewsCount === 0 ? 'Bu kesit yeni haberden çok mevcut verilerin güncel değerlendirmesidir. ' : '';
  return ['ALFA MAKRO', istanbul(cutoff) + ' · Türkiye saati', '', introduction + ' ' + policy, '', btc, '', gold, '', etf + ' ' + election + ' ' + freshness + calendar + ' ' + caveat + ' Genel dengeyi değiştirecek unsur, dolar ve reel faizlerdeki hareketin sürekliliği olacaktır. Bu değerlendirme teknik giriş veya pozisyon açma sinyali değildir.'].join('\n');
}
