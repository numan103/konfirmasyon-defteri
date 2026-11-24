import { emptyDocument } from './alfa-drawings-model.mjs?v=2';
const URL = 'https://fssrtlpjqbavzomynwmg.supabase.co';
const KEY = 'sb_publishable_Zo8BS0jA6f0RBY0DIRUmvg_WsXngIx-';
const AUTH_KEY = 'sb-fssrtlpjqbavzomynwmg-auth-token';
const LEGACY_AUTH_KEY = 'sb-zvnjslmptwmnuhftgqsr-auth-token';
// A conflict is not permission to overwrite either copy. Keep an owner/context
// scoped local recovery until the user explicitly reconciles the two versions.
export function settingsConflictKey(owner, symbol, timeframe) {
  return `alfa-chart-settings-conflict:v1:${owner}:${symbol}:${timeframe}`;
}
export function readSettingsConflict(storage, owner, symbol, timeframe) {
  try {
    const value = JSON.parse(storage.getItem(settingsConflictKey(owner, symbol, timeframe)) || 'null');
    return value?.settings && typeof value.settings === 'object' ? value : null;
  } catch { return null; }
}
export function preserveSettingsConflict(storage, owner, symbol, timeframe, settings) {
  try {
    storage.setItem(settingsConflictKey(owner, symbol, timeframe), JSON.stringify({ settings, savedAt: Date.now() }));
    return true;
  } catch { return false; }
}
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
  async loadWorkspace(owner) {
    if (!owner || this.user?.id !== owner) return { ok: false };
    try {
      const { data, error } = await this.client.from('chart_workspaces').select('workspace,revision')
        .eq('user_id', owner).eq('name', 'default').maybeSingle();
      if (error || this.user?.id !== owner) return { ok: false };
      return { ok: true, workspace: data?.workspace || null, revision: data?.revision || 0 };
    } catch { return { ok: false }; }
  }
  async saveWorkspace(owner, workspace, revision = 0) {
    if (!owner || this.user?.id !== owner) return { ok: false };
    try {
      const row = { user_id: owner, name: 'default', workspace, revision: revision + 1, updated_at: new Date().toISOString() };
      const query = revision
        ? this.client.from('chart_workspaces').update(row).eq('user_id', owner).eq('name', 'default').eq('revision', revision)
        : this.client.from('chart_workspaces').insert(row);
      const { data, error } = await query.select('revision').maybeSingle();
      if (this.user?.id !== owner) return { ok: false };
      if (error || !data) return { ok: false, conflict: !error || error.code === '23505' };
      return { ok: true, revision: data.revision };
    } catch { return { ok: false }; }
  }
  dispose() { this.subscription?.unsubscribe(); }
}
