export default async function handler(req, res) {
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.redirect(302, '/#notion-error=' + encodeURIComponent('OAuth yapılandırma hatası'));
  }
  const code = req.query.code;
  if (!code) {
    return res.redirect(302, '/#notion-error=' + encodeURIComponent('Notion onay kodu alınamadı'));
  }
  const redirectUri = 'https://alfatraders.vercel.app/api/notion-callback';
  try {
    const r = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64') },
      body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    });
    if (!r.ok) {
      const errText = await r.text();
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
