// תצורה ציבורית. ה-anon key מוגן ע"י RLS — אין בו סוד, אבל anon לא רואה כלום
// כי אין ל-anon אף policy בטבלאות anshei_kesher (deny by default).
window.CFG = {
  url: 'https://cmsusfmwjtpfewbydzpi.supabase.co',
  anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtc3VzZm13anRwZmV3YnlkenBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NjE1NzUsImV4cCI6MjEwMzQzNzU3NX0.bVI6dRLXfjCkVgdDNZPbzEk-897IOzZCaNocqtNkg9w',
  schema: 'anshei_kesher'
};
