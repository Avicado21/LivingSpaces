/* Left tab: Chad, the roommate helper. Answers stream from Claude Sonnet on
   Bedrock through the server, which adds the household ledger as context and
   keeps the conversation. */
import { icon } from '../lib/icons.js';
import { esc, h, richText } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { store } from '../store.js';

const SUGGESTIONS = ['Who paid for the couch?', "What's my share of everything?", 'Who owes who right now?', 'My roommate never does the dishes'];

export function mountChat(root, { onAuthError } = {}) {
  root.innerHTML = `<div class="rr-panel">
    <div class="rr-panel-head"><div><h3>Chad</h3><p>Your roommate helper <span class="rr-pill ai">${icon('spark', 12)}Claude Sonnet</span></p></div></div>
    <div class="rr-panel-body"><div class="rr-chatlog"></div></div>
    <div class="rr-suggest">${SUGGESTIONS.map(s => `<button type="button" class="rr-chip">${esc(s)}</button>`).join('')}</div>
    <form class="rr-chatbar"><input class="rr-input" maxlength="2000" placeholder="Ask Chad about furniture, bills, or a dispute…"><button class="rr-btn" aria-label="Send">${icon('send', 18)}</button></form>
    <div class="rr-ai-foot">Live: Claude Sonnet on Amazon Bedrock, with this household's furniture, bills and balances as context.</div></div>`;
  const log = root.querySelector('.rr-chatlog'), body = root.querySelector('.rr-panel-body');
  const form = root.querySelector('form'), inp = form.querySelector('input');
  const scroll = () => { body.scrollTop = body.scrollHeight; };
  const add = (cls, html) => { const m = h(`<div class="rr-msg ${cls}">${html}</div>`); log.append(m); scroll(); return m; };
  let busy = false;

  async function load() {
    log.innerHTML = '';
    const me = store.rm(store.me);
    add('ai', esc(`Hey ${me?.name || 'there'}, I'm Chad, your livingSpaces helper 👋 I keep track of the stuff you split and the bills. Ask me who bought what, what something's worth now, or for help settling a dispute.`));
    try { for (const m of (await api.chatHistory(store.me)).messages) add(m.role === 'user' ? 'me' : 'ai', m.role === 'user' ? esc(m.content) : richText(m.content)); }
    catch { /* history is a nicety; the greeting is enough */ }
  }

  async function ask(text) {
    text = text.trim();
    if (busy || !text) return;
    busy = true; add('me', esc(text)); inp.value = '';
    const m = add('ai', '<span class="rr-thinking"><span class="rr-dots"><i></i><i></i><i></i></span></span>');
    let acc = '';
    try {
      await api.chat(store.me, text, d => { acc += d; m.innerHTML = richText(acc); scroll(); });
      if (!acc.trim()) m.textContent = '(no answer)';
    } catch (e) {
      if (e.code === 'aws_auth') onAuthError?.(e);
      m.classList.add('err');
      m.innerHTML = `<b>${esc(e.title || "Chad couldn't answer")}</b>\n${esc(e.message)}\n<button type="button" class="rr-chip" data-retry>Try again</button>`;
      m.querySelector('[data-retry]').onclick = () => { m.remove(); log.lastElementChild?.remove(); busy = false; ask(text); };
    }
    busy = false; scroll();
  }

  form.onsubmit = e => { e.preventDefault(); ask(inp.value); };
  root.querySelectorAll('.rr-chip').forEach(c => c.onclick = () => ask(c.textContent));
  return { ask, load };
}
