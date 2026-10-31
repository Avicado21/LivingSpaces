/* The Add card, pinned beside the floor marker: photo -> PNG -> Claude Haiku
   classification -> details and split -> saved item. */
import { CATEGORY_IDS, catLong, catWord } from '../../../shared/categories.js';
import { icon } from '../lib/icons.js';
import { $, esc } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { ACCEPT, FORMATS, MAX_EDGE, mb, sniffFormat, decode, toPNG, blobToBase64 } from '../lib/image.js';
import { store } from '../store.js';
import { toast, categoryPicker, detailsForm } from './widgets.js';

export function createAddCard(stage, { onOpen, onAuthError } = {}) {
  const W = { step: 1, file: null, png: null, result: null, cat: null, form: null, token: 0 };
  let open = false;
  $('#aClose').innerHTML = icon('close', 14);

  const pipeRow = (id, title, detail, state = '') => `<li id="pp-${id}" class="${state}"><span class="st">${state === 'done' ? '✓' : state === 'err' ? '!' : ''}</span><span><b>${title}</b>${detail}</span></li>`;
  const setRow = (id, title, detail, state) => { const el = $('#pp-' + id); if (el) el.outerHTML = pipeRow(id, title, detail, state); };

  function paintSteps() {
    $('#steps').innerHTML = ['Photo', 'Type', 'Details'].map((n, i) => `${i ? '<span class="sep"></span>' : ''}<i class="${i + 1 === W.step ? 'on' : i + 1 < W.step ? 'done' : ''}">${i + 1 < W.step ? '✓' : i + 1}</i><b>${n}</b>`).join('');
  }
  function paintPhotoStep() {
    $('#photoRoot').innerHTML = `
      <label class="rr-drop" style="padding:18px 12px">
        <input type="file" accept="${ACCEPT}" capture="environment">
        <span class="ic">${icon('camera', 26)}</span><b>Take or upload a photo</b>
        <span class="fmts"><span class="hl">HEIC</span><span class="hl">HEIF</span><span>JPEG</span><span>PNG</span><span>WebP</span><span>AVIF</span><span>GIF</span><span>BMP</span><span>TIFF*</span></span>
        <span class="rr-muted rr-small">iPhone and Android photos work; everything becomes a PNG before it's sent</span>
      </label>`;
    const drop = $('#photoRoot .rr-drop'), inp = drop.querySelector('input');
    const take = f => { if (f) { W.file = f; go(2); } };
    inp.onchange = () => take(inp.files[0]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); take(e.dataTransfer.files[0]); };
  }

  async function runPipeline(tok) {
    const f = W.file, live = () => tok === W.token && W.step === 2;
    $('#pipe').innerHTML = pipeRow('read', 'Reading photo', esc(f.name), 'active') + pipeRow('dec', 'Decode', 'waiting') + pipeRow('png', 'Convert to PNG', 'waiting') + pipeRow('ai', 'Classify', 'waiting');
    try {
      const fmt = await sniffFormat(f);
      if (!live()) return;
      setRow('read', `Received ${esc(f.name)}`, `${FORMATS[fmt].label} · ${FORMATS[fmt].from} · ${mb(f.size)}`, 'done');
      setRow('dec', 'Decoding', `${FORMATS[fmt].label} image…`, 'active');
      const { bitmap, via } = await decode(f, fmt, msg => setRow('dec', 'Decoding', msg, 'active'));
      if (!live()) return;
      setRow('dec', 'Decoded', `${bitmap.width}×${bitmap.height} · ${via}`, 'done');
      setRow('png', 'Converting to PNG', 'resizing and encoding…', 'active');
      const png = await toPNG(bitmap);
      if (!live()) return URL.revokeObjectURL(png.url);
      W.png = png;
      setRow('png', 'Converted to PNG', `${png.w}×${png.h} · ${mb(png.blob.size)} · long edge ≤ ${MAX_EDGE}px, under 3.75 MB`, 'done');
      $('#scanImg').src = png.url; $('#scan').classList.add('on');
      await classify(tok);
    } catch (e) {
      if (!live()) return;
      $('#scan').classList.remove('on');
      const row = document.querySelector('#pipe li.active')?.id?.slice(3) || 'dec';
      setRow(row, "Couldn't use this photo", esc(e.message), 'err');
      $('#verdict').innerHTML = `<button class="rr-btn soft sm" id="retake">${icon('camera', 14)}Try another photo</button>`;
      $('#retake').onclick = () => { W.file = null; go(1); };
    }
  }
  async function classify(tok) {
    const live = () => tok === W.token && W.step === 2;
    setRow('ai', 'Asking Claude Haiku', `image/png · ${mb((W.png.blob.size * 4) / 3)} base64 · live on Amazon Bedrock`, 'active');
    $('#verdict').innerHTML = ''; $('#catRoot').innerHTML = '';
    try {
      const r = await api.classify(await blobToBase64(W.png.blob), CATEGORY_IDS);
      if (!live()) return;
      setRow('ai', 'Classified by Claude Haiku', `${catLong(r.category)} ${Math.round(r.confidence * 100)}% · ${(r.ms / 1000).toFixed(1)}s`, 'done');
      W.result = r; W.cat = r.category; $('#scan').classList.remove('on');
      $('#aNext').disabled = false;
      paintVerdict();
    } catch (e) {
      if (!live()) return;
      if (e.code === 'aws_auth') onAuthError?.(e);
      $('#scan').classList.remove('on');
      setRow('ai', esc(e.title || 'Classification failed'), `${esc(e.message)}<span class="acts2"><button class="rr-btn soft sm" id="aiRetry">Retry</button><button class="rr-btn ghost sm" id="aiManual">Pick the type myself</button></span>`, 'err');
      $('#aiRetry').onclick = () => classify(tok);
      $('#aiManual').onclick = () => { setRow('ai', 'Type chosen by hand', 'no AI result', 'done'); W.result = { scores: null }; paintVerdict(); };
    }
  }
  function paintVerdict() {
    const r = W.result, ai = !!r?.category, low = ai && r.confidence < 0.7, changed = ai && W.cat !== r.category;
    $('#verdict').innerHTML = !ai
      ? `<div class="v">${W.cat ? `It's a <em>${catWord(W.cat)}</em>` : 'What is it?'}</div>`
      : changed
        ? `<div class="v">Got it, it's a <em>${catWord(W.cat)}</em></div><span class="rr-pill good">${icon('check', 12)}Corrected by you</span>`
        : `<div class="v">Looks like a <em>${catWord(r.category)}</em></div><span class="rr-pill ${low ? 'warn' : 'ai'}">${low ? 'Not sure, please check' : icon('spark', 12) + Math.round(r.confidence * 100) + '% sure'}</span>${r.reason ? `<div class="reason">“${esc(r.reason)}”</div>` : ''}`;
    $('#verdict').insertAdjacentHTML('beforeend', `<div class="rr-muted rr-small" style="margin:8px 0 6px">${ai ? 'Not right? Pick the right one:' : 'Pick the type:'}</div>`);
    categoryPicker($('#catRoot'), r, W.cat, c => { W.cat = c; $('#aNext').disabled = false; paintVerdict(); });
  }

  async function go(n) {
    W.step = n; paintSteps();
    document.querySelectorAll('.astep').forEach(s => s.classList.toggle('on', +s.dataset.s === n));
    $('#aBack').style.visibility = n === 1 ? 'hidden' : 'visible';
    const next = $('#aNext');
    next.innerHTML = n === 3 ? icon('spark', 16) + 'Put it in the room' : 'Next';
    next.disabled = n === 1 ? !W.file : n === 2 ? !W.cat : false;
    if (n === 1) paintPhotoStep();
    if (n === 2 && !W.result) { $('#scanImg').removeAttribute('src'); $('#verdict').innerHTML = ''; $('#catRoot').innerHTML = ''; runPipeline(++W.token); }
    if (n === 3) {
      const joins = stage.has(W.cat) ? ` · joins the ${catLong(W.cat).toLowerCase()} already in the room` : '';
      $('#mini').innerHTML = `<img src="${W.png.url}" alt=""><div><b>${icon(W.cat, 16)}${esc(catLong(W.cat))}</b><span class="rr-muted rr-small">What you paid and who chipped in${joins}</span></div>`;
      W.form = detailsForm($('#formRoot'), { name: W.result?.category === W.cat ? W.result?.suggestedName || '' : '' });
    }
  }

  let saving = false;
  $('#aNext').onclick = async () => {
    if (W.step < 3) return go(W.step + 1);
    const res = W.form.read();
    if (res.error) return toast(res.error);
    if (saving) return; saving = true; $('#aNext').disabled = true;
    try {
      const item = await api.createItem({
        ...res.value, category: W.cat, image: await blobToBase64(W.png.blob), createdBy: store.me,
        aiCategory: W.result?.category ?? null, aiConfidence: W.result?.confidence ?? null,
      });
      close();
      const joined = store.itemsOf(item.category).length > 0;
      await store.refresh();
      toast(`${icon(item.category, 16)} ${esc(item.name)} ${joined ? `joined the ${catLong(item.category).toLowerCase()} · tap it and use the arrows` : `added · split ${Object.keys(item.splits).length} way${Object.keys(item.splits).length === 1 ? '' : 's'}`}`, 3400);
    } catch (e) { toast(esc(e.message), 4000); }
    saving = false; $('#aNext').disabled = false;
  };
  $('#aBack').onclick = () => { if (W.step === 2) { W.file = null; W.result = null; W.cat = null; } go(W.step - 1); };
  $('#aClose').onclick = () => close();

  function openCard() {
    onOpen?.();
    if (W.png?.url) URL.revokeObjectURL(W.png.url);
    Object.assign(W, { step: 1, file: null, png: null, result: null, cat: null, form: null });
    open = true; $('#acard').classList.add('open'); stage.setInteractive(false);
    go(1);
  }
  function close() { open = false; W.token++; $('#acard').classList.remove('open'); stage.setInteractive(true); }

  /* follow the marker every frame */
  stage.onFrame(() => {
    if (!open) return;
    const mk = stage.screenOfMarker(), ac = $('#acard'), cw = ac.offsetWidth, ch = ac.offsetHeight;
    const rightEdge = innerWidth - 12 - (document.querySelector('#drawerR.open') ? $('#drawerR').offsetWidth + 16 : 0);
    const flip = mk.x + 34 + cw > rightEdge;
    ac.classList.toggle('flip', flip);
    const left = flip ? mk.x - 34 - cw : mk.x + 34;
    const top = Math.min(innerHeight - ch - 16, Math.max(82, mk.y - 6 - ch / 2));
    Object.assign(ac.style, { left: Math.max(12, left) + 'px', top: top + 'px' });
    ac.style.setProperty('--ty', Math.min(ch - 24, Math.max(24, mk.y - 6 - top)) + 'px');
  });

  return { open: openCard, close, get isOpen() { return open; } };
}
