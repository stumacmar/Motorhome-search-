// Notifications: Telegram (bot token + chat id) and email (SMTP, e.g. Gmail
// with an app password). Each channel is used only when its secrets are set.

const gbp = (n) => (n == null ? '?' : '£' + Number(n).toLocaleString('en-GB'));

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function advertLine(a) {
  const bits = [a.registeredYear || a.year, a.mileageText, a.location, a.sellerType === 'PRIVATE' ? 'private' : null]
    .filter(Boolean)
    .join(' · ');
  return `<a href="${a.url}">${esc(a.title)}</a> — <b>${gbp(a.price)}</b>\n${esc(bits)}`;
}

/** Build the per-search report lines shared by both channels (HTML). */
export function buildReport(results, { maxPerSection = 25 } = {}) {
  const sections = [];
  let anything = false;
  for (const r of results) {
    if (r.error) {
      sections.push(`<b>${esc(r.name)}</b>\n⚠️ Search failed: ${esc(r.error)}`);
      anything = true;
      continue;
    }
    const parts = [];
    if (r.added.length) {
      parts.push(
        `🆕 <b>${r.added.length} new</b>\n` +
          r.added.slice(0, maxPerSection).map(advertLine).join('\n\n') +
          (r.added.length > maxPerSection ? `\n…and ${r.added.length - maxPerSection} more on the dashboard` : ''),
      );
    }
    if (r.priceDrops.length) {
      parts.push(
        `📉 <b>${r.priceDrops.length} price drop${r.priceDrops.length > 1 ? 's' : ''}</b>\n` +
          r.priceDrops
            .slice(0, maxPerSection)
            .map((c) => `<a href="${c.advert.url}">${esc(c.advert.title)}</a> — <s>${gbp(c.from)}</s> <b>${gbp(c.to)}</b> (−${gbp(c.from - c.to)})`)
            .join('\n'),
      );
    }
    if (r.gone.length) {
      parts.push(`🚫 ${r.gone.length} gone: ` + r.gone.slice(0, 10).map((a) => esc(a.title)).join(', ') + (r.gone.length > 10 ? '…' : ''));
    }
    if (parts.length) {
      anything = true;
      sections.push(`<b>${esc(r.name)}</b> (${r.total} matching)\n${parts.join('\n\n')}`);
    }
  }
  return { html: sections.join('\n\n————————\n\n'), anything };
}

/** Telegram's limit is 4096 chars per message. Split on section breaks. */
function chunkForTelegram(text, limit = 3900) {
  const chunks = [];
  let current = '';
  for (const block of text.split('\n\n')) {
    if ((current + '\n\n' + block).length > limit && current) {
      chunks.push(current);
      current = block;
    } else {
      current = current ? current + '\n\n' + block : block;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function sendTelegram({ token, chatId }, html, dashboardUrl) {
  const header = `🚐 <b>Motorhome search</b>${dashboardUrl ? ` · <a href="${dashboardUrl}">dashboard</a>` : ''}\n\n`;
  const chunks = chunkForTelegram(header + html);
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    if (!res.ok) throw new Error(`Telegram API ${res.status}: ${await res.text()}`);
  }
  return chunks.length;
}

export async function sendEmail({ host, port, user, pass, from, to }, html, subject, dashboardUrl) {
  const { default: nodemailer } = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: host || 'smtp.gmail.com',
    port: Number(port || 465),
    secure: Number(port || 465) === 465,
    auth: { user, pass },
  });
  const body =
    `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;max-width:640px">` +
    (dashboardUrl ? `<p><a href="${dashboardUrl}">Open the dashboard</a></p>` : '') +
    html.replace(/\n/g, '<br>') +
    `</div>`;
  await transporter.sendMail({ from: from || user, to: to || user, subject, html: body });
}

/** Read notification settings from the environment. */
export function channelsFromEnv(env = process.env) {
  const channels = {};
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    channels.telegram = { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID };
  }
  if (env.SMTP_USER && env.SMTP_PASS) {
    channels.email = {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.EMAIL_FROM,
      to: env.EMAIL_TO,
    };
  }
  return channels;
}
