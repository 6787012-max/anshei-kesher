// Auth מינימלי מעל Supabase Auth REST API — בלי ספריית לקוח חיצונית (CDN עלול
// להיחסם ע"י נטפרי לדומיינים לא-מאושרים). כל הקריאות ל-*.supabase.co בלבד,
// שכבר מאושר בנטפרי בפרויקט gmachim.

const AUTH = {
  KEY: 'ak_session',

  getSession() {
    try { return JSON.parse(localStorage.getItem(this.KEY)); }
    catch (e) { return null; }
  },

  setSession(s) { localStorage.setItem(this.KEY, JSON.stringify(s)); },
  clearSession() { localStorage.removeItem(this.KEY); },

  async login(email, password) {
    const res = await fetch(`${CFG.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': CFG.anon },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || 'שגיאת התחברות');
    this.setSession({ access_token: data.access_token, user: data.user, expires_at: Date.now() + data.expires_in * 1000 });
    return data;
  },

  logout() { this.clearSession(); location.href = 'login.html'; },

  requireLogin() {
    const s = this.getSession();
    if (!s || Date.now() > s.expires_at) {
      location.href = 'login.html';
      return null;
    }
    return s;
  },

  // עוזר קריאות ל-PostgREST על ה-schema anshei_kesher, עם ה-token של המשתמש
  // המחובר — כך ש-RLS פועל לפי auth.uid() האמיתי, לא לפי anon.
  async api(path, opts) {
    const s = this.requireLogin();
    if (!s) return null;
    opts = opts || {};
    const headers = Object.assign({
      'apikey': CFG.anon,
      'Authorization': `Bearer ${s.access_token}`,
      'Content-Type': 'application/json',
      'Accept-Profile': CFG.schema,
      'Content-Profile': CFG.schema
    }, opts.headers || {});
    const res = await fetch(`${CFG.url}/rest/v1/${path}`, Object.assign({}, opts, { headers }));
    if (res.status === 401) { this.clearSession(); location.href = 'login.html'; return null; }
    const text = await res.text();
    if (!res.ok) {
      let err = {};
      try { err = JSON.parse(text); } catch (e) {}
      throw new Error(err.message || `שגיאת שרת (${res.status})`);
    }
    if (!text) return null;
    return JSON.parse(text);
  },

  async rpc(fnName, args) {
    const s = this.requireLogin();
    if (!s) return null;
    const res = await fetch(`${CFG.url}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers: {
        'apikey': CFG.anon,
        'Authorization': `Bearer ${s.access_token}`,
        'Content-Type': 'application/json',
        'Content-Profile': CFG.schema,
        'Accept-Profile': CFG.schema
      },
      body: JSON.stringify(args || {})
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `שגיאת שרת (${res.status})`);
    }
    return res.json();
  }
};
