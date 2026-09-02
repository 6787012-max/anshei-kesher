AUTH.requireLogin();

/** ================= OCR ספח/ת"ז — רץ בדפדפן בלבד, בלי API בתשלום ================= */

async function runOcr() {
  const fileInput = document.getElementById('ocrFile');
  const file = fileInput.files[0];
  if (!file) return;
  const progressEl = document.getElementById('ocrProgress');
  const resultEl = document.getElementById('ocrResult');
  resultEl.innerHTML = '';
  progressEl.innerHTML = '<div class="msg ok">טוען מנוע זיהוי טקסט...</div>';

  try {
    const worker = await Tesseract.createWorker('heb', 1, {
      workerPath: 'vendor/tesseract/worker.min.js',
      corePath: 'vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
      langPath: 'vendor/tesseract/',
      gzip: true,
      logger: m => {
        if (m.status === 'recognizing text') {
          progressEl.innerHTML = `<div class="msg ok">מזהה טקסט... ${Math.round(m.progress * 100)}%</div>`;
        }
      }
    });
    const { data: { text } } = await worker.recognize(file);
    await worker.terminate();
    progressEl.innerHTML = '<div class="msg ok"><i class="bi bi-check2"></i> זיהוי הסתיים — בדוק/תקן לפני שמירה</div>';
    showOcrExtraction(text);
  } catch (e) {
    progressEl.innerHTML = `<div class="msg err">שגיאת זיהוי: ${e.message}</div>`;
  }
}

function extractFromOcrText(text) {
  const idMatch = text.match(/\b\d{9}\b/) || text.match(/\b\d{7,8}\b/);
  const dateMatch = text.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/);
  let birthDate = '';
  if (dateMatch) {
    const [, d, m, y] = dateMatch;
    birthDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // שם: השורה הראשונה שמכילה רק אותיות עבריות ורווחים, אורך סביר,
  // ולא כותרת סטנדרטית של ספח ת"ז (מדינת ישראל / תעודת זהות / משרד הפנים).
  const HEADER_WORDS = /מדינת|ישראל|תעודת|זהות|משרד|הפנים|רשות|אוכלוסין/;
  const nameLine = text.split('\n').map(l => l.trim())
    .find(l => /^[֐-׿\s'"]{3,40}$/.test(l) && l.split(/\s+/).length <= 4 && !HEADER_WORDS.test(l));
  let firstName = '', lastName = '';
  if (nameLine) {
    const parts = nameLine.split(/\s+/);
    firstName = parts[0] || '';
    lastName = parts.slice(1).join(' ') || '';
  }
  return { id_number: idMatch ? idMatch[0] : '', birth_date: birthDate, first_name: firstName, last_name: lastName };
}

function showOcrExtraction(rawText) {
  const guess = extractFromOcrText(rawText);
  const resultEl = document.getElementById('ocrResult');
  resultEl.innerHTML = `
    <div class="card" style="margin-top:0">
      <p style="font-size:.82rem; color:var(--muted)">שדות שזוהו — תקן במידת הצורך, ואז "מלא בטופס למטה":</p>
      <div class="field-grid">
        <label>שם פרטי<input id="ocr_first"></label>
        <label>שם משפחה<input id="ocr_last"></label>
        <label>ת"ז<input id="ocr_id"></label>
        <label>תאריך לידה<input id="ocr_birth" type="date"></label>
      </div>
      <button class="primary" onclick="applyOcrToForm()"><i class="bi bi-arrow-down-circle"></i> מלא בטופס למטה</button>
      <details style="margin-top:10px"><summary style="cursor:pointer; color:var(--muted); font-size:.8rem">טקסט גולמי שזוהה</summary>
        <pre style="white-space:pre-wrap; font-size:.75rem; color:var(--muted); margin-top:6px">${rawText.replace(/</g, '&lt;')}</pre>
      </details>
    </div>`;
  document.getElementById('ocr_first').value = guess.first_name;
  document.getElementById('ocr_last').value = guess.last_name;
  document.getElementById('ocr_id').value = guess.id_number;
  document.getElementById('ocr_birth').value = guess.birth_date;
}

function applyOcrToForm() {
  document.getElementById('f_first_name').value = val('ocr_first');
  document.getElementById('f_last_name').value = val('ocr_last');
  document.getElementById('f_id_number').value = val('ocr_id');
  document.getElementById('f_birth_date').value = val('ocr_birth');
  document.getElementById('f_first_name').scrollIntoView({ behavior: 'smooth' });
}

/** ================= חיפוש גלובלי (בראש הדף) ================= */

let globalSearchCache = null;
let globalSearchTimer = null;

function runGlobalSearch() {
  clearTimeout(globalSearchTimer);
  globalSearchTimer = setTimeout(async () => {
    const q = document.getElementById('globalSearch').value.trim().toLowerCase();
    const resultsEl = document.getElementById('globalSearchResults');
    if (q.length < 2) { resultsEl.style.display = 'none'; return; }
    if (!globalSearchCache) globalSearchCache = await AUTH.rpc('people_for_me', {}) || [];
    const matches = globalSearchCache.filter(p => {
      const hay = [p.first_name, p.last_name, p.id_number, p.phone, p.phone2, p.street, p.city]
        .concat(p.aliases || []).filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    }).slice(0, 10);
    if (!matches.length) {
      resultsEl.innerHTML = '<div style="padding:12px; color:var(--muted); font-size:.85rem">אין תוצאות</div>';
    } else {
      resultsEl.innerHTML = matches.map(p =>
        `<div style="padding:10px 14px; border-bottom:1px solid var(--line); color:var(--ink)">` +
        `<b>${p.first_name || ''} ${p.last_name || ''}</b>` +
        `<div style="font-size:.78rem; color:var(--muted)">${[p.id_number, p.phone, p.street].filter(Boolean).join(' · ')}</div></div>`
      ).join('');
    }
    resultsEl.style.display = 'block';
  }, 250);
}

document.addEventListener('click', e => {
  if (!e.target.closest('#globalSearch') && !e.target.closest('#globalSearchResults')) {
    const r = document.getElementById('globalSearchResults');
    if (r) r.style.display = 'none';
  }
});

document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById(t.dataset.panel).classList.add('active');
    if (t.dataset.panel === 'homePanel') refreshDashboard();
    if (t.dataset.panel === 'auditPanel') refreshAuditLog();
    if (t.dataset.panel === 'usersPanel') refreshUsersList();
  };
});

