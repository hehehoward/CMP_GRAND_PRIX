/* ===== CMP Grand Prix · cloud sync (Supabase REST). Off when URL/KEY are empty → folder mode as before ===== */
var CLOUD = (function () {
  var URL0 = 'https://fnlpuplbkefqjsmkjtni.supabase.co', KEY = 'sb_publishable_KFb8R43Uq9QHd8KpXUfrow_Dc-zbz7S';
  var q = {}; try { q = Object.fromEntries(new URLSearchParams(location.search)); } catch (e) { }
  /* ?cloud=0 forces folder mode (intranet .bat setup); ?e=CODE separates rehearsals from the real event */
  var on = !!(URL0 && KEY) && q.cloud !== '0';
  var event = String(q.e || 'GP2026').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'GP2026';
  var H = { apikey: KEY, 'Content-Type': 'application/json' };
  function req(path, opt) {
    opt = opt || {}; var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, opt.timeout || 9000);
    return fetch(URL0 + '/rest/v1/' + path, { method: opt.method || 'GET', headers: Object.assign({}, H, opt.headers || {}), body: opt.body, signal: ctl.signal, cache: 'no-store' })
      .then(function (r) { clearTimeout(t); if (!r.ok) return r.text().then(function (x) { throw new Error(r.status + ' ' + x.slice(0, 120)); }); return r.status === 204 || (opt.method === 'POST' && !opt.expect) ? null : r.json(); },
        function (e) { clearTimeout(t); throw e; });
  }
  function upsert(table, conflict, row, to) { return req(table + '?on_conflict=' + conflict, { method: 'POST', timeout: to, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) }); }
  return {
    on: on, event: event,
    /* player record: one row per (event, id), overwritten after every test */
    putPlayer: function (id, name, payload, to) { return upsert('cmpgp_players', 'event,id', { event: event, id: String(id).slice(0, 40), name: String(name || '').slice(0, 40), payload: payload }, to); },
    /* rows changed after `since` (ISO string, '' = all), oldest first */
    players: function (since) { return req('cmpgp_players?select=id,payload,updated_at&event=eq.' + encodeURIComponent(event) + (since ? '&updated_at=gt.' + encodeURIComponent(since) : '') + '&order=updated_at.asc&limit=1000'); },
    putControl: function (data) { return upsert('cmpgp_control', 'event', { event: event, data: data }); },
    control: function () { return req('cmpgp_control?select=data&event=eq.' + encodeURIComponent(event)).then(function (r) { return r && r[0] ? r[0].data : null; }); },
    /* host admin: read any event, and PIN-protected changes through the cmpgp_admin() database function */
    playersOf: function (ev) { return req('cmpgp_players?select=id,name,payload,updated_at&event=eq.' + encodeURIComponent(ev) + '&order=updated_at.desc&limit=1000'); },
    admin: function (pin, action, args) { args = args || {}; return req('rpc/cmpgp_admin', { method: 'POST', expect: true, body: JSON.stringify({ p_pin: pin, p_action: action, p_event: args.event || null, p_id: args.id || null, p_name: args.name || null, p_payload: args.payload || null }) }); },
    /* link players open: same folder, garage page, same event code */
    playerUrl: function (garageFile) { var u = new URL(garageFile || './', location.href); u.search = ''; if (event !== 'GP2026') u.searchParams.set('e', event); return u.href; }
  };
})();
