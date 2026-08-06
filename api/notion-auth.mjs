export default function handler(req, res) {
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'NOTION_OAUTH_CLIENT_ID eksik' });
  const redirectUri = 'https://alfa-trader.com/api/notion-callback';
  const state = req.query.state || '';
  const url = 'https://api.notion.com/v1/oauth/authorize' +
    '?client_id=' + encodeURIComponent(clientId) +
    '&response_type=code' +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&owner=user' +
    (state ? '&state=' + encodeURIComponent(state) : '');
  res.writeHead(302, { Location: url });
  res.end();
}
