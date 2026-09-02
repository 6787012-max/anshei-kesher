AUTH.requireLogin();

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
  };
});

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
  ['f_spouse', 'fam_head', 'fam_spouse'].forEach(selId => {
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

async function refreshFamiliesList() {
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

/** ================= ייבוא + דדופליקציה ================= */

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(',').map(v => v.trim());
    const row = {};
    headers.forEach((h, i) => row[h] = vals[i] || '');
    return row;
  });
}

let pendingReview = [];

async function submitImport() {
  const rows = parseCsv(val('csvInput'));
  const source = val('importSource') || 'ייבוא ידני';
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
    box.innerHTML =
      `<b>קיים:</b> ${item.existingPerson.first_name} ${item.existingPerson.last_name} (ת"ז: ${item.existingPerson.id_number || '-'})<br>` +
      `<b>חדש:</b> ${item.newRow.first_name} ${item.newRow.last_name} (ת"ז: ${item.newRow.id_number || '-'})<br>` +
      `<button class="btn" onclick="mergeDup(${idx})"><i class="bi bi-union"></i> מזג</button> ` +
      `<button class="secondary" onclick="skipDup(${idx})"><i class="bi bi-file-earmark-plus"></i> השאר נפרד</button>`;
    card.appendChild(box);
  });
  area.appendChild(card);
}

async function mergeDup(idx) {
  const item = pendingReview[idx];
  const merged = {};
  Object.keys(item.newRow).forEach(k => { if (!item.existingPerson[k] && item.newRow[k]) merged[k] = item.newRow[k]; });
  await AUTH.api(`people?id=eq.${item.existingPerson.id}`, { method: 'PATCH', body: JSON.stringify(merged) });
  pendingReview.splice(idx, 1);
  showMsg('importMsg', 'מוזג בהצלחה', 'ok');
  renderReview();
}

async function skipDup(idx) {
  const item = pendingReview[idx];
  const row = Object.assign({}, item.newRow, { source: 'ייבוא (הושאר נפרד ידנית)' });
  row.id_number = row.id_number || null;
  row.birth_date = row.birth_date || null;
  await AUTH.api('people', { method: 'POST', body: JSON.stringify(row) });
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
    `<i class="bi bi-download"></i> ייצוא לאקסל (CSV)</button></h3>` +
    '<div class="table-wrap"><table><tr><th>שם</th><th>ת"ז</th><th>תאריך לידה</th><th>גיל</th><th>רחוב</th><th>טלפון</th></tr>';
  people.forEach(p => {
    html += `<tr><td>${p.first_name} ${p.last_name}</td><td>${p.id_number || ''}</td><td>${p.birth_date || ''}</td><td>${calcAge(p.birth_date) ?? ''}</td><td>${p.street || ''}</td><td>${p.phone || ''}</td></tr>`;
  });
  html += '</table></div></div>';
  el.innerHTML = html;
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
