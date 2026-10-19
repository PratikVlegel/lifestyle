/* Beheer: uitnodigingscodes maken en intrekken. Alleen zichtbaar voor beheerders;
   de databank controleert zelf of je beheerder bent (is_admin). */
'use strict';

async function checkAdmin() {
  if (!cloudReady() || !DB.settings.member || !navigator.onLine) return;
  try { await ensureSession(); const a = await sb('/rest/v1/rpc/is_admin', { method: 'POST', body: {} }); if (DB.settings.admin !== (a === true)) { DB.settings.admin = a === true; save(); if (/^#\/(meer)?$/.test(location.hash)) render(); } } catch (e) { }
}
function inviteText(code) {
  return 'Hoi! Ik gebruik een app voor mijn voedingsdagboek en mealpreps. Doe je mee?\n\n' +
    'Android:\n1. Open ' + APP_LINK + ' in Chrome\n2. Menu ⋮ → App installeren\n3. Open de app en vul de code in\n\n' +
    'iPhone:\n1. Open ' + APP_LINK + ' in Safari\n2. Deelknop (vierkant met pijl) → Zet op beginscherm → Voeg toe\n3. Open de app via het nieuwe icoon op je beginscherm (niet in Safari) en vul daar de code in\n\n' +
    'Code: ' + code + '\n\nJe dagboek blijft lokaal in je browser. Gedeelde producten, recepten en beoordelingen staan in de gedeelde bibliotheek; receptfoto’s zijn via hun openbare afbeeldingslink bereikbaar. Alleen gegevens die je voor een AI-actie invoert, worden daarvoor naar Anthropic gestuurd.';
}
let INV_LAST = null;
async function renderAdmin() {
  let h = header('Vrienden uitnodigen', 'Alleen jij ziet dit scherm', true);
  if (!DB.settings.admin) { view().innerHTML = h + '<p class="note">Alleen beheerders kunnen uitnodigen.</p>'; return; }
  h += '<div class="card"><label class="fld"><span>Voor wie?</span><input id="invname" placeholder="bv. Jan" autocomplete="off"></label>' +
    '<div class="fld"><span>Hoe vaak mag de code gebruikt worden?</span><div class="seg" id="invmax">' + [1, 3, 10].map((n, i) => '<button class="' + (i === 0 ? 'on' : '') + '" data-act="invMax" data-n="' + n + '">' + n + '×</button>').join('') + '</div><small class="muted">1× is het veiligst: één code per persoon.</small></div>' +
    '<button class="btn big" data-act="invCreate">Code maken</button></div>';
  if (INV_LAST) h += '<div class="card fb"><b>Nieuwe code: <span class="code">' + esc(INV_LAST) + '</span></b><div class="inrow wrap"><button class="btn" data-act="invShare" data-c="' + esc(INV_LAST) + '">Uitnodiging sturen</button><button class="btn ghost" data-act="invCopy" data-c="' + esc(INV_LAST) + '">Kopieer code</button></div></div>';
  h += '<h2 class="sec">Codes</h2><div id="invlist"><p class="muted">Laden…</p></div>';
  view().innerHTML = h;
  if (!navigator.onLine) { $('#invlist').innerHTML = '<p class="note">Offline: codes laden kan alleen met internet.</p>'; return; }
  try {
    await ensureSession();
    const rows = await sb('/rest/v1/rpc/list_invites', { method: 'POST', body: {} });
    $('#invlist').innerHTML = '<div class="card table">' + rows.map(r => '<div class="tr"><span><b class="code">' + esc(r.code) + '</b>' + (r.label ? ' <span class="muted">· ' + esc(r.label) + '</span>' : '') + '</span><b>' + r.uses + '/' + r.max_uses + '</b><small>' + (r.members ? r.members + ' lid' + (r.members > 1 ? 'en' : '') + ' · ' : '') + (r.active ? 'actief' : 'ingetrokken') + ' · ' + new Date(r.created_at).toLocaleDateString('nl-BE') +
      (/^PRATIK-/.test(r.code) ? '' : ' · <button class="link' + (r.active ? ' danger' : '') + '" data-act="invToggle" data-c="' + esc(r.code) + '" data-a="' + (r.active ? 0 : 1) + '">' + (r.active ? 'Intrekken' : 'Opnieuw activeren') + '</button>') +
      (r.active && r.uses < r.max_uses ? ' · <button class="link" data-act="invShare" data-c="' + esc(r.code) + '">Sturen</button>' : '') + '</small></div>').join('') + '</div>' +
      '<p class="muted small">Intrekken blokkeert alleen nieuwe gebruikers van die code. Wie al lid is, blijft lid.</p>';
  } catch (e) { $('#invlist').innerHTML = '<p class="note">Laden mislukt: ' + esc(e.message) + '</p>'; }
}
ACT.invMax = el => { document.querySelectorAll('#invmax button').forEach(b => b.classList.toggle('on', b === el)); };
ACT.invCreate = async el => {
  const name = ($('#invname').value || '').trim();
  if (!name) return toast('Voor wie is de code?');
  const max = Number((document.querySelector('#invmax button.on') || {}).dataset?.n || 1);
  el.disabled = true;
  try { await ensureSession(); INV_LAST = await sb('/rest/v1/rpc/create_invite', { method: 'POST', body: { p_label: name, p_max: max } }); renderAdmin(); }
  catch (e) { toast('Mislukt: ' + e.message); el.disabled = false; }
};
ACT.invShare = el => shareText(inviteText(el.dataset.c), 'Uitnodiging voedingsdagboek');
ACT.invCopy = async el => { try { await navigator.clipboard.writeText(el.dataset.c); toast('Code gekopieerd'); } catch (e) { prompt('Kopieer:', el.dataset.c); } };
ACT.invToggle = async el => {
  try { await sb('/rest/v1/rpc/set_invite_active', { method: 'POST', body: { p_code: el.dataset.c, p_active: el.dataset.a === '1' } }); renderAdmin(); }
  catch (e) { toast('Mislukt: ' + e.message); }
};
