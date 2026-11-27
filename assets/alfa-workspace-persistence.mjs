import { openCloudConflict, sameSettings } from './alfa-cloud-conflict.mjs?v=2';

export class WorkspacePersistence {
  constructor({ store, storage = localStorage, normalize, apply, onStatus = () => {}, onConflict = () => {} }) {
    Object.assign(this, { store, storage, normalize, apply, onStatus, onConflict });
    this.epoch = 0;
  }
  key() { return 'alfa-chart-workspace-sync:v1:' + this.owner; }
  persist() {
    try {
      this.storage.setItem(this.key(), JSON.stringify({ revision: this.revision, base: this.base, dirty: this.dirty, blocked: this.blocked }));
    } catch { this.onStatus('Düzen senkronizasyon durumu yerelde kaydedilemedi', 'error'); }
  }
  valid(epoch) { return epoch === this.epoch && this.owner !== 'guest' && this.store.user?.id === this.owner; }
  async start(owner, local, hasLocal) {
    const epoch = ++this.epoch;
    clearTimeout(this.timer);
    this.owner = owner; this.local = structuredClone(local); this.ready = false; this.busy = false;
    this.revision = 0; this.base = null; this.dirty = false; this.blocked = false;
    let meta;
    try { meta = JSON.parse(this.storage.getItem(this.key()) || 'null'); } catch {}
    this.dirty = !!meta?.dirty; this.blocked = !!meta?.blocked;
    this.onConflict(this.blocked);
    if (!this.valid(epoch)) return;
    const initial = structuredClone(this.local);
    const result = await this.store.loadWorkspace(owner);
    if (!this.valid(epoch)) return;
    if (!result.ok) { this.onStatus('Bulut düzeni okunamadı · yerel düzen korundu', 'error'); return; }
    const remote = result.workspace == null ? null : this.normalize(result.workspace);
    if (result.workspace != null && !remote) {
      this.onStatus('Bulut düzeni geçersiz · yerel düzen korundu', 'error'); return;
    }
    this.revision = result.revision || 0;
    this.ready = true;
    if (this.blocked) { this.persist(); return; }
    const editedDuringLoad = !sameSettings(initial, this.local);
    if (remote && !sameSettings(remote, this.local)) {
      const cleanBaseline = !this.dirty && meta?.base && sameSettings(meta.base, this.local);
      if ((!hasLocal || cleanBaseline) && !editedDuringLoad) {
        this.apply(remote); this.local = structuredClone(remote); this.base = remote; this.dirty = false;
        this.persist(); this.onStatus('Hesaba bağlı grafik düzeni yüklendi', 'ok'); return;
      }
      this.blocked = true; this.persist(); this.onConflict(true);
      this.onStatus('Düzen çakışması · yerel düzen korundu', 'error'); return;
    }
    this.base = remote;
    this.dirty = !remote || !sameSettings(remote, this.local);
    this.persist();
    if (this.dirty) await this.flush();
    else this.onStatus('Hesaba bağlı grafik düzeni yüklendi', 'ok');
  }
  changed(workspace) {
    this.local = structuredClone(workspace); this.dirty = true;
    this.persist();
    if (!this.ready || this.blocked) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 500);
  }
  async flush() {
    const epoch = this.epoch;
    if (!this.valid(epoch) || !this.ready || this.blocked || this.busy || !this.dirty) return;
    this.busy = true;
    const snapshot = structuredClone(this.local);
    try {
      const result = await this.store.saveWorkspace(this.owner, snapshot, this.revision);
      if (!this.valid(epoch)) return;
      if (result.ok) {
        this.revision = result.revision; this.base = snapshot;
        this.dirty = !sameSettings(snapshot, this.local);
        this.persist(); this.onStatus('Grafik düzeni buluta kaydedildi', 'ok');
      } else if (result.conflict) {
        this.blocked = true; this.persist(); this.onConflict(true);
        this.onStatus('Düzen çakışması · yerel düzen korundu', 'error');
      } else this.onStatus('Düzen buluta kaydedilemedi · yerel kayıt korundu', 'error');
    } finally {
      if (epoch === this.epoch) {
        this.busy = false;
        if (this.dirty && !this.blocked) {
          // Failed writes retry only on another user change/reconnect, not a loop.
          if (!sameSettings(snapshot, this.local)) this.timer = setTimeout(() => this.flush(), 500);
        }
      }
    }
  }
  resolve() {
    if (!this.blocked) return;
    const epoch = this.epoch, owner = this.owner;
    return openCloudConflict({
      scope: { owner, kind: 'multi-chart' }, valid: () => this.valid(epoch) && this.blocked,
      readLocal: () => this.local,
      load: async () => {
        const result = await this.store.loadWorkspace(owner);
        const workspace = result.ok && result.workspace && this.normalize(result.workspace);
        return workspace ? { settings: workspace, revision: result.revision } : null;
      },
      save: (workspace, revision) => this.store.saveWorkspace(owner, workspace, revision),
      archive: workspace => {
        try { this.storage.setItem(`alfa-chart-workspace-backup:v1:${owner}:${Date.now()}`, JSON.stringify(workspace)); return true; }
        catch { return false; }
      },
      apply: workspace => { this.apply(workspace); this.local = structuredClone(workspace); },
      finish: verified => {
        this.revision = verified.revision; this.base = structuredClone(verified.settings);
        this.dirty = false; this.blocked = false; this.ready = true;
        this.persist(); this.onConflict(false);
        this.onStatus('Düzen çakışması çözüldü · sürüm doğrulandı', 'ok');
      }
    });
  }
  dispose() { ++this.epoch; clearTimeout(this.timer); }
}
