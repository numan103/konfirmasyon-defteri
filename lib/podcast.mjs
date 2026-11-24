import { randomUUID } from 'node:crypto';
import { handleUpload } from '@vercel/blob/client';
import { requestUser, throttle } from './auth.mjs';
import { AUDIO_TYPES, MAX_AUDIO_BYTES, cleanEpisode } from '../assets/podcast-model.mjs';
const BASE = process.env.SUPABASE_URL || 'https://fssrtlpjqbavzomynwmg.supabase.co';
const PUB = 'sb_publishable_Zo8BS0jA6f0RBY0DIRUmvg_WsXngIx-';
let cache = null, pending = null, generation=0;
function headers(key) {
  return { apikey:key, ...(key.startsWith('sb_') ? {} : { Authorization:'Bearer '+key }), 'Content-Type':'application/json' };
}
async function load(fresh) {
  if (!fresh && cache && cache.expires > Date.now()) return cache.value;
  if (!fresh && pending) return pending;
  const epoch=generation;
  const job = (async () => {
    const r = await fetch(BASE + '/rest/v1/site_podcast?id=eq.current&select=episode,updated_at', {
      headers:headers(process.env.SUPABASE_SERVICE_ROLE || PUB), signal:AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('podcast_storage_unavailable');
    const [row] = await r.json();
    if (!row) throw new Error('podcast_not_initialized');
    const value = { episode:row.episode || null, revision:row.updated_at };
    if (!fresh && generation===epoch) cache = { value, expires:Date.now()+60000 };
    return value;
  })();
  if (!fresh) pending = job;
  try { return await job; } finally { if (pending === job) pending=null; }
}
export async function podcastUpload(req, res, body) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({error:'audio_upload_not_configured'});
  // Completion callbacks are authenticated by the Blob SDK signature, not a user JWT.
  if (body.type !== 'blob.upload-completed') {
    const user = await requestUser(req);
    if (!user) return res.status(401).json({error:'unauthorized'});
    if (!user.admin) return res.status(403).json({error:'admin_required'});
    if (!throttle('podcast-upload:'+user.id,3000)) return res.status(429).json({error:'slow_down'});
  }
  try {
    const result = await handleUpload({ request:req, body, token:process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken:async pathname => {
        if (!/^podcasts\/[a-zA-Z0-9_-]{1,100}\.(mp3|m4a|aac|ogg|opus|wav)$/i.test(pathname)) throw new Error('invalid_audio_path');
        return { allowedContentTypes:AUDIO_TYPES, maximumSizeInBytes:MAX_AUDIO_BYTES,
          addRandomSuffix:true, allowOverwrite:false, validUntil:Date.now()+15*60000 };
      }
      // No completion callback: an upload alone must never publish an episode.
    });
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json(result);
  } catch (error) { return res.status(400).json({error:'audio_upload_rejected',detail:String(error?.message||error)}); }
}
export default async function podcast(req, res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method === 'GET') {
    try {
      if (req.query?.manage !== undefined) {
        const user=await requestUser(req);
        if (!user) return res.status(401).json({error:'unauthorized'});
        if (!user.admin) return res.status(403).json({error:'admin_required'});
        return res.status(200).json({...(await load(true)), uploadAvailable:!!process.env.BLOB_READ_WRITE_TOKEN});
      }
      const data=await load(false);
      res.setHeader('Cache-Control','public, max-age=30, s-maxage=60');
      return res.status(200).json({episode:data.episode});
    } catch { return res.status(503).json({error:'podcast_storage_unavailable'}); }
  }
  if (req.method !== 'POST') return res.status(405).json({error:'method_not_allowed'});
  let body;
  try { body=typeof req.body==='string'?JSON.parse(req.body):req.body; } catch { return res.status(400).json({error:'bad_json'}); }
  if (!body || typeof body!=='object' || Array.isArray(body) || JSON.stringify(body).length>12000) return res.status(400).json({error:'bad_body'});
  if (req.query?.upload !== undefined) return podcastUpload(req,res,body);
  const user=await requestUser(req);
  if (!user) return res.status(401).json({error:'unauthorized'});
  if (!user.admin) return res.status(403).json({error:'admin_required'});
  if (!['publish','unpublish'].includes(body.action) || !body.revision || !Number.isFinite(Date.parse(body.revision))) return res.status(400).json({error:'invalid_request'});
  let episode=null;
  if (body.action==='publish') {
    episode=cleanEpisode(body.episode);
    if (!episode) return res.status(400).json({error:'invalid_episode'});
    episode.id=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.episode.id||'')?body.episode.id:randomUUID();
  } else if (body.confirmation!=='UNPUBLISH') return res.status(400).json({error:'confirmation_required'});
  const key=process.env.SUPABASE_SERVICE_ROLE;
  if (!key) return res.status(503).json({error:'podcast_storage_unavailable'});
  try {
    const r=await fetch(BASE+'/rest/v1/rpc/podcast_publish', {method:'POST',headers:headers(key),signal:AbortSignal.timeout(10000),
      body:JSON.stringify({p_revision:body.revision,p_episode:episode})});
    if (!r.ok) throw new Error('write_failed');
    const revision=await r.json();
    if (!revision) return res.status(409).json({error:'podcast_conflict'});
    generation++;cache=null;pending=null;
    return res.status(200).json({ok:true,episode,revision});
  } catch { return res.status(503).json({error:'podcast_storage_unavailable'}); }
}
