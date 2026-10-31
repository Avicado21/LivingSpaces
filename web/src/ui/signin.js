/* Local sign-in: first run sets up the household and its roommates; after that
   you pick who you are (or join as a new roommate). No passwords: this is a
   local prototype. */
import { $, esc, avatar } from '../lib/dom.js';
import { api } from '../lib/api.js';

export function signIn() {
  return new Promise(resolve => {
    const wrap = $('#login'), form = $('#loginForm');
    wrap.classList.remove('gone');
    const logo = '<span class="logo" style="width:44px;height:44px;border-radius:14px;font-size:17px">lS</span>';

    async function start() {
      let data;
      try { data = await api.household(); }
      catch (e) { form.innerHTML = `${logo}<h1>livingSpaces</h1><p class="err">${esc(e.message)}</p><button type="button" class="rr-btn block" id="retry">Try again</button>`; $('#retry').onclick = start; return; }
      data.household ? pick(data) : setup();
    }

    function setup() {
      form.innerHTML = `${logo}<h1>Welcome to livingSpaces</h1><p>Set up your place. You can add more roommates later.</p>
        <label class="rr-field"><span>Household</span><input class="rr-input" name="hh" maxlength="60" placeholder="e.g. Apt 4B" required></label>
        <div class="rr-field"><span>Roommates</span><div class="names">
          <input class="rr-input" name="rm" maxlength="30" placeholder="Your name" required>
          <input class="rr-input" name="rm" maxlength="30" placeholder="Roommate">
          <input class="rr-input" name="rm" maxlength="30" placeholder="Roommate">
        </div><button type="button" class="switch" id="moreRm">+ another roommate</button></div>
        <p class="err" id="err"></p><button class="rr-btn block">Create household</button>`;
      $('#moreRm').onclick = () => $('.login .names').insertAdjacentHTML('beforeend', '<input class="rr-input" name="rm" maxlength="30" placeholder="Roommate">');
      form.onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(form), names = fd.getAll('rm').map(s => String(s).trim()).filter(Boolean);
        try {
          const r = await api.createHousehold(String(fd.get('hh') || '').trim(), names);
          done(r.roommates[0]);
        } catch (err) { $('#err').textContent = err.message; }
      };
    }

    function pick({ household, roommates }) {
      form.innerHTML = `${logo}<h1>Welcome to livingSpaces</h1><p>${esc(household.name)} · who's this?</p>
        <div class="who-list">${roommates.map(r => `<button type="button" class="who" data-id="${r.id}">${avatar(r, 34)}${esc(r.name)}<small>sign in</small></button>`).join('')}</div>
        <div class="row"><input class="rr-input" name="newName" maxlength="30" placeholder="New roommate? Your name"><button class="rr-btn ghost" id="join" type="submit">Join</button></div>
        <p class="err" id="err"></p>`;
      form.querySelectorAll('.who').forEach(b => b.onclick = () => done(roommates.find(r => String(r.id) === b.dataset.id)));
      form.onsubmit = async e => {
        e.preventDefault();
        const name = String(new FormData(form).get('newName') || '').trim();
        if (!name) return ($('#err').textContent = 'Type your name to join');
        try { done(await api.addRoommate(name)); } catch (err) { $('#err').textContent = err.message; }
      };
    }

    function done(roommate) { wrap.classList.add('gone'); resolve(roommate); }
    start();
  });
}
