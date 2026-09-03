AUTH.requireLogin();

/** ================= בטיחות פלט: escape ל-HTML ================= */
// כל טקסט חופשי שהמשתמש (או קובץ CSV חיצוני) הזין ומוצג דרך innerHTML
// חייב לעבור כאן קודם — אחרת <img src=x onerror=...> בשדה כמו "הערות"
// או "רחוב" רץ אצל כל מי שיציג את הרשומה (ראה REVIEW_FINDINGS.md #10).
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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
    progressEl.innerHTML =
      `<div class="msg err">לא הצלחתי לזהות את הפרטים מהתמונה: ${esc(e.message)}</div>` +
      `<div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap">` +
      `  <button class="primary" style="margin:0" onclick="retryOcr()"><i class="bi bi-arrow-clockwise"></i> נסה שוב עם תמונה אחרת</button>` +
      `  <button class="secondary" style="margin:0" onclick="skipOcrToManualForm()"><i class="bi bi-pencil"></i> הזן ידנית</button>` +
      `  <button class="secondary" style="margin:0" onclick="cancelOcr()"><i class="bi bi-x-lg"></i> ביטול</button>` +
      `</div>`;
  }
}

function retryOcr() {
  document.getElementById('ocrFile').value = '';
  document.getElementById('ocrProgress').innerHTML = '';
  document.getElementById('ocrResult').innerHTML = '';
  document.getElementById('ocrFile').click();
}

function skipOcrToManualForm() {
  document.getElementById('ocrProgress').innerHTML = '';
  document.getElementById('ocrResult').innerHTML = '';
  document.getElementById('f_first_name').focus();
  document.getElementById('f_first_name').scrollIntoView({ behavior: 'smooth' });
}

function cancelOcr() {
  document.getElementById('ocrFile').value = '';
  document.getElementById('ocrProgress').innerHTML = '';
  document.getElementById('ocrResult').innerHTML = '';
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
    const titleEl = document.getElementById('topbarTitle');
    if (titleEl) titleEl.textContent = t.querySelector('span')?.textContent || t.textContent.trim();
    if (t.dataset.panel === 'homePanel') refreshDashboard();
    if (t.dataset.panel === 'auditPanel') refreshAuditLog();
    if (t.dataset.panel === 'usersPanel') refreshUsersList();
    if (t.dataset.panel === 'listPanel') refreshFullList();
    if (t.dataset.panel === 'familiesPanel') refreshFamiliesList();
    if (t.dataset.panel === 'ideasPanel') refreshIdeasList();
  };
});

// טאבים שממילא חסומים ב-RLS למשתמש 'limited' (כתיבה/ניהול/יומן ביקורת) —
// מוסתרים לגמרי במקום שיוצגו עם "אין נתונים" מטעה (ראה REVIEW_FINDINGS.md #38/#36).
let myAccessLevel = 'full';
const FULL_ONLY_PANELS = ['addPanel', 'familiesPanel', 'importPanel', 'categoriesPanel', 'usersPanel', 'auditPanel', 'ideasPanel'];

async function initAccessLevel() {
  try {
    myAccessLevel = await AUTH.rpc('my_access_level', {});
  } catch (e) { myAccessLevel = 'full'; }
  if (myAccessLevel !== 'full') {
    FULL_ONLY_PANELS.forEach(panelId => {
      const tab = document.querySelector(`.tab[data-panel="${panelId}"]`);
      if (tab) tab.style.display = 'none';
    });
  }
}
initAccessLevel();
if (window.RT) RT.start();

/** ================= משתמשים והרשאות ================= */

function toggleLimitedFields() {
  document.getElementById('u_limitedFields').style.display = val('u_level') === 'full' ? 'none' : 'block';
}

