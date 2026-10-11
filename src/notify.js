// Notifications: Telegram (bot token + chat id) and email (SMTP, e.g. Gmail
// with an app password). Each channel is used only when its secrets are set.

const gbp = (n) => (n == null ? '?' : '£' + Number(n).toLocaleString('en-GB'));

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function valueText(a) {
  if (!a.value) return null;
  const sign = a.value.pct <= 0 ? '−' : '+';
  return `${sign}${Math.abs(a.value.pct)}% vs ${a.value.comps} similar`;
}

function specText(a, wantedSpecs) {
  const labels = (a.specs || []).map((s) => s.label);
  if (!labels.length) return null;
  const wanted = labels.filter((l) => wantedSpecs.includes(l));
  const other = labels.filter((l) => !wantedSpecs.includes(l));
  const shown = [...wanted.map((l) => `✔ ${l}`), ...other.slice(0, Math.max(0, 5 - wanted.length))];
  const more = labels.length - shown.length;
  return shown.join(' · ') + (more > 0 ? ` · +${more}` : '');
}

function advertLine(a, wantedSpecs = []) {
  const bits = [a.registeredYear || a.year, a.mileageText, a.location, a.sellerType === 'PRIVATE' ? 'private' : null]
    .filter(Boolean)
    .join(' · ');
  const flags = [];
  if (a.deal?.underpriced) flags.push('💰 ' + valueText(a));
  else if (a.value) flags.push(valueText(a));
  const specs = specText(a, wantedSpecs);
  if (a.details?.serviceHistory && /full/i.test(a.details.serviceHistory)) flags.push('FSH');
  if (a.details?.owners) flags.push(`${a.details.owners} owner${a.details.owners === 1 ? '' : 's'}`);
  return (
    `<a href="${a.url}">${esc(a.title)}</a> — <b>${gbp(a.price)}</b>\n${esc(bits)}` +
    (flags.length ? `\n${esc(flags.join(' · '))}` : '') +
    (specs ? `\n${esc(specs)}` : '')
  );
}

/** Build the per-search report lines shared by both channels (HTML). */
export function buildReport(results, { maxPerSection = 25, wantedSpecs = [] } = {}) {
  const sections = [];
  let anything = false;
  for (const r of results) {
    if (r.error) {
      sections.push(`<b>${esc(r.name)}</b>\n⚠️ Search failed: ${esc(r.error)}`);
      anything = true;
      continue;
    }
    const parts = [];
    const deals = r.deals || [];
    const dealIds = new Set(deals.map((a) => a.id));
    if (deals.length) {
      parts.push(
        `⭐ <b>${deals.length} worth a look</b> (underpriced or high spec)\n` +
          deals.slice(0, maxPerSection).map((a) => advertLine(a, wantedSpecs)).join('\n\n'),
      );
    }
    const added = r.added.filter((a) => !dealIds.has(a.id));
    if (added.length) {
      parts.push(
        `🆕 <b>${added.length} new</b>\n` +
          added.slice(0, maxPerSection).map((a) => advertLine(a, wantedSpecs)).join('\n\n') +
          (added.length > maxPerSection ? `\n…and ${added.length - maxPerSection} more on the dashboard` : ''),
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
