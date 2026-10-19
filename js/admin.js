/* Beheer: uitnodigingscodes maken en intrekken. Alleen zichtbaar voor beheerders;
   de databank controleert zelf of je beheerder bent (is_admin). */
'use strict';

async function checkAdmin() {
  if (!cloudReady() || !DB.settings.member || !navigator.onLine) return;
  try { await ensureSession(); const a = await sb('/rest/v1/rpc/is_admin', { method: 'POST', body: {} }); if (DB.settings.admin !== (a === true)) { DB.settings.admin = a === true; save(); if (/^#\/(meer)?$/.test(location.hash)) render(); } } catch (e) { }
}
function inviteText(code, language = currentLocale()) {
  const copy = {
    'nl-BE': ['Hoi! Ik gebruik een app voor mijn voedingsdagboek en mealpreps. Doe je mee?', 'Android:', 'Open {link} in Chrome', 'Open het menu ⋮ en kies ‘App installeren’.', 'Open de app en vul de code in.', 'iPhone of iPad:', 'Open {link} in Safari.', 'Tik op Deel en kies ‘Zet op beginscherm’ en daarna ‘Voeg toe’.', 'Open de app via het nieuwe beginschermicoon en vul daar de code in.', 'Code:', 'Je dagboek en trainingsschema’s blijven lokaal in je browser. Producten, gedeelde recepten en beoordelingen staan in de gedeelde bibliotheek; receptfoto’s zijn via hun openbare afbeeldingslink bereikbaar.'],
    'en-GB': ['Hi! I use an app for my food diary and meal prep. Want to join?', 'Android:', 'Open {link} in Chrome.', 'Open the ⋮ menu and choose “Install app”.', 'Open the app and enter the code.', 'iPhone or iPad:', 'Open {link} in Safari.', 'Tap Share, then “Add to Home Screen” and “Add”.', 'Open the app from the new Home Screen icon and enter the code there.', 'Code:', 'Your diary and training plans stay in your browser. Products, shared recipes and reviews are stored in the shared library; recipe photos can be accessed through their public image link.'],
    'fr-FR': ['Salut ! J’utilise une application pour mon journal alimentaire et mes repas préparés. Tu veux nous rejoindre ?', 'Android :', 'Ouvre {link} dans Chrome.', 'Ouvre le menu ⋮ et choisis « Installer l’application ».', 'Ouvre l’application et saisis le code.', 'iPhone ou iPad :', 'Ouvre {link} dans Safari.', 'Appuie sur Partager, puis sur « Sur l’écran d’accueil » et « Ajouter ».', 'Ouvre l’application avec la nouvelle icône sur l’écran d’accueil et saisis le code.', 'Code :', 'Ton journal et tes programmes d’entraînement restent dans ton navigateur. Les produits, recettes partagées et évaluations sont enregistrés dans la bibliothèque partagée ; les photos de recettes sont accessibles via leur lien public.'],
    'de-DE': ['Hallo! Ich nutze eine App für mein Ernährungstagebuch und meine Meal-Prep-Gerichte. Möchtest du mitmachen?', 'Android:', 'Öffne {link} in Chrome.', 'Öffne das Menü ⋮ und wähle „App installieren“.', 'Öffne die App und gib den Code ein.', 'iPhone oder iPad:', 'Öffne {link} in Safari.', 'Tippe auf „Teilen“, dann auf „Zum Home-Bildschirm“ und „Hinzufügen“.', 'Öffne die App über das neue Home-Bildschirm-Symbol und gib dort den Code ein.', 'Code:', 'Dein Tagebuch und deine Trainingspläne bleiben in deinem Browser. Produkte, geteilte Rezepte und Bewertungen werden in der gemeinsamen Bibliothek gespeichert; Rezeptfotos sind über ihren öffentlichen Bildlink erreichbar.']
  }[UI_LOCALES.includes(language) ? language : currentLocale()] || null;
  const c = copy || ['Hi! I use an app for my food diary and meal prep. Want to join?', 'Android:', 'Open {link} in Chrome.', 'Open the ⋮ menu and choose “Install app”.', 'Open the app and enter the code.', 'iPhone or iPad:', 'Open {link} in Safari.', 'Tap Share, then “Add to Home Screen” and “Add”.', 'Open the app from the new Home Screen icon and enter the code there.', 'Code:', 'Your diary and training plans stay in your browser. Products, shared recipes and reviews are stored in the shared library; recipe photos can be accessed through their public image link.'];
  const aiDisclosure = {
    'nl-BE': 'Bij een vrijwillige AI-analyse worden je profiel en maximaal 21 dagen aan geregistreerde gegevens naar Anthropic gestuurd wanneer je zelf een verzoek doet.',
    'en-GB': 'Optional AI analysis sends your profile and up to 21 days of logged data to Anthropic when you make a request.',
    'fr-FR': 'Une analyse IA facultative envoie ton profil et jusqu’à 21 jours de données enregistrées à Anthropic lorsque tu en fais la demande.',
    'de-DE': 'Eine optionale KI-Analyse sendet dein Profil und bis zu 21 Tage deiner protokollierten Daten an Anthropic, wenn du sie selbst anforderst.'
  }[language] || 'Optional AI analysis sends your profile and up to 21 days of logged data to Anthropic when you make a request.';
  return c[0] + '\n\n' + c[1] + '\n1. ' + c[2].replace('{link}', APP_LINK) + '\n2. ' + c[3] + '\n3. ' + c[4] + '\n\n' + c[5] + '\n1. ' + c[6].replace('{link}', APP_LINK) + '\n2. ' + c[7] + '\n3. ' + c[8] + '\n\n' + c[9] + ' ' + code + '\n\n' + c[10] + ' ' + aiDisclosure;
}
let INV_LAST = null;
let INVITE_LANG = currentLocale();
async function renderAdmin() {
  let h = header('Vrienden uitnodigen', 'Alleen jij ziet dit scherm', true);
  if (!DB.settings.admin) { view().innerHTML = h + '<p class="note">' + tr('Alleen beheerders kunnen uitnodigen.') + '</p>'; return; }
  h += '<div class="card"><label class="fld"><span>' + tr('Taal van de uitnodiging') + '</span><select data-chg="inviteLanguage"><option value="nl-BE"' + (INVITE_LANG === 'nl-BE' ? ' selected' : '') + '>' + tr('Nederlands') + '</option><option value="en-GB"' + (INVITE_LANG === 'en-GB' ? ' selected' : '') + '>' + tr('Engels') + '</option><option value="fr-FR"' + (INVITE_LANG === 'fr-FR' ? ' selected' : '') + '>' + tr('Frans') + '</option><option value="de-DE"' + (INVITE_LANG === 'de-DE' ? ' selected' : '') + '>' + tr('Duits') + '</option></select></label><p class="muted small">' + tr('Deel de uitnodiging in de taal van je vriend(in).') + '</p></div>';
  h += '<div class="card"><label class="fld"><span>' + tr('Voor wie?') + '</span><input id="invname" placeholder="' + tr('bv. Jan') + '" autocomplete="off"></label>' +
    '<div class="fld"><span>' + tr('Hoe vaak mag de code gebruikt worden?') + '</span><div class="seg" id="invmax">' + [1, 3, 10].map((n, i) => '<button class="' + (i === 0 ? 'on' : '') + '" data-act="invMax" data-n="' + n + '">' + n + '×</button>').join('') + '</div><small class="muted">' + tr('1× is het veiligst: één code per persoon.') + '</small></div>' +
    '<button class="btn big" data-act="invCreate">' + tr('Code maken') + '</button></div>';
  if (INV_LAST) h += '<div class="card fb"><b>' + tr('Nieuwe code:') + ' <span class="code">' + esc(INV_LAST) + '</span></b><div class="inrow wrap"><button class="btn" data-act="invShare" data-c="' + esc(INV_LAST) + '">' + tr('Uitnodiging sturen') + '</button><button class="btn ghost" data-act="invCopy" data-c="' + esc(INV_LAST) + '">' + tr('Kopieer code') + '</button></div></div>';
  h += '<h2 class="sec">' + tr('Codes') + '</h2><div id="invlist"><p class="muted">' + tr('Laden…') + '</p></div>';
  view().innerHTML = h;
  if (!navigator.onLine) { $('#invlist').innerHTML = '<p class="note">' + tr('Offline: codes laden kan alleen met internet.') + '</p>'; return; }
  try {
    await ensureSession();
    const rows = await sb('/rest/v1/rpc/list_invites', { method: 'POST', body: {} });
    $('#invlist').innerHTML = '<div class="card table">' + rows.map(r => '<div class="tr"><span><b class="code">' + esc(r.code) + '</b>' + (r.label ? ' <span class="muted">· ' + esc(r.label) + '</span>' : '') + '</span><b>' + r.uses + '/' + r.max_uses + '</b><small>' + (r.members ? trf('{count} leden', { count: r.members }) + ' · ' : '') + tr(r.active ? 'actief' : 'ingetrokken') + ' · ' + new Date(r.created_at).toLocaleDateString(currentLocale()) +
      (/^PRATIK-/.test(r.code) ? '' : ' · <button class="link' + (r.active ? ' danger' : '') + '" data-act="invToggle" data-c="' + esc(r.code) + '" data-a="' + (r.active ? 0 : 1) + '">' + tr(r.active ? 'Intrekken' : 'Opnieuw activeren') + '</button>') +
      (r.active && r.uses < r.max_uses ? ' · <button class="link" data-act="invShare" data-c="' + esc(r.code) + '">' + tr('Sturen') + '</button>' : '') + '</small></div>').join('') + '</div>' +
      '<p class="muted small">' + tr('Intrekken blokkeert alleen nieuwe gebruikers van die code. Wie al lid is, blijft lid.') + '</p>';
  } catch (e) { console.error('Uitnodigingscodes laden mislukt', e); $('#invlist').innerHTML = '<p class="note">' + tr('Uitnodigingscodes laden is mislukt. Probeer het opnieuw.') + '</p>'; }
}
ACT.invMax = el => { document.querySelectorAll('#invmax button').forEach(b => b.classList.toggle('on', b === el)); };
ACT.invCreate = async el => {
  const name = ($('#invname').value || '').trim();
  if (!name) return toast(tr('Voor wie is de code?'));
  const max = Number((document.querySelector('#invmax button.on') || {}).dataset?.n || 1);
  el.disabled = true;
  try { await ensureSession(); INV_LAST = await sb('/rest/v1/rpc/create_invite', { method: 'POST', body: { p_label: name, p_max: max } }); renderAdmin(); }
  catch (e) { console.error('Uitnodigingscode maken mislukt', e); toast(tr('Uitnodigingscode maken is mislukt. Probeer het opnieuw.')); el.disabled = false; }
};
ACT.inviteLanguage = el => { if (UI_LOCALES.includes(el.value)) INVITE_LANG = el.value; };
ACT.invShare = el => shareText(inviteText(el.dataset.c, INVITE_LANG), tr('Uitnodiging voedingsdagboek'));
ACT.invCopy = async el => { try { await navigator.clipboard.writeText(el.dataset.c); toast(tr('Code gekopieerd')); } catch (e) { prompt(tr('Kopieer:'), el.dataset.c); } };
ACT.invToggle = async el => {
  try { await sb('/rest/v1/rpc/set_invite_active', { method: 'POST', body: { p_code: el.dataset.c, p_active: el.dataset.a === '1' } }); renderAdmin(); }
  catch (e) { console.error('Uitnodigingscode aanpassen mislukt', e); toast(tr('Uitnodigingscode aanpassen is mislukt. Probeer het opnieuw.')); }
};
