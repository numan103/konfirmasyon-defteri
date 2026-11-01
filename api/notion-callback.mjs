// Notion OAuth. The redirect URI must be registered *exactly* in the Notion
// integration settings (notion.so/profile/integrations -> your integration ->
// Redirect URIs). Keep it configurable so a preview domain or the www host can
// be used without touching code.
function first(value) {
  return String(value || '').split(',')[0].trim();
}

function redirectUri(req) {
  if (process.env.NOTION_REDIRECT_URI) return process.env.NOTION_REDIRECT_URI.trim();
  const proto = first(req.headers['x-forwarded-proto']) || 'https';
  const host = first(req.headers['x-forwarded-host']) || first(req.headers.host) || 'alfa-trader.com';
  return proto + '://' + host + '/api/notion-callback';
}

export default async function handler(req, res) {
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET;
  const redirect = redirectUri(req);

  // Small diagnostic: /api/notion-callback?action=uri
  // Shows the exact value that has to be added to the Notion integration.
  if (req.query.action === 'uri') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      redirect_uri: redirect,
      configured: !!clientId,
    });
  }

  // /api/notion-callback?action=auth — redirect to Notion OAuth
  if (req.query.action === 'auth') {
    if (!clientId) return res.status(500).json({ error: 'NOTION_OAUTH_CLIENT_ID eksik' });
    const state = req.query.state || '';
    const url = 'https://api.notion.com/v1/oauth/authorize' +
      '?client_id=' + encodeURIComponent(clientId) +
      '&response_type=code' +
      '&redirect_uri=' + encodeURIComponent(redirect) +
      '&owner=user' +
      (state ? '&state=' + encodeURIComponent(state) : '');
    res.writeHead(302, { Location: url });
    return res.end();
  }

  // /api/notion-callback?code=... — exchange token
  if (!clientId || !clientSecret) {
    return res.redirect(302, '/#notion-error=' + encodeURIComponent('OAuth yapılandırma hatası'));
  }
  const code = req.query.code;
  if (!code) {
    return res.redirect(302, '/#notion-error=' + encodeURIComponent('Notion onay kodu alınamadı'));
  }
  try {
    const r = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64') },
      body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirect }),
    });
    if (!r.ok) {
      return res.redirect(302, '/#notion-error=' + encodeURIComponent('Notion token hatası: ' + r.status));
    }
    const data = await r.json();
    const accessToken = data.access_token;
    if (!accessToken) {
      return res.redirect(302, '/#notion-error=' + encodeURIComponent('Token alınamadı'));
    }
    return res.redirect(302, '/#notion-token=' + encodeURIComponent(accessToken));
  } catch (e) {
    return res.redirect(302, '/#notion-error=' + encodeURIComponent(e.message));
  }
}