/** ================= משתמשים והרשאות ================= */

function toggleLimitedFields() {
  document.getElementById('u_limitedFields').style.display = val('u_level') === 'full' ? 'none' : 'block';
}

async function callAdminFn(payload) {
  const session = AUTH.getSession();
  const res = await fetch(`${CFG.url}/functions/v1/anshei-kesher-admin`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': CFG.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'שגיאה');
  return data;
}

async function createUser() {
  const email = val('u_email');
  const password = val('u_password');
  const access_level = val('u_level');
  const allowed_fields = Array.from(document.querySelectorAll('.u_field:checked')).map(el => el.value);
  const allowed_categories = val('u_categories') ? val('u_categories').split(',').map(s => s.trim()).filter(Boolean) : [];
  try {
    const result = await callAdminFn({ action: 'create_user', email, password, access_level, allowed_fields, allowed_categories });
    logAudit('create', 'user', result.user_id, { email, access_level });
    showMsg('userMsg', 'המשתמש נוצר בהצלחה. תעביר לו את הסיסמה הזמנית בערוץ מאובטח.', 'ok');
    document.getElementById('u_email').value = '';
    document.getElementById('u_password').value = '';
    document.getElementById('u_categories').value = '';
    refreshUsersList();
  } catch (e) {
    showMsg('userMsg', 'שגיאה: ' + e.message, 'err');
  }
}

async function deleteUser(userId, email) {
  if (!confirm(`למחוק את המשתמש ${email}?`)) return;
  try {
    await callAdminFn({ action: 'delete_user', user_id: userId });
    logAudit('delete', 'user', userId, { email });
    refreshUsersList();
  } catch (e) {
    alert('שגיאה: ' + e.message);
  }
}

async function refreshUsersList() {
  const el = document.getElementById('usersList');
  const users = await AUTH.api('app_users?select=*');
  if (!users || !users.length) { el.innerHTML = '<p style="color:var(--muted)">אין משתמשים</p>'; return; }
  el.innerHTML = '<table><tr><th>אימייל</th><th>רמת גישה</th><th>שדות מותרים</th><th>קטגוריות מותרות</th><th></th></tr>' +
    users.map(u => `<tr><td>${u.email}</td><td>${u.access_level}</td>` +
      `<td style="font-size:.78rem">${(u.allowed_fields||[]).join(', ')}</td>` +
      `<td style="font-size:.78rem">${(u.allowed_categories||[]).join(', ')}</td>` +
      `<td>${u.email === AUTH.getSession().user.email ? '' :
        `<button class="secondary" style="margin:0; font-size:.75rem; padding:4px 10px" onclick="deleteUser('${u.user_id}','${u.email}')"><i class="bi bi-trash"></i></button>`}</td></tr>`
    ).join('') + '</table>';
}

/** ================= יומן ביקורת ================= */

async function logAudit(action, entity, entityId, detail) {
  try {
    const session = AUTH.getSession();
    await AUTH.api('audit_log', {
      method: 'POST',
      body: JSON.stringify({
        actor: session.user.id, actor_email: session.user.email,
        action, entity, entity_id: entityId || null, detail: detail || {}
      })
    });
  } catch (e) { /* לא חוסמים את הפעולה עצמה אם הלוג נכשל */ }
}

async function refreshAuditLog() {
  const el = document.getElementById('auditList');
  let rows;
  try {
    rows = await AUTH.api('audit_log?select=*&order=created_at.desc&limit=100');
  } catch (e) {
    el.innerHTML = `<div class="msg err">${e.message}</div>`;
    return;
  }
  if (!rows.length) { el.innerHTML = '<p style="color:var(--muted)">אין עדיין רשומות</p>'; return; }
  let html = '<table><tr><th>מתי</th><th>מי</th><th>פעולה</th><th>סוג</th><th>פרטים</th><th></th></tr>';
  rows.forEach(r => {
    const when = new Date(r.created_at).toLocaleString('he-IL');
    const undoBtn = r.action === 'merge'
      ? `<button class="secondary" style="margin:0; font-size:.75rem; padding:4px 10px" onclick="undoLastMerge('${r.entity_id}')"><i class="bi bi-arrow-counterclockwise"></i> בטל מיזוג</button>`
      : '';
    html += `<tr><td>${when}</td><td>${r.actor_email || ''}</td><td>${r.action}</td><td>${r.entity}</td>` +
      `<td style="font-size:.78rem; color:var(--muted)">${JSON.stringify(r.detail || {})}</td><td>${undoBtn}</td></tr>`;
  });
  html += '</table>';
  el.innerHTML = html;
}

/** ================= דשבורד ================= */

async function refreshDashboard() {
  const stats = await AUTH.rpc('dashboard_stats', {});
  const cardsEl = document.getElementById('dashboardCards');
  const cards = [
    { icon: 'bi-people-fill', label: 'סה"כ אנשי קשר', value: stats.total_people },
    { icon: 'bi-house-heart', label: 'משפחות', value: stats.total_families },
    { icon: 'bi-envelope', label: 'ללא מייל', value: stats.missing_email },
    { icon: 'bi-telephone', label: 'ללא טלפון', value: stats.missing_phone },
    { icon: 'bi-star', label: 'בר/בת מצווה ב-90 יום הקרובים', value: stats.upcoming_bar_mitzva_90d },
  ];
  cardsEl.innerHTML = cards.map(c =>
    `<div class="card" style="text-align:center; padding:18px">
      <i class="bi ${c.icon}" style="font-size:1.6rem; color:var(--primary)"></i>
      <div style="font-size:1.8rem; font-weight:800; color:var(--primary-dark); margin-top:6px">${c.value}</div>
      <div style="font-size:.8rem; color:var(--muted)">${c.label}</div>
    </div>`
  ).join('');

  const FALLBACK_LABELS = { lelo_kita: 'ללא כיתה', lo_yadua: 'לא ידוע', lo_tzuyan: 'לא צוין' };
  const label = k => FALLBACK_LABELS[k] || k;

  const classEl = document.getElementById('classBreakdown');
  const byClass = stats.by_class || {};
  classEl.innerHTML = Object.keys(byClass).map(k =>
    `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line)">
      <span>${label(k)}</span><b>${byClass[k]}</b></div>`
  ).join('') || '<p style="color:var(--muted)">אין נתונים</p>';

  const yearEl = document.getElementById('yearBreakdown');
  if (yearEl) {
    const byYear = stats.by_birth_year || {};
    const years = Object.keys(byYear).sort();
    yearEl.innerHTML = years.map(y =>
      `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line)">
        <span>${y}</span><b>${byYear[y]}</b></div>`
    ).join('') || '<p style="color:var(--muted)">אין נתונים</p>';
  }

  const EVENT_LABELS = { yom_huledet: 'יום הולדת', bar_bat_mitzva: 'בר/בת מצווה', yom_nisuin: 'יום נישואין' };
  const EVENT_ICONS = { yom_huledet: 'bi-balloon', bar_bat_mitzva: 'bi-star', yom_nisuin: 'bi-heart' };
  const eventsEl = document.getElementById('upcomingEvents');
  if (eventsEl) {
    const events = (await AUTH.rpc('upcoming_events', { days_ahead: 90 }) || [])
      .filter(e => e.days_until >= 0 && e.days_until <= 90);
    eventsEl.innerHTML = events.length ? events.map(e =>
      `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--line)">
        <span><i class="bi ${EVENT_ICONS[e.event_type]}" style="color:var(--accent)"></i> ${e.full_name} — ${EVENT_LABELS[e.event_type]}</span>
        <b>${e.days_until === 0 ? 'היום!' : 'בעוד ' + e.days_until + ' ימים'}</b></div>`
    ).join('') : '<p style="color:var(--muted)">אין אירועים ב-90 הימים הקרובים</p>';
  }
}
refreshDashboard();

function val(id) { return document.getElementById(id).value; }
function showMsg(elId, text, cls) {
  document.getElementById(elId).innerHTML = `<div class="msg ${cls}">${text}</div>`;
}

/** ================= הוספה ידנית ================= */

async function submitPerson() {
  const spouseId = val('f_spouse') || null;
  const person = {
    first_name: val('f_first_name'), last_name: val('f_last_name'),
    id_number: val('f_id_number') || null, birth_date: val('f_birth_date') || null,
    bar_mitzva_date: val('f_bar_mitzva_date') || null,
    edah: val('f_edah'), gender: val('f_gender') || null,
    street: val('f_street'), city: val('f_city'), school_class: val('f_school_class'),
    phone: val('f_phone'), phone2: val('f_phone2'), email: val('f_email'),
    role_in_family: val('f_role'), institution: val('f_institution'),
    housing_status: val('f_housing'),
    aliases: val('f_aliases') ? val('f_aliases').split(',').map(s => s.trim()).filter(Boolean) : [],
    notes: val('f_notes'), source: 'manual'
  };
  try {
    const created = await AUTH.api('people', {
      method: 'POST', body: JSON.stringify(person), headers: { 'Prefer': 'return=representation' }
    });
    const newId = created && created[0] && created[0].id;
    if (spouseId && newId) {
      await linkSpouses(newId, spouseId);
    }
    logAudit('create', 'person', newId, { name: person.first_name + ' ' + person.last_name });
    showMsg('addMsg', 'נשמר בהצלחה' + (spouseId ? ' וקושר לבן/בת הזוג' : ''), 'ok');
    ['f_first_name','f_last_name','f_id_number','f_birth_date','f_bar_mitzva_date','f_edah','f_street','f_city',
     'f_school_class','f_phone','f_phone2','f_email','f_institution','f_aliases','f_notes']
      .forEach(id => document.getElementById(id).value = '');
    document.getElementById('f_role').value = '';
    document.getElementById('f_housing').value = '';
    document.getElementById('f_spouse').value = '';
    loadPeopleIntoSelects();
    globalSearchCache = null;
  } catch (e) {
    showMsg('addMsg', 'שגיאה: ' + e.message, 'err');
  }
}

/** ================= משפחות: קישור בני זוג + כרטיס משפחה ================= */

// מקשר שני אנשים כבני זוג: spouse_id הדדי + אותו family_id (יוצר family אם צריך).
async function linkSpouses(personId, spouseId) {
  const spouse = (await AUTH.api(`people?id=eq.${spouseId}&select=family_id`))[0];
  let familyId = spouse && spouse.family_id;
  if (!familyId) {
    const fam = await AUTH.api('families', {
      method: 'POST', body: JSON.stringify({ head_of_family_id: spouseId }),
      headers: { 'Prefer': 'return=representation' }
    });
    familyId = fam[0].id;
    await AUTH.api(`people?id=eq.${spouseId}`, { method: 'PATCH', body: JSON.stringify({ family_id: familyId }) });
  }
  await AUTH.api(`people?id=eq.${personId}`, { method: 'PATCH',
    body: JSON.stringify({ spouse_id: spouseId, family_id: familyId }) });
  await AUTH.api(`people?id=eq.${spouseId}`, { method: 'PATCH',
    body: JSON.stringify({ spouse_id: personId }) });
}

async function loadPeopleIntoSelects() {
  const people = await AUTH.api('people?select=id,first_name,last_name,family_id&order=first_name') || [];
  ['f_spouse', 'fam_head', 'fam_spouse', 'rel_a', 'rel_b', 'ia_person'].forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const keep = sel.value;
    sel.innerHTML = '<option value="">' + (selId === 'f_spouse' ? '--' : 'בחר איש קשר...') + '</option>';
    people.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = `${p.first_name} ${p.last_name}`;
      sel.appendChild(opt);
    });
    sel.value = keep;
  });
}
loadPeopleIntoSelects();

