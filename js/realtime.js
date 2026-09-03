// סנכרון חי — נוכחות (מי מחובר עכשיו) + טיקר פעילות מ-audit_log.
// vendor מקומי (vendor/supabase/supabase.min.js), בלי CDN. דורש session תקף מ-AUTH.
// אם ה-WebSocket חסום (נטפרי/רשת) — נכשל בשקט, שאר האתר ממשיך לעבוד רגיל.
(function () {
  if (typeof window.supabase === 'undefined' || typeof AUTH === 'undefined') return;

  let client = null;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderPresence(state) {
    const el = document.getElementById('presenceBar');
    if (!el) return;
    const emails = Object.values(state).flat().map(p => p.email).filter(Boolean);
    const uniq = [...new Set(emails)];
    if (uniq.length <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = '<i class="bi bi-circle-fill" style="font-size:7px; color:var(--success)"></i> ' +
      uniq.map(e => esc(e.split('@')[0])).join(' · ');
    el.title = 'מחוברים כרגע: ' + uniq.map(esc).join(', ');
  }

  function pushActivity(html) {
    const el = document.getElementById('activityTicker');
    if (!el) return;
    el.style.display = 'block';
    const row = document.createElement('div');
    row.style.cssText = 'padding:6px 0; border-bottom:1px solid var(--line); font-size:12.5px; color:var(--muted)';
    row.innerHTML = html;
    el.prepend(row);
    while (el.children.length > 6) el.removeChild(el.lastChild);
  }

  const ACTION_LABELS = { create: 'הוסיף/ה', update: 'עדכן/ה', delete: 'מחק/ה', merge: 'מיזג/ה' };

  window.RT = {
    status: 'not-started',
    start() {
      const session = AUTH.getSession();
      if (!session) return;
      try {
        client = window.supabase.createClient(CFG.url, CFG.anon, { db: { schema: CFG.schema } });
        client.realtime.setAuth(session.access_token);
      } catch (e) { this.status = 'init-error'; return; }

      const email = (session.user && session.user.email) || 'משתמש';
      const presenceChannel = client.channel('presence:global', { config: { presence: { key: email } } });
      presenceChannel
        .on('presence', { event: 'sync' }, () => renderPresence(presenceChannel.presenceState()))
        .subscribe(async (status) => {
          window.RT.status = status;
          if (status === 'SUBSCRIBED') await presenceChannel.track({ email, at: new Date().toISOString() });
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            const el = document.getElementById('presenceBar'); if (el) el.innerHTML = '';
          }
        });

      client.channel('activity:audit_log')
        .on('postgres_changes', { event: 'INSERT', schema: CFG.schema, table: 'audit_log' }, (payload) => {
          const r = payload.new || {};
          const who = (r.actor_email || '').split('@')[0] || 'מישהו';
          const what = ACTION_LABELS[r.action] || r.action || '';
          pushActivity(`<b>${esc(who)}</b> ${esc(what)} ${esc(r.entity || '')} · עכשיו`);
        })
        .subscribe();
    }
  };
})();
