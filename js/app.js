AUTH.requireLogin();

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
  const person = {
    first_name: val('f_first_name'), last_name: val('f_last_name'),
    id_number: val('f_id_number') || null, birth_date: val('f_birth_date') || null,
    edah: val('f_edah'), gender: val('f_gender') || null,
    street: val('f_street'), city: val('f_city'), notes: val('f_notes'),
    source: 'manual'
  };
  try {
    await AUTH.api('people', { method: 'POST', body: JSON.stringify(person) });
    showMsg('addMsg', 'נשמר בהצלחה', 'ok');
    ['f_first_name','f_last_name','f_id_number','f_birth_date','f_edah','f_street','f_city','f_notes']
      .forEach(id => document.getElementById(id).value = '');
  } catch (e) {
    showMsg('addMsg', 'שגיאה: ' + e.message, 'err');
  }
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

async function runSearch() {
  const params = ['select=*'];
  if (val('q_street')) params.push(`street=eq.${encodeURIComponent(val('q_street'))}`);
  if (val('q_gender')) params.push(`gender=eq.${val('q_gender')}`);
  const minAge = val('q_minAge') ? Number(val('q_minAge')) : null;
  const maxAge = val('q_maxAge') ? Number(val('q_maxAge')) : null;
  if (minAge || maxAge) {
    const { minBirth, maxBirth } = ageToDates(minAge, maxAge);
    if (minBirth) params.push(`birth_date=gte.${minBirth}`);
    if (maxBirth) params.push(`birth_date=lte.${maxBirth}`);
  }

  let people;
  try {
    people = await AUTH.api('people?' + params.join('&'));
  } catch (e) {
    document.getElementById('searchResults').innerHTML = `<div class="msg err">${e.message}</div>`;
    return;
  }

  const cat = val('q_category');
  if (cat) {
    const links = await AUTH.api(`person_categories?category_name=eq.${encodeURIComponent(cat)}&select=person_id`);
    const allowedIds = new Set((links || []).map(l => l.person_id));
    people = people.filter(p => allowedIds.has(p.id));
  }

  const el = document.getElementById('searchResults');
  if (!people.length) {
    el.innerHTML = '<div class="card" style="text-align:center; color:var(--muted)"><i class="bi bi-inbox"></i> לא נמצאו תוצאות</div>';
    return;
  }
  let html = `<div class="card"><h3><i class="bi bi-list-check"></i> ${people.length} תוצאות</h3>` +
    '<div class="table-wrap"><table><tr><th>שם</th><th>ת"ז</th><th>תאריך לידה</th><th>רחוב</th></tr>';
  people.forEach(p => {
    html += `<tr><td>${p.first_name} ${p.last_name}</td><td>${p.id_number || ''}</td><td>${p.birth_date || ''}</td><td>${p.street || ''}</td></tr>`;
  });
  html += '</table></div></div>';
  el.innerHTML = html;
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