async function createFamily() {
  const headId = val('fam_head');
  const spouseId = val('fam_spouse');
  if (!headId) { showMsg('famMsg', 'יש לבחור ראש משפחה', 'err'); return; }
  try {
    const head = (await AUTH.api(`people?id=eq.${headId}&select=family_id`))[0];
    let familyId = head.family_id;
    if (!familyId) {
      const fam = await AUTH.api('families', {
        method: 'POST', body: JSON.stringify({ head_of_family_id: headId }),
        headers: { 'Prefer': 'return=representation' }
      });
      familyId = fam[0].id;
      await AUTH.api(`people?id=eq.${headId}`, { method: 'PATCH', body: JSON.stringify({ family_id: familyId }) });
    }
    if (spouseId) await linkSpouses(spouseId, headId);
    showMsg('famMsg', 'כרטיס המשפחה נוצר', 'ok');
    document.getElementById('fam_head').value = '';
    document.getElementById('fam_spouse').value = '';
    refreshFamiliesList();
  } catch (e) {
    showMsg('famMsg', 'שגיאה: ' + e.message, 'err');
  }
}

function calcAge(birthDateStr) {
  if (!birthDateStr) return null;
  const bd = new Date(birthDateStr), today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age;
}

async function addRelation() {
  const a = val('rel_a'), b = val('rel_b'), type = val('rel_type');
  if (!a || !b || a === b) { showMsg('relMsg', 'יש לבחור שני אנשים שונים', 'err'); return; }
  try {
    await AUTH.api('relations', { method: 'POST', body: JSON.stringify({ person_a: a, person_b: b, relation_type: type }) });
    logAudit('create', 'relation', null, { a, b, type });
    showMsg('relMsg', 'הקשר נוסף', 'ok');
    refreshRelationsList();
  } catch (e) {
    showMsg('relMsg', 'שגיאה: ' + e.message, 'err');
  }
}

