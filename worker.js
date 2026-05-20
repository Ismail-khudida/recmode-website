export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) {
      const nonWww = new URL(request.url);
      nonWww.hostname = url.hostname.replace(/^www\./, '');
      return Response.redirect(nonWww.toString(), 301);
    }
    if (url.protocol === 'http:') {
      const https = new URL(request.url);
      https.protocol = 'https:';
      return Response.redirect(https.toString(), 301);
    }
    if (url.pathname === '/index.html') {
      return Response.redirect('https://' + url.hostname + '/', 301);
    }
    if (url.pathname === '/contact' && request.method === 'POST') {
      return handleContact(request, env, ctx);
    }
    if (url.pathname === '/contact' && request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }
    return env.ASSETS.fetch(request);
  }
};

async function handleContact(request, env, ctx) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  try {
    const body = await request.json();
    const { name, email, company, message, type } = body;
    if (!name || !email || !message) {
      return Response.json({ success: false, error: 'Fehlende Felder' }, { status: 400, headers: cors });
    }
    const isQuiz = type === 'quiz';
    const subject = isQuiz
      ? 'RECmode Quiz-Anfrage von ' + name
      : 'Neue Anfrage von ' + name + (company ? ' - ' + company : '');

    const notifyHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#E8130A">${isQuiz ? 'Quiz-Anfrage' : 'Neue Kontaktanfrage'}</h2>
        <p><strong>Name:</strong> ${escHtml(name)}</p>
        ${company ? '<p><strong>Unternehmen:</strong> ' + escHtml(company) + '</p>' : ''}
        <p><strong>E-Mail:</strong> <a href="mailto:${escHtml(email)}">${escHtml(email)}</a></p>
        <hr>
        <p><strong>Nachricht:</strong></p>
        <pre style="background:#f5f5f5;padding:16px;border-radius:8px;white-space:pre-wrap">${escHtml(message)}</pre>
      </div>
    `;

    const signature = `
      <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e0e0e0;font-family:sans-serif;font-size:14px;color:#555">
        <p style="margin:0 0 4px 0"><strong style="color:#0d0d0d">Ismail Khudida</strong></p>
        <p style="margin:0 0 4px 0;color:#E8130A;font-weight:600">Gründer & Kreativdirektor</p>
        <p style="margin:0 0 4px 0"><strong>RECmode</strong> — Digitales Marketing, Video & KI-Content</p>
        <p style="margin:0 0 4px 0">
          <a href="mailto:info@recmo.de" style="color:#E8130A;text-decoration:none">info@recmo.de</a>
          &nbsp;|&nbsp;
          <a href="tel:+4917832489043" style="color:#555;text-decoration:none">+49 178 32489043</a>
        </p>
        <p style="margin:0">
          <a href="https://recmo.de" style="color:#E8130A;text-decoration:none;font-weight:600">recmo.de</a>
        </p>
      </div>
    `;

    const confirmHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d0d0d;color:#fafafa;padding:32px;border-radius:12px">
        <h2 style="color:#E8130A;margin-bottom:16px">Deine Anfrage ist angekommen!</h2>
        <p style="margin-bottom:16px">Hey ${escHtml(name)},</p>
        <p style="margin-bottom:8px">vielen Dank für Deine Nachricht. Ich melde mich in der Regel innerhalb von 24 Stunden zurück.</p>
        <p style="margin-bottom:24px">Herzliche Grüße,</p>
        <a href="https://recmo.de" style="display:inline-block;background:#E8130A;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-bottom:32px">recmo.de besuchen</a>
        <div style="margin-top:0;padding-top:20px;border-top:1px solid #333;font-size:13px;color:#aaa">
          <p style="margin:0 0 4px 0"><strong style="color:#fafafa">Ismail Khudida</strong></p>
          <p style="margin:0 0 4px 0;color:#E8130A;font-weight:600">Gründer & Kreativdirektor</p>
          <p style="margin:0 0 4px 0;color:#ccc">RECmode — Digitales Marketing, Video & KI-Content</p>
          <p style="margin:0 0 4px 0">
            <a href="mailto:info@recmo.de" style="color:#E8130A;text-decoration:none">info@recmo.de</a>
            &nbsp;|&nbsp;
            <a href="tel:+4917832489043" style="color:#aaa;text-decoration:none">+49 178 32489043</a>
          </p>
          <a href="https://recmo.de" style="color:#E8130A;text-decoration:none;font-weight:600">recmo.de</a>
        </div>
      </div>
    `;

    // 1. Benachrichtigung an info@recmo.de
    const notifyRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'RECmode Website <info@recmo.de>',
        to: ['info@recmo.de'],
        reply_to: email,
        subject: subject,
        html: notifyHtml + signature
      })
    });

    if (!notifyRes.ok) {
      const err = await notifyRes.text();
      console.error('Resend notify error:', err);
      return Response.json({ success: false, error: 'Email Fehler: ' + err }, { status: 500, headers: cors });
    }

    // 2. Bestätigung an Kunde via ctx.waitUntil
    ctx.waitUntil(
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + env.RESEND_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Ismail von RECmode <info@recmo.de>',
          to: [email],
          subject: 'Deine Anfrage bei RECmode. Ich melde mich bald!',
          html: confirmHtml
        })
      }).then(r => {
        if (!r.ok) r.text().then(t => console.error('confirm mail error:', t));
      }).catch(e => console.warn('confirm mail fetch error:', e))
    );

    return Response.json({ success: true }, { headers: cors });
  } catch (e) {
    console.error('handleContact error:', e);
    return Response.json({ success: false, error: 'Serverfehler' }, { status: 500, headers: cors });
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
