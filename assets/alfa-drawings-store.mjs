import { emptyDocument, validateDocument, clone } from './alfa-drawings-model.mjs?v=2';
const URL = 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const KEY = 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';
const AUTH_KEY = 'sb-zvnjslmptwmnuhftgqsr-auth-token';
const prefix = 'alfa-drawings:v1:';
export class DrawingStore {
  constructor(onAccount, onStatus) { this.onAccount = onAccount; this.onStatus = onStatus; this.user = null; this.client = null; this.contexts = new Set(); this.loads = new Map(); }
  async start() {
    try {
      if (!window.supabase?.createClient) await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        script.onload = resolve; script.onerror = reject; document.head.append(script);
      });
      if (this.disposed) return;
      // Match the existing site's "remember me" local/session storage selection.
      const storage = sessionStorage.getItem(AUTH_KEY) ? sessionStorage : localStorage;
      this.client = window.supabase.createClient(URL, KEY, { auth: { storage, detectSessionInUrl: false } });
      this.subscription = this.client.auth.onAuthStateChange((_event, session) => {
        // Never await Supabase calls inside its auth lock.
        queueMicrotask(() => this.account(session?.user || null));
      }).data.subscription;
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      this.account(data.session?.user || null);
    } catch { this.onStatus(null, 'Oturum alınamadı · yalnızca bu tarayıcıda kayıt'); this.account(null); }
  }
  account(user) {
    if (this.disposed) return;
    if (this.initialized && this.user?.id === user?.id) return;
    if (this.user?.id !== user?.id) {
      for (const ctx of this.contexts) clearTimeout(ctx.timer);
      this.contexts.clear();
      this.loads.clear();
    }
    this.initialized = true; this.user = user;
    this.onAccount(user);
  }
  key(ctx) { return prefix + ctx.owner + ':' + ctx.symbol; }
  read(ctx) {
    try {
      const raw = JSON.parse(localStorage.getItem(this.key(ctx)) || 'null');
      if (raw) return { ...raw, doc: validateDocument(raw.doc) };
    } catch { /* Broken local data is never uploaded. */ }
    return null;
  }
  cache(ctx, doc, dirty) {
    try { localStorage.setItem(this.key(ctx), JSON.stringify({ doc, dirty, revision: ctx.revision })); return true; }
    catch { this.onStatus(ctx, 'Tarayıcı kaydı başarısız · depolama dolu/kapalı'); return false; }
  }
  async load(symbol) {
    const key = (this.user?.id || 'guest') + ':' + symbol;
    if (this.loads.has(key)) return this.loads.get(key);
    const pending = this.loadContext(symbol); this.loads.set(key, pending);
    try { return await pending; } finally { this.loads.delete(key); }
  }
  async loadContext(symbol) {
    const existing = [...this.contexts].find(c => c.owner === (this.user?.id || 'guest') && c.symbol === symbol && c.loaded);
    if (existing) {
      this.onStatus(existing, existing.blocked ? 'Bulut erişilemiyor/çakıştı · yerel yedek korunuyor' : existing.remote ? 'Hesap çizimleri · yerel çalışma kopyası' : 'Misafir · bu tarayıcıdaki çizimler');
      return existing;
    }
    const ctx = { symbol, owner: this.user?.id || 'guest', revision: 0, blocked: false, remote: !!this.user, timer: null };
    this.contexts.add(ctx);
    const local = this.read(ctx);
    ctx.revision = local?.revision || 0;
    ctx.doc = local?.doc || emptyDocument();
    if (!ctx.remote) {
      ctx.loaded = true;
      this.onStatus(ctx, 'Misafir · yalnızca bu tarayıcıda kayıt. Hesap için siteden giriş yapın.');
      return ctx;
    }
    try {
      const { data, error } = await this.client.from('chart_drawings').select('document,revision').eq('user_id', ctx.owner).eq('symbol', symbol).maybeSingle();
      if (error) throw error;
      const revision = data?.revision || 0;
      if (local?.dirty && ctx.revision !== revision) {
        ctx.blocked = true;
        this.onStatus(ctx, 'Kayıt çakışması · yerel çizimler korundu; buluta yazılmadı. JSON dışa aktarın.');
      } else {
        ctx.revision = revision;
        ctx.doc = local?.dirty ? local.doc : (data ? validateDocument(data.document) : emptyDocument());
        this.cache(ctx, ctx.doc, !!local?.dirty);
        this.onStatus(ctx, local?.dirty ? 'Yerel değişiklikler buluta gönderilecek' : 'Hesap çizimleri yüklendi');
        if (local?.dirty) this.save(ctx, ctx.doc);
      }
    } catch {
      ctx.blocked = true;
      this.onStatus(ctx, 'Bulut erişilemiyor · yerel kayıt etkin; veritabanı/bağlantıyı kontrol edin');
    }
    ctx.loaded = true;
    return ctx;
  }
  save(ctx, doc) {
    ctx.doc = validateDocument(doc);
    const cached = this.cache(ctx, ctx.doc, ctx.remote);
    if (!ctx.remote) { if (cached) this.onStatus(ctx, 'Misafir çizimleri bu tarayıcıya kaydedildi'); return; }
    if (ctx.blocked) return;
    this.onStatus(ctx, 'Kaydediliyor…');
    clearTimeout(ctx.timer);
    ctx.timer = setTimeout(() => this.flush(ctx), 500);
  }
  async retry(ctx) {
    if (!ctx?.remote || this.user?.id !== ctx.owner || ctx.saving) return;
    try {
      const { data, error } = await this.client.from('chart_drawings').select('revision').eq('user_id', ctx.owner).eq('symbol', ctx.symbol).maybeSingle();
      if (error) throw error;
      if ((data?.revision || 0) !== ctx.revision) {
        this.onStatus(ctx, 'Bulutta farklı sürüm var · otomatik üzerine yazılmadı. Önce JSON yedeği alın.');
        return;
      }
      ctx.blocked = false;
      this.save(ctx, ctx.doc);
    } catch { this.onStatus(ctx, 'Bulut hâlâ erişilemiyor · yerel çizimler korundu'); }
  }
  async flush(ctx) {
    if (ctx.saving || ctx.blocked || this.user?.id !== ctx.owner) return;
    ctx.saving = true;
    const doc = clone(ctx.doc), revision = ctx.revision;
    try {
      const row = { user_id: ctx.owner, symbol: ctx.symbol, document: doc, revision: revision + 1, updated_at: new Date().toISOString() };
      const query = revision
        ? this.client.from('chart_drawings').update(row).eq('user_id', ctx.owner).eq('symbol', ctx.symbol).eq('revision', revision)
        : this.client.from('chart_drawings').insert(row);
      const { data, error } = await query.select('revision').maybeSingle();
      if (error || !data) throw error || new Error('revision conflict');
      ctx.revision = data.revision;
      const dirty = JSON.stringify(ctx.doc) !== JSON.stringify(doc);
      const cached = this.cache(ctx, ctx.doc, dirty);
      if (!dirty) this.onStatus(ctx, cached ? 'Hesabınıza kaydedildi' : 'Buluta kaydedildi · yerel yedek alınamadı');
    } catch {
      ctx.blocked = true; this.onStatus(ctx, 'Bulut kaydı başarısız/çakıştı · yerel yedek korundu; JSON dışa aktarın');
    } finally {
      ctx.saving = false;
      if (!ctx.blocked && JSON.stringify(ctx.doc) !== JSON.stringify(doc)) this.flush(ctx);
    }
  }
  dispose() {
    this.disposed = true;
    this.subscription?.unsubscribe();
    for (const ctx of this.contexts) clearTimeout(ctx.timer);
  }
}