async function refreshRelationsList() {
  const el = document.getElementById('relList');
  if (!el) return;
  const rels = await AUTH.api('relations?select=*') || [];
  if (!rels.length) { el.innerHTML = ''; return; }
  const people = await AUTH.rpc('people_for_me', {}) || [];
  const byId = Object.fromEntries(people.map(p => [p.id, `${p.first_name} ${p.last_name}`]));
  el.innerHTML = '<div class="table-wrap"><table><tr><th>אדם א׳</th><th>קשר</th><th>אדם ב׳</th></tr>' +
    rels.map(r => `<tr><td>${byId[r.person_a] || '?'}</td><td>${r.relation_type}</td><td>${byId[r.person_b] || '?'}</td></tr>`).join('') +
    '</table></div>';
}

async function addInteraction() {
  const person_id = val('ia_person'), kind = val('ia_kind'), content = val('ia_content');
  if (!person_id || !content) { showMsg('iaMsg', 'יש לבחור אדם ולכתוב תוכן', 'err'); return; }
  try {
    await AUTH.api('interactions', { method: 'POST', body: JSON.stringify({ person_id, kind, content }) });
    logAudit('create', 'interaction', person_id, { kind });
    document.getElementById('ia_content').value = '';
    showMsg('iaMsg', 'נשמר', 'ok');
    refreshInteractionsList();
  } catch (e) {
    showMsg('iaMsg', 'שגיאה: ' + e.message, 'err');
  }
}

const INTERACTION_LABELS = { call: 'שיחת טלפון', email: 'מייל', meeting: 'פגישה', voice: 'הודעה קולית', note: 'הערה' };

async function refreshInteractionsList() {
  const el = document.getElementById('iaList');
  if (!el) return;
  const rows = await AUTH.api('interactions?select=*&order=created_at.desc&limit=30') || [];
  if (!rows.length) { el.innerHTML = ''; return; }
  const people = await AUTH.rpc('people_for_me', {}) || [];
  const byId = Object.fromEntries(people.map(p => [p.id, `${p.first_name} ${p.last_name}`]));
  el.innerHTML = '<div class="table-wrap"><table><tr><th>עם מי</th><th>סוג</th><th>תוכן</th><th>מתי</th></tr>' +
    rows.map(r => `<tr><td>${byId[r.person_id] || '?'}</td><td>${INTERACTION_LABELS[r.kind] || r.kind}</td>` +
      `<td>${r.content}</td><td style="font-size:.78rem">${new Date(r.created_at).toLocaleDateString('he-IL')}</td></tr>`).join('') +
    '</table></div>';
}

async function refreshFamiliesList() {
  refreshRelationsList();
  refreshInteractionsList();
  const el = document.getElementById('familiesList');
  const families = await AUTH.api('families?select=*') || [];
  const allPeople = await AUTH.rpc('people_for_me', {}) || [];
  if (!families.length) {
    el.innerHTML = '<div class="card" style="text-align:center; color:var(--muted)"><i class="bi bi-house"></i> אין עדיין כרטיסי משפחה</div>';
    return;
  }
  el.innerHTML = '';
  families.forEach(fam => {
    const members = allPeople.filter(p => p.family_id === fam.id);
    const head = members.find(p => p.id === fam.head_of_family_id);
    const spouse = head && head.spouse_id ? members.find(p => p.id === head.spouse_id) : null;
    const children = members.filter(p => p.id !== fam.head_of_family_id && (!spouse || p.id !== spouse.id));

    const card = document.createElement('div');
    card.className = 'card';
    let html = `<h3><i class="bi bi-house-heart"></i> משפחת ${head ? head.last_name : '?'}</h3>`;
    html += `<p><b>${head ? head.first_name + ' ' + head.last_name : '—'}</b>` +
      (spouse ? ` <i class="bi bi-heart-fill" style="color:var(--accent); font-size:.7rem"></i> <b>${spouse.first_name} ${spouse.last_name}</b>` : '') + '</p>';

    if (children.length) {
      html += '<div class="table-wrap"><table><tr><th>ילד/ה</th><th>תאריך לידה</th><th>גיל</th><th>בר/בת מצווה</th></tr>';
      children
        .slice()
        .sort((a, b) => (b.birth_date || '').localeCompare(a.birth_date || ''))
        .forEach(c => {
          html += `<tr><td>${c.first_name} ${c.last_name}</td><td>${c.birth_date || '-'}</td>` +
            `<td>${calcAge(c.birth_date) ?? '-'}</td><td>${c.bar_mitzva_date || '-'}</td></tr>`;
        });
      html += '</table></div>';
    } else {
      html += '<p style="color:var(--muted); font-size:.85rem">אין עדיין ילדים בכרטיס הזה</p>';
    }
    card.innerHTML = html;

    const addChildBtn = document.createElement('button');
    addChildBtn.className = 'secondary';
    addChildBtn.innerHTML = '<i class="bi bi-person-plus"></i> הוסף ילד/ה למשפחה';
    addChildBtn.onclick = () => openAddChildForm(card, fam.id);
    card.appendChild(addChildBtn);

    el.appendChild(card);
  });
}
refreshFamiliesList();

