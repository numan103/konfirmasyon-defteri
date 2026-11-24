import { emptyDocument } from './alfa-drawings-model.mjs?v=2';
const URL = 'https://fssrtlpjqbavzomynwmg.supabase.co';
const KEY = 'sb_publishable_Zo8BS0jA6f0RBY0DIRUmvg_WsXngIx-';
const AUTH_KEY = 'sb-fssrtlpjqbavzomynwmg-auth-token';
const LEGACY_AUTH_KEY = 'sb-zvnjslmptwmnuhftgqsr-auth-token';
function migrateLegacyAuth() {
  for (const storage of [sessionStorage, localStorage]) {
    try {
      if (!storage.getItem(AUTH_KEY)) {
        const legacy = storage.getItem(LEGACY_AUTH_KEY);
        if (legacy) storage.setItem(AUTH_KEY, legacy);
      }
    } catch {}
  }
}

export class ChartSettingsStore {
  constructor(onStatus, onAccount) { this.onStatus = onStatus; this.onAccount = onAccount || (() => {}); this.user = null; this.client = null; this.pending = new Map(); this.timer = null; }
  async start() {
    try {
      if (!window.supabase?.createClient) await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        script.onload = resolve; script.onerror = reject; document.head.append(script);
      });
      migrateLegacyAuth();
      const storage = sessionStorage.getItem(AUTH_KEY) ? sessionStorage : localStorage;
      this.client = window.supabase.createClient(URL, KEY, { auth: { storage, storageKey: AUTH_KEY, detectSessionInUrl: false } });
      this.subscription = this.client.auth.onAuthStateChange((_e, session) => {
        queueMicrotask(() => this.account(session?.user || null));
      }).data.subscription;
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      this.account(data.session?.user || null);
    } catch { this.onStatus('Oturum alınamadı · yalnızca yerel kayıt'); this.account(null); }
  }
  account(user) {
    if (this.user?.id === user?.id) return;
    // clear pending on user change
    this.pending.clear();
    this.user = user;
    this.onAccount(user);
    this.onStatus(user ? 'Hesap senkronizasyonu hazır' : 'Misafir · yalnızca yerel kayıt');
  }
  isAuthed() { return !!this.user; }
  // One-way read of the old terminal storage mirror. It never writes to
  // journals and refuses any owner that does not match the signed-in user.
  async legacyWatchlist(owner) {
    if (!this.isAuthed()) return null;
    if (owner && owner !== 'guest' && owner !== this.user.id) return null;
    const keys = ['alfa-watchlist', `u:${this.user.id}:alfa-watchlist`, 'alfa-watchlist-favs', `u:${this.user.id}:alfa-watchlist-favs`];
    try {
      const { data, error } = await this.client.from('journals').select('data').eq('user_id', this.user.id).maybeSingle();
      if (error || !data?.data || typeof data.data !== 'object') return null;
      const out = {};
      for (const key of keys) if (data.data[key] != null) out[key] = data.data[key];
      return Object.keys(out).length ? out : null;
    } catch { return null; }
  }
  async load(symbol, timeframe) {
    if (!this.isAuthed()) return null;
    try {
      const { data, error } = await this.client.from('chart_settings').select('settings,revision,updated_at').eq('user_id', this.user.id).eq('symbol', symbol).eq('timeframe', timeframe).maybeSingle();
      if (error) throw error;
      return data ? { settings: data.settings, revision: data.revision, updatedAt: data.updated_at } : null;
    } catch { return null; }
  }
  async save(symbol, timeframe, settings, revision = 0) {
    if (!this.isAuthed()) return { ok: false, offline: true };
    try {
      const row = { user_id: this.user.id, symbol, timeframe, settings, revision: (revision || 0) + 1, updated_at: new Date().toISOString() };
      let query;
      if (revision) {
        query = this.client.from('chart_settings').update(row).eq('user_id', this.user.id).eq('symbol', symbol).eq('timeframe', timeframe).eq('revision', revision);
      } else {
        query = this.client.from('chart_settings').insert(row);
      }
      const { data, error } = await query.select('revision').maybeSingle();
      if (error || !data) throw error || new Error('revision conflict');
      return { ok: true, revision: data.revision };
    } catch (e) {
      return { ok: false, error: e?.message || 'save_failed' };
    }
  }
  dispose() { this.subscription?.unsubscribe(); }
}
