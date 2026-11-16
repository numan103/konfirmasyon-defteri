import { emptyDocument } from './alfa-drawings-model.mjs?v=2';
const URL = 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const KEY = 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';
const AUTH_KEY = 'sb-zvnjslmptwmnuhftgqsr-auth-token';

export class ChartSettingsStore {
  constructor(onStatus, onAccount) { this.onStatus = onStatus; this.onAccount = onAccount || (() => {}); this.user = null; this.client = null; this.pending = new Map(); this.timer = null; }
  async start() {
    try {
      if (!window.supabase?.createClient) await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        script.onload = resolve; script.onerror = reject; document.head.append(script);
      });
      const storage = sessionStorage.getItem(AUTH_KEY) ? sessionStorage : localStorage;
      this.client = window.supabase.createClient(URL, KEY, { auth: { storage, detectSessionInUrl: false } });
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