function openAddChildForm(card, familyId) {
  if (card.querySelector('.child-form')) return;
  const form = document.createElement('div');
  form.className = 'child-form';
  form.style = 'margin-top:14px; padding-top:14px; border-top:1px solid var(--line)';
  form.innerHTML = `
    <div class="field-grid">
      <label>שם פרטי<input class="cf_first"></label>
      <label>מגדר<select class="cf_gender"><option value="">--</option><option value="male">זכר</option><option value="female">נקבה</option></select></label>
      <label>תאריך לידה<input class="cf_birth" type="date"></label>
      <label>בר/בת מצווה<input class="cf_bm" type="date"></label>
    </div>
    <button class="primary cf_save"><i class="bi bi-check2"></i> שמור ילד/ה</button>`;
  card.appendChild(form);
  form.querySelector('.cf_save').onclick = async () => {
    const lastName = card.querySelector('h3').textContent.replace('משפחת ', '').trim();
    const child = {
      first_name: form.querySelector('.cf_first').value,
      last_name: lastName,
      gender: form.querySelector('.cf_gender').value || null,
      birth_date: form.querySelector('.cf_birth').value || null,
      bar_mitzva_date: form.querySelector('.cf_bm').value || null,
      family_id: familyId, source: 'manual'
    };
    await AUTH.api('people', { method: 'POST', body: JSON.stringify(child) });
    refreshFamiliesList();
  };
}

/** ================= ייבוא + מיפוי עמודות + דדופליקציה ================= */

function parseCsvRaw(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line => line.split(',').map(v => v.trim()));
  return { headers, rows };
}

const IMPORT_TARGET_FIELDS = [
  ['', '— התעלם מהעמודה —'], ['first_name', 'שם פרטי'], ['last_name', 'שם משפחה'],
  ['id_number', 'ת"ז'], ['birth_date', 'תאריך לידה'], ['street', 'רחוב'], ['city', 'עיר'],
  ['edah', 'עדה'], ['gender', 'מגדר'], ['phone', 'טלפון'], ['phone2', 'טלפון נוסף'],
  ['email', 'מייל'], ['school_class', 'כיתה'], ['notes', 'הערות']
];