function toggleShowPassword() {
  const input = document.getElementById('u_password');
  const eye = document.getElementById('u_password_eye');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  eye.className = show ? 'bi bi-eye-slash' : 'bi bi-eye';
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

async function loadUserCategoriesChecklist() {
  const el = document.getElementById('u_categoriesChecklist');
  if (!el) return;
  try {
    const cats = await AUTH.api('categories?select=name,group&order=name');
    if (!cats || !cats.length) {
      el.innerHTML = '<div style="color:var(--muted); font-size:.85rem">אין עדיין קטגוריות. הוסף בטאב "קטגוריות".</div>';
      return;
    }
    el.innerHTML = cats.map(c => {
      const label = c.group ? `${esc(c.name)} <span style="color:var(--muted); font-size:.75rem">(${esc(c.group)})</span>` : esc(c.name);
      return `<label style="font-weight:400; display:flex; align-items:center; gap:6px; padding:4px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-raised)">` +
             `<input type="checkbox" class="u_cat" value="${esc(c.name)}"> ${label}</label>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div style="color:var(--danger); font-size:.85rem">שגיאה בטעינת קטגוריות: ${esc(e.message)}</div>`;
  }
}

function toggleAllUserCategories(check) {
  document.querySelectorAll('.u_cat').forEach(cb => { cb.checked = !!check; });
}

async function createUser() {
  const email = val('u_email').trim();
  const password = val('u_password');
  const access_level = val('u_level');
  if (!email) { showMsg('userMsg', 'יש להזין אימייל', 'err'); return; }
  if (!password || password.length < 8) { showMsg('userMsg', 'סיסמה חייבת להיות באורך 8 תווים לפחות', 'err'); return; }
  const allowed_fields = Array.from(document.querySelectorAll('.u_field:checked')).map(el => el.value);
  const allowed_categories = Array.from(document.querySelectorAll('.u_cat:checked')).map(el => el.value);
  if (access_level === 'limited' && !allowed_categories.length) {
    if (!confirm('לא סימנת אף קטגוריה — המשתמש לא יראה אף אחד. להמשיך בכל זאת?')) return;
  }
  try {
    const result = await callAdminFn({ action: 'create_user', email, password, access_level, allowed_fields, allowed_categories });
    logAudit('create', 'user', result.user_id, { email, access_level });
    showMsg('userMsg', 'המשתמש נוצר בהצלחה. תעביר לו את הסיסמה הזמנית בערוץ מאובטח.', 'ok');
    document.getElementById('u_email').value = '';
    document.getElementById('u_password').value = '';
    toggleAllUserCategories(false);
    refreshUsersList();
  } catch (e) {
    showMsg('userMsg', 'שגיאה ביצירת המשתמש: ' + e.message + '. אפשר לתקן את הפרטים ולנסות שוב, או לבטל וללכת לטאב אחר.', 'err');
  }
}

loadUserCategoriesChecklist();

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
    users.map(u => `<tr><td>${esc(u.email)}</td><td>${esc(u.access_level)}</td>` +
      `<td style="font-size:.78rem">${esc((u.allowed_fields||[]).join(', '))}</td>` +
      `<td style="font-size:.78rem">${esc((u.allowed_categories||[]).join(', '))}</td>` +
      `<td>${u.email === AUTH.getSession().user.email ? '' :
        `<button class="secondary" style="margin:0; font-size:.75rem; padding:4px 10px" onclick="deleteUser('${u.user_id}','${esc(u.email)}')"><i class="bi bi-trash"></i></button>`}</td></tr>`
    ).join('') + '</table>';
}

/** ================= תכתובת פנימית — בעיות ובקשות ================= */
// לפי בקשת שעיה (מייל 02.09.2026): מקום בתוך התוכנה עצמה לרשום בעיות,
// לנהל עליהן תכתובת פנימית, ולסמן האם טופל. יושב על improvement_ideas
// הקיימת + טבלת idea_messages (ראה supabase/migration_internal_thread.sql).

document.addEventListener('change', e => {
  if (e.target && e.target.id === 'idea_source') {
    document.getElementById('idea_email_wrap').style.display = e.target.value === 'email' ? 'block' : 'none';
  }
});

async function addIdea() {
  const title = val('idea_title').trim();
  if (!title) { showMsg('ideaMsg', 'יש להזין כותרת', 'err'); return; }
  const session = AUTH.getSession();
  const idea = {
    title, description: val('idea_desc'),
    source: val('idea_source'), source_email: val('idea_source') === 'email' ? val('idea_email') : '',
    created_by: session && session.user ? session.user.id : null,
    created_by_email: session && session.user ? session.user.email : ''
  };
  try {
    const created = await AUTH.api('improvement_ideas', { method: 'POST', body: JSON.stringify(idea), headers: { 'Prefer': 'return=representation' } });
    logAudit('create', 'improvement_idea', created && created[0] && created[0].id, { title, source: idea.source });
    document.getElementById('idea_title').value = '';
    document.getElementById('idea_desc').value = '';
    document.getElementById('idea_email').value = '';
    showMsg('ideaMsg', 'נוסף למעקב', 'ok');
    refreshIdeasList();
  } catch (e) {
    showMsg('ideaMsg', 'שגיאה: ' + esc(e.message), 'err');
  }
}

let currentIdeaFilter = 'all';
function filterIdeas(status) { currentIdeaFilter = status; refreshIdeasList(); }

const IDEA_STATUS_LABELS = { new: 'לא טופל', in_progress: 'בטיפול', done: 'טופל', rejected: 'נדחה' };
const IDEA_STATUS_COLORS = { new: '#b45309', in_progress: '#1d4ed8', done: '#15803d', rejected: '#6b7280' };

// אילו תכתובות פתוחות כרגע — נשמר בין רענונים, אחרת כל שליחת הודעה סוגרת
// את השרשור שבדיוק כתבת בו.
const openIdeaThreads = new Set();

function fmtDateTime(v) {
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('he-IL');
}

// תאריך בלבד (בלי שעה), DD/MM/YYYY — שעיה ביקש "יום, אחר כך חודש, אחר כך שנה" ולא ISO (YYYY-MM-DD)
function fmtDate(v) {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

async function refreshIdeasList() {
  const el = document.getElementById('ideasList');
  if (!el) return;
  const rows = await AUTH.api('improvement_ideas?select=*&order=created_at.desc') || [];
  let msgs = [];
  try { msgs = await AUTH.api('idea_messages?select=*&order=created_at.asc') || []; }
  catch (e) { msgs = []; }   // אם המיגרציה עוד לא רצה — הרשימה עצמה עדיין תעבוד
  const byIdea = {};
  msgs.forEach(m => { (byIdea[m.idea_id] = byIdea[m.idea_id] || []).push(m); });

  const filtered = currentIdeaFilter === 'all' ? rows : rows.filter(r => r.status === currentIdeaFilter);
  if (!filtered.length) {
    el.innerHTML = '<p style="color:var(--muted)">אין פניות בסטטוס הזה</p>';
    return;
  }
  el.innerHTML = '';
  filtered.forEach(r => {
    const thread = byIdea[r.id] || [];
    const card = document.createElement('div');
    card.className = 'review-box';
    const badge = `<span style="background:${IDEA_STATUS_COLORS[r.status] || '#6b7280'}; color:#fff; border-radius:999px; padding:2px 10px; font-size:.72rem; font-weight:700; white-space:nowrap">${esc(IDEA_STATUS_LABELS[r.status] || r.status)}</span>`;
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap">
        <div style="flex:1; min-width:200px">
          <b>${esc(r.title)}</b> ${badge}
          ${r.source === 'email' ? ` <span style="font-size:.75rem; color:var(--muted)">(במייל${r.source_email ? ' מ-' + esc(r.source_email) : ''})</span>` : ''}
          ${r.description ? `<p style="margin-top:6px; font-size:.85rem; white-space:pre-wrap">${esc(r.description)}</p>` : ''}
          <p style="font-size:.72rem; color:var(--muted); margin-top:6px">${esc(fmtDateTime(r.created_at))}${r.created_by_email ? ' · נפתח ע"י ' + esc(r.created_by_email) : ''}</p>
        </div>
      </div>`;

    /* ---- תכתובת ---- */
    const threadWrap = document.createElement('div');
    threadWrap.style = 'margin-top:10px';
    const toggle = document.createElement('button');
    toggle.className = 'secondary';
    toggle.style = 'margin:0; font-size:.78rem; padding:5px 12px';
    const isOpen = openIdeaThreads.has(r.id);
    toggle.innerHTML = `<i class="bi bi-chat-left-text"></i> תכתובת (${thread.length})`;
    const body = document.createElement('div');
    body.style = `margin-top:10px; display:${isOpen ? 'block' : 'none'}`;
    toggle.onclick = () => {
      const nowOpen = body.style.display === 'none';
      body.style.display = nowOpen ? 'block' : 'none';
      if (nowOpen) openIdeaThreads.add(r.id); else openIdeaThreads.delete(r.id);
    };

    const list = document.createElement('div');
    if (!thread.length) {
      list.innerHTML = '<p style="color:var(--muted); font-size:.8rem">אין עדיין הודעות בפנייה הזו.</p>';
    } else {
      list.innerHTML = thread.map(m =>
        `<div style="border-right:3px solid var(--primary, #8b5e34); background:#fafafa; border-radius:6px; padding:8px 10px; margin-bottom:8px">
           <div style="font-size:.72rem; color:var(--muted)">${esc(m.author_email || 'לא ידוע')} · ${esc(fmtDateTime(m.created_at))}</div>
           <div style="font-size:.85rem; white-space:pre-wrap; margin-top:4px">${esc(m.body)}</div>
         </div>`).join('');
    }

    const ta = document.createElement('textarea');
    ta.rows = 2;
    ta.placeholder = 'כתוב הודעה בפנייה הזו…';
    ta.style = 'width:100%; font-family:var(--font)';
    const send = document.createElement('button');
    send.className = 'primary';
    send.style = 'margin-top:6px; font-size:.8rem; padding:6px 16px';
    send.innerHTML = '<i class="bi bi-send"></i> שלח';
    send.onclick = () => addIdeaMessage(r.id, ta, send);

    body.appendChild(list); body.appendChild(ta); body.appendChild(send);
    threadWrap.appendChild(toggle); threadWrap.appendChild(body);
    card.appendChild(threadWrap);

    /* ---- סטטוס ומחיקה ---- */
    const controls = document.createElement('div');
    controls.style = 'margin-top:10px; display:flex; gap:8px; align-items:center; flex-wrap:wrap';
    const select = document.createElement('select');
    select.style = 'max-width:160px';
    ['new', 'in_progress', 'done', 'rejected'].forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = IDEA_STATUS_LABELS[s]; opt.selected = s === r.status;
      select.appendChild(opt);
    });
    select.onchange = () => updateIdeaStatus(r.id, select.value);
    controls.appendChild(select);
    if (r.status !== 'done') {
      const quick = document.createElement('button');
      quick.className = 'secondary';
      quick.style = 'margin:0; font-size:.75rem; padding:4px 12px';
      quick.innerHTML = '<i class="bi bi-check2-circle"></i> סמן כטופל';
      quick.onclick = () => updateIdeaStatus(r.id, 'done');
      controls.appendChild(quick);
    }
    const del = document.createElement('button');
    del.className = 'secondary'; del.style = 'margin:0; font-size:.75rem; padding:4px 10px';
    del.innerHTML = '<i class="bi bi-trash"></i>';
    del.onclick = () => deleteIdeaConfirm(r.id);
    controls.appendChild(del);
    card.appendChild(controls);
    el.appendChild(card);
  });
}

async function addIdeaMessage(ideaId, ta, btn) {
  const text = (ta.value || '').trim();
  if (!text) { ta.focus(); return; }
  const session = AUTH.getSession();
  btn.disabled = true;
  try {
    await AUTH.api('idea_messages', {
      method: 'POST',
      body: JSON.stringify({
        idea_id: ideaId, body: text,
        author: session && session.user ? session.user.id : null,
        author_email: session && session.user ? session.user.email : ''
      })
    });
    ta.value = '';
    openIdeaThreads.add(ideaId);   // שהשרשור יישאר פתוח אחרי הרענון
    logAudit('create', 'idea_message', ideaId, {});
    await refreshIdeasList();
  } catch (e) {
    alert('שגיאה בשליחת ההודעה: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

async function updateIdeaStatus(id, status) {
  const patch = { status };
  patch.resolved_at = (status === 'done' || status === 'rejected') ? new Date().toISOString() : null;
  await AUTH.api(`improvement_ideas?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  logAudit('update', 'improvement_idea', id, { status });
  refreshIdeasList();
}

async function deleteIdeaConfirm(id) {
  if (!confirm('למחוק את הפנייה הזו? כל התכתובת עליה תימחק גם היא.')) return;
  await AUTH.api(`improvement_ideas?id=eq.${id}`, { method: 'DELETE' });
  openIdeaThreads.delete(id);
  logAudit('delete', 'improvement_idea', id, {});
  refreshIdeasList();
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
  if (!AUTH.getSession()) return; // עוד לפני login (redirect בתהליך) — לא לנסות לרנדר
  const stats = await AUTH.rpc('dashboard_stats', {});
  const cardsEl = document.getElementById('dashboardCards');
  if (!stats) return;
  if (stats.restricted) {
    cardsEl.innerHTML = '<div class="card" style="text-align:center; color:var(--muted)"><i class="bi bi-lock"></i> הדשבורד זמין רק למשתמשי full</div>';
    ['classBreakdown', 'yearBreakdown', 'upcomingEvents'].forEach(id => {
      const el = document.getElementById(id); if (el) el.innerHTML = '';
    });
    return;
  }
  const cards = [
    { icon: 'bi-people-fill', label: 'סה"כ אנשי קשר', value: stats.total_people },
    { icon: 'bi-house-heart', label: 'משפחות', value: stats.total_families },
    { icon: 'bi-envelope', label: 'ללא מייל', value: stats.missing_email },
    { icon: 'bi-telephone', label: 'ללא טלפון', value: stats.missing_phone },
    { icon: 'bi-star', label: 'בר/בת מצווה ב-90 יום הקרובים', value: stats.upcoming_bar_mitzva_90d },
  ];
  cardsEl.innerHTML = cards.map(c =>
    `<div class="kpi-item"><b>${c.value}</b><span>${c.label}</span></div>`
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
        <span><i class="bi ${EVENT_ICONS[e.event_type]}" style="color:var(--accent)"></i> ${esc(e.full_name)} — ${esc(EVENT_LABELS[e.event_type])}</span>
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

function toggleRecordKind() {
  const isOrg = (document.querySelector('input[name="f_record_kind"]:checked') || {}).value === 'organization';
  // בארגון עדיין צריך את שם השדה (name) עצמו — רק מסתירים שדות אישיים אחרים
  // ומשנים תווית כדי ש-first_name ישמש כשם הארגון.
  document.querySelectorAll('#f_personal_fields .field-grid > label:not(#f_first_name_label):not(#f_last_name_label), #f_personal_fields .field-group-title')
    .forEach(el => { el.style.display = isOrg ? 'none' : ''; });
  document.getElementById('f_last_name_label').style.display = isOrg ? 'none' : '';
  document.getElementById('f_first_name_label').firstChild.textContent = isOrg ? 'שם הארגון/גמ"ח/בעל המקצוע *' : 'שם פרטי *';
  document.getElementById('f_family_fields').style.display = isOrg ? 'none' : '';
  document.getElementById('f_record_kind_hint').style.display = isOrg ? '' : 'none';
  document.getElementById('f_school_class_label').style.display = isOrg ? 'none' : '';
}

function clearAddPersonForm() {
  ['f_first_name','f_last_name','f_id_number','f_birth_date','f_bar_mitzva_date','f_edah','f_street',
   'f_neighborhood','f_city','f_school_class','f_phone','f_phone2','f_email','f_institution',
   'f_marriage_date','f_aliases','f_notes']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('f_role').value = '';
  document.getElementById('f_gender').value = '';
  document.getElementById('f_housing').value = '';
  document.getElementById('f_marital_status').value = '';
  document.getElementById('f_spouse').value = '';
  document.querySelector('input[name="f_record_kind"][value="person"]').checked = true;
  toggleRecordKind();
  document.getElementById('ocrProgress').innerHTML = '';
  document.getElementById('ocrResult').innerHTML = '';
  document.getElementById('addMsg').innerHTML = '';
}

async function submitPerson() {
  const recordKindNow = (document.querySelector('input[name="f_record_kind"]:checked') || {}).value || 'person';
  if (!val('f_first_name').trim() || (recordKindNow === 'person' && !val('f_last_name').trim())) {
    showMsg('addMsg', recordKindNow === 'organization' ? 'שם הארגון/גמ"ח הוא שדה חובה' : 'שם פרטי ושם משפחה הם שדות חובה', 'err');
    return;
  }
  const spouseId = val('f_spouse') || null;
  const recordKind = (document.querySelector('input[name="f_record_kind"]:checked') || {}).value || 'person';
  const person = {
    first_name: val('f_first_name').trim(), last_name: val('f_last_name').trim(),
    id_number: val('f_id_number') || null, birth_date: val('f_birth_date') || null,
    bar_mitzva_date: val('f_bar_mitzva_date') || null,
    edah: val('f_edah'), gender: val('f_gender') || null,
    street: val('f_street'), neighborhood: val('f_neighborhood'), city: val('f_city'),
    school_class: val('f_school_class'),
    phone: val('f_phone'), phone2: val('f_phone2'), email: val('f_email'),
    role_in_family: val('f_role'), institution: val('f_institution'),
    marriage_date: val('f_marriage_date') || null, marital_status: val('f_marital_status'),
    housing_status: val('f_housing'), record_kind: recordKind,
    aliases: val('f_aliases') ? val('f_aliases').split(',').map(s => s.trim()).filter(Boolean) : [],
    notes: val('f_notes'), source: 'manual'
  };

  // בדיקת כפילויות גם כאן, לא רק בייבוא CSV — אותה פונקציה, אותו עיקרון:
  // המערכת לא מנחשת בשבילך (REVIEW_FINDINGS.md #24).
  try {
    const candidates = await AUTH.rpc('find_fuzzy_candidates', {
      p_first_name: person.first_name, p_last_name: person.last_name, p_id_number: person.id_number
    });
    const exactIdMatch = person.id_number && candidates.find(c => c.id_number === person.id_number);
    if (exactIdMatch) {
      if (!confirm(`כבר קיים איש קשר עם אותה ת"ז: ${exactIdMatch.first_name} ${exactIdMatch.last_name}.\nלהמשיך ולעדכן את הרשומה הקיימת (משלים שדות חסרים בלבד)?`)) return;
      const merged = {};
      Object.keys(person).forEach(k => { if (!exactIdMatch[k] && person[k]) merged[k] = person[k]; });
      await AUTH.api(`people?id=eq.${exactIdMatch.id}`, { method: 'PATCH', body: JSON.stringify(merged) });
      logAudit('merge', 'person', exactIdMatch.id, { via: 'manual_add', fields_changed: Object.keys(merged) });
      showMsg('addMsg', 'עודכנה הרשומה הקיימת (לא נוצרה כפולה)', 'ok');
      globalSearchCache = null;
      return;
    }
    if (candidates.length) {
      const c = candidates[0];
      if (!confirm(`נמצא איש קשר עם שם דומה: ${c.first_name} ${c.last_name}. האם זה אותו אדם? (אישור=לא מוסיפים, ביטול=בכל זאת רשומה נפרדת)`)) {
        // המשתמש בחר "ביטול" = בכל זאת רשומה נפרדת — ממשיכים לשמירה למטה.
      } else {
        showMsg('addMsg', 'לא נשמר — לך לטאב "ייבוא רשימה" למסך השוואה מלא, או ערוך את הרשומה הקיימת ב"רשימה מלאה".', 'err');
        return;
      }
    }
  } catch (e) { /* אם בדיקת הכפילויות נכשלת, לא חוסמים את השמירה עצמה */ }

  try {
    const created = await AUTH.api('people', {
      method: 'POST', body: JSON.stringify(person), headers: { 'Prefer': 'return=representation' }
    });
    const newId = created && created[0] && created[0].id;
    if (spouseId && newId) {
      await linkSpouses(newId, spouseId);
    }
    logAudit('create', 'person', newId, { name: person.first_name + ' ' + person.last_name });
    clearAddPersonForm();
    showMsg('addMsg', 'נשמר בהצלחה' + (spouseId ? ' וקושר לבן/בת הזוג' : ''), 'ok');
    loadPeopleIntoSelects();
    globalSearchCache = null;
  } catch (e) {
    showMsg('addMsg', 'שגיאה: ' + esc(e.message), 'err');
  }
}

/** ================= משפחות: קישור בני זוג + כרטיס משפחה ================= */

// מקשר שני אנשים כבני זוג: spouse_id הדדי + אותו family_id (יוצר family אם צריך).
// רץ כטרנזקציה אחת ב-Postgres (link_spouses RPC) — לא 4 קריאות REST נפרדות,
// כדי למנוע מרוץ תנאים בין שני משתמשים שמקשרים בו-זמנית (REVIEW_FINDINGS.md #12).
async function linkSpouses(personId, spouseId) {
  return AUTH.rpc('link_spouses', { p_person_id: personId, p_spouse_id: spouseId });
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
    if (!head) { showMsg('famMsg', 'האדם שנבחר לא נמצא — רענן את הדף ונסה שוב', 'err'); return; }
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
  const a = val('rel_a'), b = val('rel_b');
  let type = val('rel_type');
  if (type === 'אחר') {
    const free = val('rel_type_free').trim();
    if (!free) { showMsg('relMsg', 'יש לתאר את סוג הקשר', 'err'); return; }
    type = free;
  }
  if (!a || !b || a === b) { showMsg('relMsg', 'יש לבחור שני אנשים שונים', 'err'); return; }
  try {
    await AUTH.api('relations', { method: 'POST', body: JSON.stringify({ person_a: a, person_b: b, relation_type: type }) });
    logAudit('create', 'relation', null, { a, b, type });
    showMsg('relMsg', 'הקשר נוסף', 'ok');
    document.getElementById('rel_type_free').value = '';
    refreshRelationsList();
  } catch (e) {
    showMsg('relMsg', 'שגיאה: ' + esc(e.message), 'err');
  }
}

async function refreshRelationsList() {
  const el = document.getElementById('relList');
  if (!el) return;
  const rels = await AUTH.api('relations?select=*') || [];
  if (!rels.length) { el.innerHTML = ''; return; }
  const people = await AUTH.rpc('people_for_me', {}) || [];
  const byId = Object.fromEntries(people.map(p => [p.id, `${esc(p.first_name)} ${esc(p.last_name)}`]));
  el.innerHTML = '<div class="table-wrap"><table><tr><th>אדם א׳</th><th>קשר</th><th>אדם ב׳</th></tr>' +
    rels.map(r => `<tr><td>${byId[r.person_a] || '?'}</td><td>${esc(r.relation_type)}</td><td>${byId[r.person_b] || '?'}</td></tr>`).join('') +
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
  const byId = Object.fromEntries(people.map(p => [p.id, `${esc(p.first_name)} ${esc(p.last_name)}`]));
  el.innerHTML = '<div class="table-wrap"><table><tr><th>עם מי</th><th>סוג</th><th>תוכן</th><th>מתי</th></tr>' +
    rows.map(r => `<tr><td>${byId[r.person_id] || '?'}</td><td>${esc(INTERACTION_LABELS[r.kind] || r.kind)}</td>` +
      `<td>${esc(r.content)}</td><td style="font-size:.78rem">${esc(new Date(r.created_at).toLocaleDateString('he-IL'))}</td></tr>`).join('') +
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
    let html = `<h3><i class="bi bi-house-heart"></i> משפחת ${esc(head ? head.last_name : '?')}</h3>`;
    html += `<p><b>${head ? esc(head.first_name) + ' ' + esc(head.last_name) : '—'}</b>` +
      (spouse ? ` <i class="bi bi-heart-fill" style="color:var(--accent); font-size:.7rem"></i> <b>${esc(spouse.first_name)} ${esc(spouse.last_name)}</b>` : '') + '</p>';

    if (children.length) {
      html += '<div class="table-wrap"><table><tr><th>ילד/ה</th><th>תאריך לידה</th><th>גיל</th><th>בר/בת מצווה</th></tr>';
      children
        .slice()
        .sort((a, b) => (b.birth_date || '').localeCompare(a.birth_date || ''))
        .forEach(c => {
          html += `<tr><td>${esc(c.first_name)} ${esc(c.last_name)}</td><td>${esc(c.birth_date) || '-'}</td>` +
            `<td>${calcAge(c.birth_date) ?? '-'}</td><td>${esc(c.bar_mitzva_date) || '-'}</td></tr>`;
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
    if (!form.querySelector('.cf_first').value.trim()) return;
    const lastName = card.querySelector('h3').textContent.replace('משפחת ', '').trim();
    const child = {
      first_name: form.querySelector('.cf_first').value.trim(),
      last_name: lastName,
      gender: form.querySelector('.cf_gender').value || null,
      birth_date: form.querySelector('.cf_birth').value || null,
      bar_mitzva_date: form.querySelector('.cf_bm').value || null,
      family_id: familyId, source: 'manual'
    };
    const created = await AUTH.api('people', { method: 'POST', body: JSON.stringify(child), headers: { 'Prefer': 'return=representation' } });
    logAudit('create', 'person', created && created[0] && created[0].id, { via: 'add_child', family_id: familyId });
    globalSearchCache = null;
    loadPeopleIntoSelects();
    refreshFamiliesList();
  };
}

/** ================= ייבוא + מיפוי עמודות + דדופליקציה ================= */

// מפצל שורת CSV/TSV אחת לתאים, עם תמיכה בגרשיים ("תא, עם פסיק") לפי תקן CSV.
function splitDelimitedLine(line, delim) {
  const cells = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      cells.push(cur.trim()); cur = '';
    } else {
      cur += c;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function parseCsvRaw(text) {
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n').filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  // זיהוי אוטומטי: הדבקה מאקסל/Sheets יוצרת TSV (טאבים), לא CSV (פסיקים).
  const delim = (lines[0].match(/\t/g) || []).length >= (lines[0].match(/,/g) || []).length ? '\t' : ',';
  const headers = splitDelimitedLine(lines[0], delim);
  const rows = lines.slice(1).map(line => splitDelimitedLine(line, delim));
  return { headers, rows };
}

const IMPORT_TARGET_FIELDS = [
  ['', '— התעלם מהעמודה —'], ['first_name', 'שם פרטי'], ['last_name', 'שם משפחה'],
  ['id_number', 'ת"ז'], ['birth_date', 'תאריך לידה'], ['bar_mitzva_date', 'בר/בת מצווה'],
  ['street', 'רחוב'], ['city', 'עיר'], ['edah', 'עדה'], ['gender', 'מגדר'],
  ['phone', 'טלפון'], ['phone2', 'טלפון נוסף'], ['email', 'מייל'], ['school_class', 'כיתה'],
  ['role_in_family', 'תפקיד במשפחה'], ['institution', 'מוסד לימודים/כולל'],
  ['marriage_date', 'תאריך נישואין'], ['marital_status', 'סטטוס אישי'],
  ['housing_status', 'סטטוס דיור'], ['aliases', 'כינויים (מופרד בפסיק)'], ['notes', 'הערות']
];

// ניחוש אוטומטי לפי מילות מפתח בשם העמודה — נקודת התחלה, המשתמש יכול לתקן.
function guessFieldForHeader(header) {
  const h = header.toLowerCase();
  const guesses = [
    [/first.?name|שם פרטי|^שם$/, 'first_name'], [/last.?name|שם משפחה|משפחה/, 'last_name'],
    [/id.?number|ת"?ז|תעודת זהות/, 'id_number'],
    [/bar.?mitzva|בר מצווה|בת מצווה/, 'bar_mitzva_date'], [/birth|לידה/, 'birth_date'],
    [/street|רחוב|כתובת/, 'street'], [/city|עיר|יישוב/, 'city'],
    [/edah|עדה/, 'edah'], [/gender|מגדר|מין/, 'gender'],
    [/phone2|טלפון נוסף/, 'phone2'], [/phone|טלפון|נייד/, 'phone'],
    [/email|מייל|דוא/, 'email'], [/class|כיתה/, 'school_class'],
    [/role|תפקיד/, 'role_in_family'], [/institution|מוסד|כולל/, 'institution'],
    [/marriage|נישואין/, 'marriage_date'], [/marital|סטטוס אישי|מצב אישי/, 'marital_status'],
    [/housing|דיור/, 'housing_status'], [/alias|כינוי/, 'aliases'], [/note|הער/, 'notes']
  ];
  for (const [re, field] of guesses) if (re.test(h)) return field;
  return '';
}

let csvParsed = null;

function copyCsvHeaders() {
  const headers = 'שם פרטי,שם משפחה,טלפון,תעודת זהות,רחוב,שכונה,עיר';
  navigator.clipboard.writeText(headers).then(() => {
    const msg = document.getElementById('importMsg');
    msg.innerHTML = '<div class="msg ok"><i class="bi bi-check2"></i> שורת הכותרות הועתקה לזיכרון — הדבק ב-Excel/Sheets.</div>';
    setTimeout(() => { if (msg.innerHTML.includes('שורת הכותרות')) msg.innerHTML = ''; }, 4000);
  }).catch(() => {
    alert('שורת הכותרות: ' + headers);
  });
}

function cancelImport() {
  csvParsed = null;
  pendingReview = [];
  document.getElementById('csvInput').value = '';
  document.getElementById('importSource').value = '';
  document.getElementById('mappingArea').innerHTML = '';
  document.getElementById('reviewArea').innerHTML = '';
  document.getElementById('importMsg').innerHTML = '<div class="msg ok">הייבוא בוטל. אפשר להתחיל מחדש בכל עת.</div>';
}

function startColumnMapping() {
  csvParsed = parseCsvRaw(val('csvInput'));
  if (!csvParsed.headers.length) return;
  const area = document.getElementById('mappingArea');
  let html = '<div class="card"><h3><i class="bi bi-diagram-3"></i> שייכו כל עמודה לשדה במערכת</h3>' +
    '<div class="table-wrap"><table><tr><th>עמודה בקובץ</th><th>דוגמה</th><th>שדה במערכת</th></tr>';
  csvParsed.headers.forEach((h, i) => {
    const sample = (csvParsed.rows[0] && csvParsed.rows[0][i]) || '';
    const guess = guessFieldForHeader(h);
    html += `<tr><td><b>${esc(h)}</b></td><td style="color:var(--muted)">${esc(sample)}</td><td>` +
      `<select class="mapSelect" data-col="${i}">` +
      IMPORT_TARGET_FIELDS.map(([val_, label]) => `<option value="${val_}" ${val_ === guess ? 'selected' : ''}>${esc(label)}</option>`).join('') +
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
    Object.keys(colToField).forEach(colIdx => {
      const field = colToField[colIdx];
      const raw = cells[colIdx] || '';
      row[field] = field === 'aliases' ? raw.split(',').map(s => s.trim()).filter(Boolean) : raw;
    });
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
  const autoMergedNames = [];

  for (const row of rows) {
    let candidates = [];
    try {
      candidates = await AUTH.rpc('find_fuzzy_candidates', {
        p_first_name: row.first_name, p_last_name: row.last_name,
        p_id_number: row.id_number || null
      });
    } catch (e) {
      const msg = 'שגיאה בבדיקת כפילויות בשורה של "' + esc((row.first_name||'') + ' ' + (row.last_name||'')).trim() + '": ' + esc(e.message);
      document.getElementById('importMsg').innerHTML =
        `<div class="msg err">${msg}</div>` +
        `<div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap">` +
        `  <button class="secondary" style="margin:0" onclick="cancelImport()"><i class="bi bi-x-lg"></i> בטל את הייבוא</button>` +
        `  <button class="secondary" style="margin:0" onclick="document.getElementById('mappingArea').scrollIntoView({behavior:'smooth'})"><i class="bi bi-arrow-up"></i> חזור לשינוי מיפוי</button>` +
        `</div>`;
      return;
    }

    const exactIdMatch = candidates.find(c => row.id_number && c.id_number === row.id_number);
    if (exactIdMatch) {
      const merged = {};
      Object.keys(row).forEach(k => { if (!exactIdMatch[k] && row[k]) merged[k] = row[k]; });
      if (Object.keys(merged).length) {
        await AUTH.api('merge_log', { method: 'POST', body: JSON.stringify({
          target_person: exactIdMatch.id, before_snapshot: exactIdMatch, merged_from: row
        }) });
        await AUTH.api(`people?id=eq.${exactIdMatch.id}`, { method: 'PATCH', body: JSON.stringify(merged) });
        logAudit('merge', 'person', exactIdMatch.id, { via: 'exact_id_match', fields_changed: Object.keys(merged) });
      }
      autoMerged++;
      autoMergedNames.push(`${exactIdMatch.first_name} ${exactIdMatch.last_name}`);
      continue;
    }

    if (candidates.length) {
      pendingReview.push({ existingPerson: candidates[0], newRow: row });
      continue;
    }

    row.source = source;
    row.id_number = row.id_number || null;
    row.birth_date = row.birth_date || null;
    const created = await AUTH.api('people', { method: 'POST', body: JSON.stringify(row), headers: { 'Prefer': 'return=representation' } });
    logAudit('create', 'person', created && created[0] && created[0].id, { via: 'import', source });
    imported++;
  }

  await AUTH.api('import_log', { method: 'POST',
    body: JSON.stringify({ source, row_count: rows.length }) });

  globalSearchCache = null;
  showMsg('importMsg',
    `יובאו: ${imported} | מוזגו אוטומטית (ת"ז זהה): ${autoMerged}` +
    (autoMergedNames.length ? ` (${autoMergedNames.map(esc).join(', ')})` : '') +
    ` | דורש בדיקה ידנית: ${pendingReview.length}`,
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
      fieldsHtml += `<tr><td>${esc(label)}</td>` +
        `<td><label style="font-weight:400"><input type="radio" name="cmp_${idx}_${key}" value="existing" ${existingVal || !newVal ? 'checked' : ''}> ${esc(existingVal) || '(ריק)'}</label></td>` +
        `<td><label style="font-weight:400"><input type="radio" name="cmp_${idx}_${key}" value="new" ${!existingVal && newVal ? 'checked' : ''}> ${esc(newVal) || '(ריק)'}</label></td></tr>`;
    });
    fieldsHtml += '</table></div>';
    box.innerHTML =
      `<b>קיים:</b> ${esc(item.existingPerson.first_name)} ${esc(item.existingPerson.last_name)} ` +
      `&nbsp;↔&nbsp; <b>חדש:</b> ${esc(item.newRow.first_name)} ${esc(item.newRow.last_name)}` +
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
  if (!confirm('לבטל את המיזוג האחרון עבור הרשומה הזו ולהחזיר אותה למצב הקודם?')) return;
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
  globalSearchCache = null;
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

// תוצאות נשמרות per-panel, לא במשתנה גלובלי יחיד — אחרת ביקור בטאב "רשימה
// מלאה" דורס את מה שטאב "חיפוש" עמד לייצא/לתייג (ראה REVIEW_FINDINGS.md #2/#9).
const panelResults = {};

function renderPeopleTable(people, elId, title) {
  panelResults[elId] = people;
  const el = document.getElementById(elId);
  const canEdit = myAccessLevel === 'full';
  if (!people.length) {
    el.innerHTML = '<div class="card" style="text-align:center; color:var(--muted)"><i class="bi bi-inbox"></i> אין אנשי קשר להצגה</div>';
    return;
  }
  let html = `<div class="card"><h3><i class="bi bi-list-check"></i> ${people.length} ${esc(title)} ` +
    `<button class="secondary" style="margin-inline-start:8px; margin-top:0; font-size:.78rem; padding:6px 12px" onclick="exportResultsToCsv('${elId}')">` +
    `<i class="bi bi-download"></i> ייצוא לאקסל (CSV)</button> ` +
    `<button class="secondary" style="margin:0; font-size:.78rem; padding:6px 12px" onclick="exportResultsCustom('hefetz','${elId}')">` +
    `<i class="bi bi-file-earmark-arrow-down"></i> ייצוא לחפץ חסד</button> ` +
    `<button class="secondary" style="margin:0; font-size:.78rem; padding:6px 12px" onclick="exportResultsCustom('nedarim','${elId}')">` +
    `<i class="bi bi-file-earmark-arrow-down"></i> ייצוא לנדרים פלוס</button></h3>` +
    (canEdit ? `<div style="display:flex; gap:8px; align-items:center; margin-bottom:10px; flex-wrap:wrap">` +
    `<input id="bulkTagName_${elId}" placeholder="שם קטגוריה" style="max-width:180px; margin:0">` +
    `<button class="secondary" style="margin:0; font-size:.78rem; padding:6px 12px" onclick="bulkTagSelected('${elId}')">` +
    `<i class="bi bi-tags"></i> הוסף קטגוריה לנבחרים</button></div>` : '') +
    `<div class="table-wrap"><table><tr><th><input type="checkbox" onclick="toggleAllResultChecks(this,'${elId}')"></th><th>שם</th><th>ת"ז</th><th>תאריך לידה</th><th>גיל</th><th>רחוב</th><th>טלפון</th><th>כיתה</th>${canEdit ? '<th></th>' : ''}</tr>`;
  people
    .slice()
    .sort((a, b) => `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`, 'he'))
    .forEach(p => {
      html += `<tr><td><input type="checkbox" class="resultCheck_${elId}" value="${esc(p.id)}"></td>` +
        `<td>${esc(p.first_name)} ${esc(p.last_name)}</td><td>${esc(p.id_number)}</td><td>${esc(p.birth_date)}</td>` +
        `<td>${calcAge(p.birth_date) ?? ''}</td><td>${esc(p.street)}</td><td>${esc(p.phone)}</td><td>${esc(p.school_class)}</td>` +
        (canEdit ? `<td><button class="secondary" style="margin:0; font-size:.75rem; padding:4px 10px" onclick="openEditPerson('${p.id}','${elId}')"><i class="bi bi-pencil"></i></button></td>` : '') +
        '</tr>';
    });
  html += '</table></div></div>';
  if (canEdit) html += `<div id="editPersonArea_${elId}"></div>`;
  el.innerHTML = html;
}

async function refreshFullList() {
  const people = await AUTH.rpc('people_for_me', {}) || [];
  renderPeopleTable(people, 'fullListResults', 'אנשי קשר — הרשימה המלאה');
}

/** ================= עריכה/מחיקה של איש קשר קיים ================= */

const EDIT_FIELDS = [
  ['first_name', 'שם פרטי'], ['last_name', 'שם משפחה'], ['id_number', 'ת"ז'],
  ['birth_date', 'תאריך לידה', 'date'], ['phone', 'טלפון'], ['phone2', 'טלפון נוסף'],
  ['email', 'מייל'], ['street', 'רחוב'], ['city', 'עיר'], ['school_class', 'כיתה'],
  ['notes', 'הערות']
];

function openEditPerson(personId, elId) {
  const person = (panelResults[elId] || []).find(p => p.id === personId);
  if (!person) return;
  const area = document.getElementById(`editPersonArea_${elId}`);
  area.innerHTML = `<div class="card" style="border:1px solid var(--accent)">
    <h3><i class="bi bi-pencil-square"></i> עריכת ${esc(person.first_name)} ${esc(person.last_name)}</h3>
    <div class="field-grid">
      ${EDIT_FIELDS.map(([key, label, type]) =>
        `<label>${label}<input id="ep_${key}" type="${type || 'text'}" value="${esc(person[key])}"></label>`
      ).join('')}
    </div>
    <button class="primary" onclick="saveEditPerson('${personId}','${elId}')"><i class="bi bi-check2"></i> שמור שינויים</button>
    <button class="secondary" onclick="deletePersonConfirm('${personId}','${elId}')"><i class="bi bi-trash"></i> מחק איש קשר</button>
    <button class="secondary" onclick="document.getElementById('editPersonArea_${elId}').innerHTML=''"><i class="bi bi-x"></i> ביטול</button>
    <div id="editPersonMsg_${elId}"></div>
  </div>`;
  area.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function saveEditPerson(personId, elId) {
  const updates = {};
  EDIT_FIELDS.forEach(([key]) => { updates[key] = document.getElementById(`ep_${key}`).value || null; });
  try {
    await AUTH.api(`people?id=eq.${personId}`, { method: 'PATCH', body: JSON.stringify(updates) });
    logAudit('update', 'person', personId, { fields: Object.keys(updates) });
    globalSearchCache = null;
    document.getElementById(`editPersonMsg_${elId}`).innerHTML = '<div class="msg ok">נשמר</div>';
    if (elId === 'fullListResults') refreshFullList(); else if (elId === 'searchResults') runSearch();
  } catch (e) {
    document.getElementById(`editPersonMsg_${elId}`).innerHTML = `<div class="msg err">שגיאה: ${esc(e.message)}</div>`;
  }
}

async function deletePersonConfirm(personId, elId) {
  const person = (panelResults[elId] || []).find(p => p.id === personId);
  if (!confirm(`למחוק לצמיתות את ${person ? person.first_name + ' ' + person.last_name : 'איש הקשר'}? לא ניתן לבטל.`)) return;
  try {
    await AUTH.api(`people?id=eq.${personId}`, { method: 'DELETE' });
    logAudit('delete', 'person', personId, { name: person ? `${person.first_name} ${person.last_name}` : '' });
    globalSearchCache = null;
    if (elId === 'fullListResults') refreshFullList(); else if (elId === 'searchResults') runSearch();
  } catch (e) {
    document.getElementById(`editPersonMsg_${elId}`).innerHTML = `<div class="msg err">שגיאה: ${esc(e.message)}</div>`;
  }
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

  renderPeopleTable(people, 'searchResults', 'תוצאות');
}

function toggleAllResultChecks(master, elId) {
  document.querySelectorAll(`.resultCheck_${elId}`).forEach(cb => cb.checked = master.checked);
}

async function bulkTagSelected(elId) {
  const catName = document.getElementById(`bulkTagName_${elId}`).value;
  if (!catName) return;
  const ids = Array.from(document.querySelectorAll(`.resultCheck_${elId}:checked`)).map(cb => cb.value);
  if (!ids.length) { alert('לא נבחרו אנשים'); return; }
  await AUTH.api('categories', { method: 'POST', body: JSON.stringify({ name: catName }) }).catch(() => {});
  let ok = 0, fail = 0;
  for (const id of ids) {
    try {
      await AUTH.api('person_categories', { method: 'POST', body: JSON.stringify({ person_id: id, category_name: catName }) });
      ok++;
    } catch (e) { fail++; }
  }
  logAudit('bulk_tag', 'category', null, { category: catName, ok, fail });
  alert(fail === 0 ? `הקטגוריה נוספה ל-${ok} אנשים` : `נוספה ל-${ok} אנשים, נכשלה עבור ${fail} (כנראה כבר תויגו קודם)`);
}

function exportResultsToCsv(elId) {
  const results = panelResults[elId] || [];
  if (!results.length) return;
  const cols = ['first_name','last_name','id_number','birth_date','gender','street','city',
    'school_class','phone','phone2','email','housing_status','notes'];
  const headerLabels = ['שם פרטי','שם משפחה','ת"ז','תאריך לידה','מגדר','רחוב','עיר',
    'כיתה','טלפון','טלפון נוסף','מייל','סטטוס דיור','הערות'];
  const rows = [headerLabels.join(',')];
  results.forEach(p => {
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

function exportResultsCustom(formatKey, elId) {
  const results = panelResults[elId] || [];
  if (!results.length) return;
  const fmt = CUSTOM_EXPORT_FORMATS[formatKey];
  const rows = [fmt.headers.join(',')];
  results.forEach(p => rows.push(fmt.row(p).map(csvEscape).join(',')));
  const csv = '﻿' + rows.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `anshei-kesher-${formatKey}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  logAudit('export', 'people', null, { format: formatKey, count: results.length });
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
  el.innerHTML = '';
  // בנייה עם DOM API ולא string concatenation — r.name/r.filters מגיעים מ-prompt()
  // חופשי של המשתמש, וזה נמנע מ-XSS/שבירת attribute בלי צורך ב-escape ידני.
  rows.forEach(r => {
    const span = document.createElement('span');
    span.style = 'display:inline-flex; align-items:center; gap:6px; background:var(--accent-soft); color:var(--primary-dark); padding:5px 6px 5px 12px; border-radius:999px; font-size:.8rem; margin:2px';
    const btn = document.createElement('button');
    btn.style = 'margin:0; background:none; border:none; padding:0; cursor:pointer; color:var(--primary-dark); font-weight:700';
    btn.textContent = r.name;
    btn.onclick = () => applySavedSearch(r.filters);
    const x = document.createElement('i');
    x.className = 'bi bi-x-circle';
    x.style.cursor = 'pointer';
    x.onclick = () => deleteSavedSearch(r.id);
    span.appendChild(btn); span.appendChild(x);
    el.appendChild(span);
  });
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
  if (!confirm('למחוק את החיפוש השמור הזה?')) return;
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
  if (!val('newCatName').trim()) { showMsg('catList', 'יש להזין שם קטגוריה', 'err'); return; }
  try {
    await AUTH.api('categories', { method: 'POST',
      body: JSON.stringify({ name: val('newCatName').trim(), group: val('newCatGroup') || '' }) });
    document.getElementById('newCatName').value = '';
    document.getElementById('newCatGroup').value = '';
    refreshCatList();
    const catSelect = document.getElementById('q_category');
    if (catSelect) { catSelect.innerHTML = '<option value="">הכל</option>'; loadCategoriesIntoSelect('q_category'); }
  } catch (e) {
    document.getElementById('catList').innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
  }
}

async function deleteCategoryConfirm(name) {
  if (!confirm(`למחוק את הקטגוריה "${name}"? כל השיוכים אליה יימחקו גם הם.`)) return;
  await AUTH.api(`categories?name=eq.${encodeURIComponent(name)}`, { method: 'DELETE' });
  refreshCatList();
}

async function refreshCatList() {
  const cats = await AUTH.api('categories?select=name,group&order=name');
  const el = document.getElementById('catList');
  if (!cats || !cats.length) {
    el.innerHTML = '<p style="color:var(--muted); font-size:.85rem">אין עדיין קטגוריות</p>';
    return;
  }
  el.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style = 'display:flex; flex-wrap:wrap; gap:8px';
  cats.forEach(c => {
    const span = document.createElement('span');
    span.style = 'background:var(--accent-soft); color:var(--primary-dark); padding:6px 10px 6px 14px; border-radius:999px; font-size:.82rem; font-weight:600; display:inline-flex; align-items:center; gap:6px';
    span.innerHTML = `<i class="bi bi-tag"></i> ${esc(c.name)}${c.group ? ' · ' + esc(c.group) : ''}`;
    const del = document.createElement('i');
    del.className = 'bi bi-x-circle';
    del.style.cursor = 'pointer';
    del.onclick = () => deleteCategoryConfirm(c.name);
    span.appendChild(del);
    wrap.appendChild(span);
  });
  el.appendChild(wrap);
}
refreshCatList();
