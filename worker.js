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
    return env.ASSETS.fetch(request);
  }
};

async function handleContact(request, env, ctx) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const body = await request.json();
    const { name, email, company, message, type, phone, callback } = body;

    if (!name || !email || !message) {
      return Response.json({ success: false, error: 'Fehlende Pflichtfelder' }, { status: 400, headers: cors });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return Response.json({ success: false, error: 'Ungültige E-Mail-Adresse' }, { status: 400, headers: cors });
    }

    const isQuiz = type === 'quiz';
    const firstName = escHtml(name.split(' ')[0]);
    const subject = isQuiz
      ? `RECmode Marketing-Check – Neue Quiz-Anfrage von ${name}`
      : `${callback ? '📞 Rückruf gewünscht – ' : ''}Neue Anfrage von ${name}${company ? ' – ' + company : ''}`;

    // Benachrichtigung an info@recmo.de
    const notifyRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'RECmode Website <info@recmo.de>',
        to: ['info@recmo.de'],
        reply_to: email,
        subject,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#E8130A">Neue ${isQuiz ? 'Quiz-Anfrage' : callback ? '📞 Rückruf-Anfrage' : 'Kontaktanfrage'}</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;font-weight:bold;width:120px">Name</td><td style="padding:8px">${escHtml(name)}</td></tr>
            ${company ? `<tr><td style="padding:8px;font-weight:bold">Unternehmen</td><td style="padding:8px">${escHtml(company)}</td></tr>` : ''}
            <tr><td style="padding:8px;font-weight:bold">E-Mail</td><td style="padding:8px"><a href="mailto:${escHtml(email)}">${escHtml(email)}</a></td></tr>
            ${callback && phone ? `<tr><td style="padding:8px;font-weight:bold;color:#E8130A">📞 Telefon</td><td style="padding:8px;font-weight:bold">${escHtml(phone)}</td></tr>` : ''}
          </table>
          <h3 style="margin-top:20px">${isQuiz ? 'Quiz-Ergebnisse' : 'Nachricht'}</h3>
          <div style="background:#f5f5f5;padding:16px;border-radius:8px;white-space:pre-wrap">${escHtml(message)}</div>
        </div>`,
      }),
    });

    if (!notifyRes.ok) {
      const err = await notifyRes.text();
      console.error('Notify error:', err);
      return Response.json({ success: false, error: 'E-Mail konnte nicht gesendet werden' }, { status: 500, headers: cors });
    }

    // Bestätigungs-E-Mail
    const confirmHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f4f4f4;">
<tr><td align="center" style="padding:32px 16px;">
<table cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;border-radius:10px;overflow:hidden;border:1px solid #e0e0e0;">

  <!-- HEADER: schwarz -->
  <tr>
    <td bgcolor="#0d0d0d" style="background:#0d0d0d;padding:20px 28px;">
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
        <tr>
          <td style="vertical-align:middle;">
            <a href="https://recmo.de" style="text-decoration:none;">
              <img src="https://recmo.de/Recmode%20wei%C3%9F.PNG" alt="RECmode" height="32" style="display:block;height:32px;width:auto;border:0;">
            </a>
          </td>
          <td style="text-align:right;vertical-align:middle;">
            <span style="color:#ffffff;font-size:12px;font-weight:600;letter-spacing:0.5px;">Digitales Marketing</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- TITEL: weiß mit rotem Text -->
  <tr>
    <td bgcolor="#ffffff" style="background:#ffffff;padding:24px 28px 20px;border-bottom:3px solid #E8130A;">
      <div style="font-size:22px;font-weight:700;color:#E8130A;line-height:1.3;">Deine Anfrage ist angekommen!</div>
    </td>
  </tr>

  <!-- BODY -->
  <tr>
    <td bgcolor="#ffffff" style="background:#ffffff;padding:24px 28px 28px;">
      <p style="margin:0 0 16px;font-size:15px;color:#0d0d0d;">Hey ${firstName},</p>
      <p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.7;">
        vielen Dank für Deine Nachricht. Ich melde mich in der Regel innerhalb von 24 Stunden per Mail zurück.
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.7;">
        Du kannst auch direkt einen Termin zum Videomeeting buchen:
      </p>
      <a href="https://calendar.app.google/4TkMZH2iNK17EMWPA"
         style="display:inline-block;background:#E8130A;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:700;">
        📅 Termin buchen
      </a>
      <p style="margin:28px 0 4px;font-size:15px;color:#0d0d0d;">Herzliche Grüße,</p>
      <p style="margin:0 0 0;font-size:15px;font-weight:700;color:#0d0d0d;">Ismail</p>
    </td>
  </tr>

  <!-- TRENNLINIE -->
  <tr><td bgcolor="#f0f0f0" style="background:#f0f0f0;height:1px;font-size:0;line-height:0;">&nbsp;</td></tr>

  <!-- SIGNATUR HEADER: schwarz -->
  <tr>
    <td bgcolor="#0d0d0d" style="background:#0d0d0d;padding:16px 20px;">
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
        <tr>
          <td style="vertical-align:middle;padding-right:20px;">
            <a href="https://www.recmo.de" style="text-decoration:none;">
              <img src="https://recmo.de/Recmode%20wei%C3%9F.PNG" height="28" alt="RECmode" style="display:block;height:28px;width:auto;border:0;">
            </a>
          </td>
          <td style="text-align:right;vertical-align:middle;">
            <a href="https://recmo.de/quiz"
               style="background:#E8130A;color:#ffffff;padding:8px 16px;border-radius:4px;text-decoration:none;font-size:11px;font-weight:700;white-space:nowrap;display:inline-block;">
              ✨ Marketing-Check →
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- SIGNATUR BODY -->
  <tr>
    <td bgcolor="#ffffff" style="background:#ffffff;">
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
        <tr>
          <!-- Links -->
          <td style="vertical-align:top;padding:16px 20px;width:50%;background:#ffffff;">
            <div style="font-size:14px;font-weight:700;color:#0d0d0d;margin-bottom:2px;">Ismail Khudida</div>
            <div style="font-size:10px;color:#999;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px;">Digital Marketing</div>
            <div style="font-size:12px;margin-bottom:8px;">
              <a href="mailto:ismail.khudida@recmo.de" style="color:#0d0d0d;text-decoration:none;">ismail.khudida@recmo.de</a>
            </div>
            <div style="font-size:11px;color:#777;line-height:1.5;margin-bottom:14px;">
              RECmode, Bückeburger Str. 14,<br>32457 Porta Westfalica
            </div>
            <table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="padding-right:8px;"><a href="https://www.recmo.de"><img src="https://cdn-icons-png.flaticon.com/512/3059/3059997.png" width="18" height="18" alt="Web" style="display:block;border:0;"></a></td>
              <td style="padding-right:8px;"><a href="https://www.linkedin.com/company/recmode/"><img src="https://cdn-icons-png.flaticon.com/512/174/174857.png" width="18" height="18" alt="LinkedIn" style="display:block;border:0;"></a></td>
              <td style="padding-right:8px;"><a href="https://www.instagram.com/recmo.de"><img src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png" width="18" height="18" alt="Instagram" style="display:block;border:0;"></a></td>
              <td style="padding-right:8px;"><a href="https://www.tiktok.com/@recmo.de"><img src="https://cdn-icons-png.flaticon.com/512/3046/3046121.png" width="18" height="18" alt="TikTok" style="display:block;border:0;"></a></td>
              <td><a href="https://www.facebook.com/share/1CfgPvsfjj/"><img src="https://cdn-icons-png.flaticon.com/512/124/124010.png" width="18" height="18" alt="Facebook" style="display:block;border:0;"></a></td>
            </tr></table>
          </td>
          <!-- Rechts -->
          <td style="vertical-align:top;padding:16px 20px;width:50%;background:#ffffff;border-left:1px solid #eee;">
            <div style="font-size:12px;margin-bottom:4px;"><a href="tel:+491783248904" style="color:#0d0d0d;text-decoration:none;">+49 178 3248904</a></div>
            <div style="font-size:12px;margin-bottom:4px;"><a href="mailto:info@recmo.de" style="color:#0d0d0d;text-decoration:none;">info@recmo.de</a></div>
            <div style="font-size:12px;margin-bottom:16px;"><a href="https://www.recmo.de" style="color:#E8130A;text-decoration:none;font-weight:600;">www.recmo.de</a></div>
            <div style="border-top:1px solid #eee;padding-top:10px;">
              <div style="font-size:10px;color:#E8130A;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">Leistungen</div>
              <div style="font-size:11px;color:#777;line-height:1.6;">Medienproduktion &middot; Social Media<br>KI-Marketing &middot; Website</div>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body></html>`;

    ctx.waitUntil(
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Ismail von RECmode <info@recmo.de>',
          to: [email],
          subject: 'Deine Anfrage ist angekommen!',
          html: confirmHtml,
        }),
      })
      .then(r => { if (!r.ok) r.text().then(t => console.error('Confirm error:', t)); })
      .catch(e => console.warn('Confirm exception:', e))
    );

    return Response.json({ success: true }, { headers: cors });

  } catch (e) {
    console.error('handleContact error:', e);
    return Response.json({ success: false, error: 'Serverfehler' }, { status: 500, headers: cors });
  }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