// ניחוש אוטומטי לפי מילות מפתח בשם העמודה — נקודת התחלה, המשתמש יכול לתקן.
function guessFieldForHeader(header) {
  const h = header.toLowerCase();
  const guesses = [
    [/first.?name|שם פרטי|^שם$/, 'first_name'], [/last.?name|שם משפחה|משפחה/, 'last_name'],
    [/id.?number|ת"?ז|תעודת זהות/, 'id_number'], [/birth|לידה/, 'birth_date'],
    [/street|רחוב|כתובת/, 'street'], [/city|עיר|יישוב/, 'city'],
    [/edah|עדה/, 'edah'], [/gender|מגדר|מין/, 'gender'],
    [/phone2|טלפון נוסף/, 'phone2'], [/phone|טלפון|נייד/, 'phone'],
    [/email|מייל|דוא/, 'email'], [/class|כיתה/, 'school_class'], [/note|הער/, 'notes']
  ];
  for (const [re, field] of guesses) if (re.test(h)) return field;
  return '';
}

let csvParsed = null;

function startColumnMapping() {
  csvParsed = parseCsvRaw(val('csvInput'));
  if (!csvParsed.headers.length) return;
  const area = document.getElementById('mappingArea');
  let html = '<div class="card"><h3><i class="bi bi-diagram-3"></i> שייכו כל עמודה לשדה במערכת</h3>' +
    '<div class="table-wrap"><table><tr><th>עמודה בקובץ</th><th>דוגמה</th><th>שדה במערכת</th></tr>';
  csvParsed.headers.forEach((h, i) => {
    const sample = (csvParsed.rows[0] && csvParsed.rows[0][i]) || '';
    const guess = guessFieldForHeader(h);
    html += `<tr><td><b>${h}</b></td><td style="color:var(--muted)">${sample}</td><td>` +
      `<select class="mapSelect" data-col="${i}">` +
      IMPORT_TARGET_FIELDS.map(([val_, label]) => `<option value="${val_}" ${val_ === guess ? 'selected' : ''}>${label}</option>`).join('') +
      '</select></td></tr>';
  });
  html += '</table></div>' +
    '<button class="primary" onclick="submitImportWithMapping()"><i class="bi bi-check2-circle"></i> ייבא ובדוק כפילויות</button></div>';
  area.innerHTML = html;
}

function applyMappingToRows() {
  const selects = Array.from(document.querySelectorAll('.mapSelect'));
  const colToField = {};
  selects.forEach(s => { if (s.value) colToField[Number(s.dataset.col)] = s.value; });
  return csvParsed.rows.map(cells => {
    const row = {};
    Object.keys(colToField).forEach(colIdx => { row[colToField[colIdx]] = cells[colIdx] || ''; });
    return row;
  });
}

async function submitImportWithMapping() {
  const rows = applyMappingToRows();
  await runImport(rows, val('importSource') || 'ייבוא ידני');
}

let pendingReview = [];

async function runImport(rows, source) {
  pendingReview = [];
  let autoMerged = 0, imported = 0;

  for (const row of rows) {
    let candidates = [];
    try {
      candidates = await AUTH.rpc('find_fuzzy_candidates', {
        p_first_name: row.first_name, p_last_name: row.last_name,
        p_id_number: row.id_number || null
      });
    } catch (e) {
      showMsg('importMsg', 'שגיאה בבדיקת כפילויות: ' + e.message, 'err');
      return;
    }

    const exactIdMatch = candidates.find(c => row.id_number && c.id_number === row.id_number);
    if (exactIdMatch) {
      const merged = {};
      Object.keys(row).forEach(k => { if (!exactIdMatch[k] && row[k]) merged[k] = row[k]; });
      if (Object.keys(merged).length) {
        await AUTH.api(`people?id=eq.${exactIdMatch.id}`, { method: 'PATCH', body: JSON.stringify(merged) });
      }
      autoMerged++;
      continue;
    }

    if (candidates.length) {
      pendingReview.push({ existingPerson: candidates[0], newRow: row });
      continue;
    }

    row.source = source;
    row.id_number = row.id_number || null;
    row.birth_date = row.birth_date || null;
    await AUTH.api('people', { method: 'POST', body: JSON.stringify(row) });
    imported++;
  }

  await AUTH.api('import_log', { method: 'POST',
    body: JSON.stringify({ source, row_count: rows.length }) });

  showMsg('importMsg',
    `יובאו: ${imported} | מוזגו אוטומטית (ת"ז זהה): ${autoMerged} | דורש בדיקה ידנית: ${pendingReview.length}`,
    'ok');
  renderReview();
}

const COMPARE_FIELDS = [
  ['first_name', 'שם פרטי'], ['last_name', 'שם משפחה'], ['id_number', 'ת"ז'],
  ['birth_date', 'תאריך לידה'], ['street', 'רחוב'], ['city', 'עיר'],
  ['phone', 'טלפון'], ['email', 'מייל']
];

function renderReview() {
  const area = document.getElementById('reviewArea');
  area.innerHTML = '';
  if (!pendingReview.length) return;
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<h3><i class="bi bi-exclamation-triangle"></i> מועמדים לכפילות — נא לאשר ידנית</h3>';
  pendingReview.forEach((item, idx) => {
    const box = document.createElement('div');
    box.className = 'review-box';
    let fieldsHtml = '<div class="table-wrap"><table><tr><th>שדה</th><th>קיים</th><th>חדש</th></tr>';
    COMPARE_FIELDS.forEach(([key, label]) => {
      const existingVal = item.existingPerson[key] || '';
      const newVal = item.newRow[key] || '';
      if (!existingVal && !newVal) return;
      fieldsHtml += `<tr><td>${label}</td>` +
        `<td><label style="font-weight:400"><input type="radio" name="cmp_${idx}_${key}" value="existing" ${existingVal || !newVal ? 'checked' : ''}> ${existingVal || '(ריק)'}</label></td>` +
        `<td><label style="font-weight:400"><input type="radio" name="cmp_${idx}_${key}" value="new" ${!existingVal && newVal ? 'checked' : ''}> ${newVal || '(ריק)'}</label></td></tr>`;
    });
    fieldsHtml += '</table></div>';
    box.innerHTML =
      `<b>קיים:</b> ${item.existingPerson.first_name} ${item.existingPerson.last_name} ` +
      `&nbsp;↔&nbsp; <b>חדש:</b> ${item.newRow.first_name} ${item.newRow.last_name}` +
      fieldsHtml +
      `<button class="btn" onclick="mergeDup(${idx})"><i class="bi bi-union"></i> מזג לפי הבחירה</button> ` +
      `<button class="secondary" onclick="skipDup(${idx})"><i class="bi bi-file-earmark-plus"></i> השאר נפרד</button>`;
    card.appendChild(box);
  });
  area.appendChild(card);
}

async function mergeDup(idx) {
  const item = pendingReview[idx];
  const merged = {};
  COMPARE_FIELDS.forEach(([key]) => {
    const chosen = document.querySelector(`input[name="cmp_${idx}_${key}"]:checked`);
    if (chosen && chosen.value === 'new') merged[key] = item.newRow[key];
  });
  await AUTH.api('merge_log', { method: 'POST', body: JSON.stringify({
    target_person: item.existingPerson.id, before_snapshot: item.existingPerson, merged_from: item.newRow
  }) });
  await AUTH.api(`people?id=eq.${item.existingPerson.id}`, { method: 'PATCH', body: JSON.stringify(merged) });
  logAudit('merge', 'person', item.existingPerson.id, { fields_changed: Object.keys(merged) });
  pendingReview.splice(idx, 1);
  showMsg('importMsg', 'מוזג בהצלחה. ניתן לבטל בטאב "יומן ביקורת".', 'ok');
  globalSearchCache = null;
  renderReview();
}

async function undoLastMerge(personId) {
  const logs = await AUTH.api(`merge_log?target_person=eq.${personId}&undone_at=is.null&order=created_at.desc&limit=1`);
  if (!logs || !logs.length) { alert('אין מיזוג לבטל עבור אדם זה'); return; }
  const log = logs[0];
  const restore = Object.assign({}, log.before_snapshot);
  delete restore.id; delete restore.created_at; delete restore.updated_at;
  await AUTH.api(`people?id=eq.${personId}`, { method: 'PATCH', body: JSON.stringify(restore) });
  await AUTH.api(`merge_log?id=eq.${log.id}`, { method: 'PATCH', body: JSON.stringify({ undone_at: new Date().toISOString() }) });
  logAudit('undo_merge', 'person', personId, {});
  globalSearchCache = null;
  alert('המיזוג בוטל, הרשומה חזרה למצב הקודם');
}

async function skipDup(idx) {
  const item = pendingReview[idx];
  const row = Object.assign({}, item.newRow, { source: 'ייבוא (הושאר נפרד ידנית)' });
  row.id_number = row.id_number || null;
  row.birth_date = row.birth_date || null;
  const created = await AUTH.api('people', { method: 'POST', body: JSON.stringify(row), headers: {'Prefer':'return=representation'} });
  logAudit('create', 'person', created && created[0] && created[0].id, { via: 'dedup_skip' });
  pendingReview.splice(idx, 1);
  showMsg('importMsg', 'נשמר כרשומה נפרדת', 'ok');
  renderReview();
}

/** ================= חיפוש ================= */

async function loadCategoriesIntoSelect(selectId) {
  const cats = await AUTH.api('categories?select=name,group&order=name');
  const sel = document.getElementById(selectId);
  (cats || []).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name; opt.textContent = c.name;
    sel.appendChild(opt);
  });
}
loadCategoriesIntoSelect('q_category');

