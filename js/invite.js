/* Toegang met een uitnodigingscode. Supabase controleert de code zelf (redeem_invite);
   zonder lidmaatschap geeft de databank niets prijs. Het dagboek zelf blijft altijd lokaal. */
'use strict';

function needsInvite() { return cloudReady() && !DB.settings.member; }

function renderInvite(msg) {
  let h = '<div class="hero"><h1>Voedingsdagboek</h1><p>Deze app is enkel op uitnodiging. Vul de code in die je kreeg.</p></div>';
  h += '<div class="card"><label class="fld"><span>Uitnodigingscode</span><input id="invcode" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="bv. VRIEND-ABCD-EFGH" value="' + esc(DB.settings.pendingCode || '') + '"></label>' +
    (msg ? '<p class="note">' + esc(msg) + '</p>' : '') +
    '<button class="btn big" data-act="redeem">Doorgaan</button>' +
    '<p class="muted small">Je hebt hiervoor één keer internet nodig. Daarna werkt de app ook offline. Je dagboek en trainingsschema’s blijven lokaal in deze browser. Producten, gedeelde recepten en beoordelingen gaan naar de gedeelde bibliotheek als je ze deelt; receptfoto’s zijn via hun openbare afbeeldingslink bereikbaar. Als je zelf een AI-analyse start, stuurt de app je profiel en maximaal 21 dagen relevante dagboekgegevens, inclusief notities, naar Anthropic. De stemmingmodule gebruikt alleen numerieke waarden en leest geen vrije notities.</p></div>';
  view().innerHTML = h;
  $('nav.tabs').hidden = true;
}
ACT.redeem = async el => {
  const code = ($('#invcode').value || '').trim().toUpperCase();
  if (code.length < 6) return renderInvite('Vul de volledige code in.');
  if (!navigator.onLine) return renderInvite('Je bent offline. Maak verbinding met internet en probeer opnieuw.');
  el.disabled = true; el.textContent = 'Controleren…';
  try {
    await ensureSession();
    const ok = await sb('/rest/v1/rpc/redeem_invite', { method: 'POST', body: { p_code: code } });
    if (ok === true) {
      DB.settings.member = true; DB.settings.inviteCode = code.split('-')[0]; delete DB.settings.pendingCode; save();
      toast('Welkom!'); cloudSync(true); checkAdmin();
      $('nav.tabs').hidden = false;
      go(DB.intakeDone ? '#/' : '#/intake');
    } else { DB.settings.pendingCode = code; renderInvite('Deze code klopt niet, is ingetrokken of al te vaak gebruikt.'); }
  } catch (e) { renderInvite('Controleren mislukt: ' + e.message); }
};
/* Bij het opstarten: nog lid? (code ingetrokken of nieuwe anonieme sessie) */
async function checkMembership() {
  if (!cloudReady() || !DB.settings.member || !navigator.onLine) return;
  try { await ensureSession(); const ok = await sb('/rest/v1/rpc/is_member', { method: 'POST', body: {} }); if (ok === false) { DB.settings.member = false; save(); render(); } } catch (e) { }
}
