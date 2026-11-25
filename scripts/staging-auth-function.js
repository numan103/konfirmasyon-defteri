// Staging has no real users. Deny anonymous/session Auth calls without egress.
export async function onRequest() {
  return new Response(JSON.stringify({ message: 'Invalid JWT' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
  });
}