function ageToDates(minAge, maxAge) {
  const today = new Date();
  const out = {};
  if (maxAge) {
    const d = new Date(today); d.setFullYear(d.getFullYear() - maxAge - 1); d.setDate(d.getDate() + 1);
    out.minBirth = d.toISOString().slice(0, 10);
  }
  if (minAge) {
    const d = new Date(today); d.setFullYear(d.getFullYear() - minAge);
    out.maxBirth = d.toISOString().slice(0, 10);
  }
  return out;
}

function applyAgePreset(minAge, maxAge) {
  document.getElementById('q_minAge').value = minAge;
  document.getElementById('q_maxAge').value = maxAge;
  runSearch();
}

async function runSearch() {
  // דרך people_for_me() ולא ישירות ל-people, כדי שמשתמש 'limited' יקבל בפועל
  // רק את השדות/שורות שהוא רשאי לראות (לא רק "מוסתר" בקוד לקוח).
  let people;
  try {
    people = await AUTH.rpc('people_for_me', {}) || [];
  } catch (e) {
    document.getElementById('searchResults').innerHTML = `<div class="msg err">${e.message}</div>`;
    return;
  }

  if (val('q_street')) people = people.filter(p => p.street === val('q_street'));
  if (val('q_gender')) people = people.filter(p => p.gender === val('q_gender'));
  if (val('q_class')) people = people.filter(p => (p.school_class || '').includes(val('q_class')));
  const minAge = val('q_minAge') ? Number(val('q_minAge')) : null;
  const maxAge = val('q_maxAge') ? Number(val('q_maxAge')) : null;
  if (minAge || maxAge) {
    const { minBirth, maxBirth } = ageToDates(minAge, maxAge);
    people = people.filter(p => {
      if (!p.birth_date) return false;
      if (minBirth && p.birth_date < minBirth) return false;
      if (maxBirth && p.birth_date > maxBirth) return false;
      return true;
    });
  }

  const cat = val('q_category');
  if (cat) {
    const links = await AUTH.api(`person_categories?category_name=eq.${encodeURIComponent(cat)}&select=person_id`);
    const allowedIds = new Set((links || []).map(l => l.person_id));
    people = people.filter(p => allowedIds.has(p.id));
  }

  lastSearchResults = people;
  const el = document.getElementById('searchResults');
  if (!people.length) {
    el.innerHTML = '<div class="card" style="text-align:center; color:var(--muted)"><i class="bi bi-inbox"></i> לא נמצאו תוצאות</div>';
    return;
  }
  let html = `<div class="card"><h3><i class="bi bi-list-check"></i> ${people.length} תוצאות ` +
    `<button class="secondary" style="margin:0 0 0 8px; font-size:.78rem; padding:6px 12px" onclick="exportResultsToCsv()">` +
    `<i class="bi bi-download"></i> ייצוא לאקסל (CSV)</button> ` +
    `<button class="secondary" style="margin:0; font-size:.78rem; padding:6px 12px" onclick="exportResultsCustom('hefetz')">` +
    `<i class="bi bi-file-earmark-arrow-down"></i> ייצוא לחפץ חסד</button> ` +
    `<button class="secondary" style="margin:0; font-size:.78rem; padding:6px 12px" onclick="exportResultsCustom('nedarim')">` +
    `<i class="bi bi-file-earmark-arrow-down"></i> ייצוא לנדרים פלוס</button></h3>` +
    `<div style="display:flex; gap:8px; align-items:center; margin-bottom:10px; flex-wrap:wrap">` +
    `<input id="bulkTagName" placeholder="שם קטגוריה" style="max-width:180px; margin:0">` +
    `<button class="secondary" style="margin:0; font-size:.78rem; padding:6px 12px" onclick="bulkTagSelected()">` +
    `<i class="bi bi-tags"></i> הוסף קטגוריה לנבחרים</button></div>` +
    '<div class="table-wrap"><table><tr><th><input type="checkbox" onclick="toggleAllResultChecks(this)"></th><th>שם</th><th>ת"ז</th><th>תאריך לידה</th><th>גיל</th><th>רחוב</th><th>טלפון</th></tr>';
  people.forEach(p => {
    html += `<tr><td><input type="checkbox" class="resultCheck" value="${p.id}"></td><td>${p.first_name} ${p.last_name}</td><td>${p.id_number || ''}</td><td>${p.birth_date || ''}</td><td>${calcAge(p.birth_date) ?? ''}</td><td>${p.street || ''}</td><td>${p.phone || ''}</td></tr>`;
  });
  html += '</table></div></div>';
  el.innerHTML = html;
}

function toggleAllResultChecks(master) {
  document.querySelectorAll('.resultCheck').forEach(cb => cb.checked = master.checked);
}

