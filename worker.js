export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── 1. www → non-www (301 Redirect) ──────────────────────────────────────
    if (url.hostname.startsWith('www.')) {
      const nonWww = new URL(request.url);
      nonWww.hostname = url.hostname.replace(/^www\./, '');
      return Response.redirect(nonWww.toString(), 301);
    }

    // ── 2. HTTP → HTTPS (301 Redirect) ───────────────────────────────────────
    if (url.protocol === 'http:') {
      const https = new URL(request.url);
      https.protocol = 'https:';
      return Response.redirect(https.toString(), 301);
    }

    // ── 3. /index.html → / (301 Redirect) ────────────────────────────────────
    if (url.pathname === '/index.html') {
      return Response.redirect('https://' + url.hostname + '/', 301);
    }

    // ── 4. Alles andere → Static Assets ──────────────────────────────────────
    return env.ASSETS.fetch(request);
  }
};