async function bulkTagSelected() {
  const catName = val('bulkTagName');
  if (!catName) return;
  const ids = Array.from(document.querySelectorAll('.resultCheck:checked')).map(cb => cb.value);
  if (!ids.length) { alert('לא נבחרו אנשים'); return; }
  await AUTH.api('categories', { method: 'POST', body: JSON.stringify({ name: catName }) }).catch(() => {});
  for (const id of ids) {
    await AUTH.api('person_categories', { method: 'POST', body: JSON.stringify({ person_id: id, category_name: catName }) }).catch(() => {});
  }
  logAudit('bulk_tag', 'category', null, { category: catName, count: ids.length });
  alert(`הוספה בוצעה ל-${ids.length} אנשים`);
}

let lastSearchResults = [];

function exportResultsToCsv() {
  if (!lastSearchResults.length) return;
  const cols = ['first_name','last_name','id_number','birth_date','gender','street','city',
    'school_class','phone','phone2','email','housing_status','notes'];
  const headerLabels = ['שם פרטי','שם משפחה','ת"ז','תאריך לידה','מגדר','רחוב','עיר',
    'כיתה','טלפון','טלפון נוסף','מייל','סטטוס דיור','הערות'];
  const rows = [headerLabels.join(',')];
  lastSearchResults.forEach(p => {
    rows.push(cols.map(c => csvEscape(p[c])).join(','));
  });
  const csv = '﻿' + rows.join('\r\n'); // BOM כדי שאקסל יזהה עברית נכון
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'anshei-kesher-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// מיפויים "best guess" — לא אומתו מול הפורמט הרשמי של המערכות האלה.
// לפני שימוש אמיתי כדאי לבדוק עם חפץ חסד / נדרים פלוס שהעמודות מתאימות למה שהם מצפים לייבא.
const CUSTOM_EXPORT_FORMATS = {
  hefetz: {
    label: 'חפץ חסד',
    headers: ['שם מלא', 'ת"ז', 'טלפון', 'כתובת', 'עיר'],
    row: p => [`${p.first_name} ${p.last_name}`, p.id_number, p.phone, p.street, p.city]
  },
  nedarim: {
    label: 'נדרים פלוס',
    headers: ['שם פרטי', 'שם משפחה', 'תעודת זהות', 'טלפון נייד', 'דוא"ל'],
    row: p => [p.first_name, p.last_name, p.id_number, p.phone, p.email]
  }
};

function exportResultsCustom(formatKey) {
  if (!lastSearchResults.length) return;
  const fmt = CUSTOM_EXPORT_FORMATS[formatKey];
  const rows = [fmt.headers.join(',')];
  lastSearchResults.forEach(p => rows.push(fmt.row(p).map(csvEscape).join(',')));
  const csv = '﻿' + rows.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `anshei-kesher-${formatKey}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  logAudit('export', 'people', null, { format: formatKey, count: lastSearchResults.length });
}

/** ================= שמירת חיפושים ================= */

function currentSearchFilters() {
  return {
    category: val('q_category'), minAge: val('q_minAge'), maxAge: val('q_maxAge'),
    street: val('q_street'), schoolClass: val('q_class'), gender: val('q_gender')
  };
}

async function saveCurrentSearch() {
  const name = prompt('שם לחיפוש הזה (למשל: "מטרנות תשפ\'ז"):');
  if (!name) return;
  await AUTH.api('saved_searches', { method: 'POST', body: JSON.stringify({ name, filters: currentSearchFilters() }) });
  refreshSavedSearches();
}

async function refreshSavedSearches() {
  const el = document.getElementById('savedSearchesList');
  if (!el) return;
  const rows = await AUTH.api('saved_searches?select=*&order=created_at.desc') || [];
  if (!rows.length) { el.innerHTML = ''; return; }
  el.innerHTML = rows.map(r =>
    `<span style="display:inline-flex; align-items:center; gap:6px; background:var(--accent-soft); ` +
    `color:var(--primary-dark); padding:5px 6px 5px 12px; border-radius:999px; font-size:.8rem; margin:2px">` +
    `<button style="margin:0; background:none; border:none; padding:0; cursor:pointer; color:var(--primary-dark); font-weight:700"` +
    ` onclick='applySavedSearch(${JSON.stringify(r.filters)})'>${r.name}</button>` +
    `<i class="bi bi-x-circle" style="cursor:pointer" onclick="deleteSavedSearch('${r.id}')"></i></span>`
  ).join('');
}

function applySavedSearch(filters) {
  document.getElementById('q_category').value = filters.category || '';
  document.getElementById('q_minAge').value = filters.minAge || '';
  document.getElementById('q_maxAge').value = filters.maxAge || '';
  document.getElementById('q_street').value = filters.street || '';
  document.getElementById('q_class').value = filters.schoolClass || '';
  document.getElementById('q_gender').value = filters.gender || '';
  runSearch();
}

async function deleteSavedSearch(id) {
  await AUTH.api(`saved_searches?id=eq.${id}`, { method: 'DELETE' });
  refreshSavedSearches();
}
refreshSavedSearches();

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** ================= קטגוריות ================= */

async function addNewCategory() {
  try {
    await AUTH.api('categories', { method: 'POST',
      body: JSON.stringify({ name: val('newCatName'), group: val('newCatGroup') || '' }) });
    document.getElementById('newCatName').value = '';
    document.getElementById('newCatGroup').value = '';
    refreshCatList();
  } catch (e) {
    document.getElementById('catList').innerHTML = `<div class="msg err">${e.message}</div>`;
  }
}

async function refreshCatList() {
  const cats = await AUTH.api('categories?select=name,group&order=name');
  const el = document.getElementById('catList');
  if (!cats || !cats.length) {
    el.innerHTML = '<p style="color:var(--muted); font-size:.85rem">אין עדיין קטגוריות</p>';
    return;
  }
  el.innerHTML = '<div style="display:flex; flex-wrap:wrap; gap:8px">' +
    cats.map(c =>
      `<span style="background:var(--accent-soft); color:var(--primary-dark); padding:6px 14px; ` +
      `border-radius:999px; font-size:.82rem; font-weight:600"><i class="bi bi-tag"></i> ${c.name}` +
      `${c.group ? ' · ' + c.group : ''}</span>`
    ).join('') + '</div>';
}
refreshCatList();
