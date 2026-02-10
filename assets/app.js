
(() => {
  const cfg = window.APP_CFG || {};
  const SUPABASE_URL = cfg.SUPABASE_URL;
  const ANON_KEY = cfg.ANON_KEY;
  const EMBED_ADMIN_TOKEN = cfg.ADMIN_TOKEN;

  const $ = (id) => document.getElementById(id);

  const LS = {
    meId: "pt_me_id",
    meKey: "pt_me_key",
    adminLogged: "pt_admin_logged",
    adminTokenStore: "pt_admin_token_store",
    adminUser: "pt_admin_user",
    adminMail: "pt_admin_mail"
  };

  let PUBLIC_PERSONEL = [];
  let ME = { id: null, key: null, ad: null };
  let ADMIN = { logged: false, token: null, user: null, mail: null };

  let DETAIL = { open: false, personelId: null, personelAd: null, rows: [] };
  let EDIT_CTX = { kayitId: null, personelId: null, personelAd: null, afterSave: null };

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(toast._tm);
    toast._tm = setTimeout(() => (t.style.display = "none"), 2400);
  }

  function setPill(kind, msg) {
    const dot = $("pillDot");
    const text = $("pillText");
    text.textContent = msg || "Hazır";
    dot.style.background =
      kind === "good" ? "var(--good)" :
      kind === "bad"  ? "var(--bad)"  :
      kind === "warn" ? "var(--warn)" : "#9aa4bf";
  }

  function nowClock() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    $("clock").textContent = `${hh}:${mm}`;
  }
  setInterval(nowClock, 15000); nowClock();

  function randHex(len) {
    const a = new Uint8Array(len / 2);
    crypto.getRandomValues(a);
    return Array.from(a).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function prettyDT(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    const Y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, "0");
    const D = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${Y}-${M}-${D} ${h}:${m}`;
  }

  function toIsoFromInput(s) {
    const v = (s || "").trim();
    if (!v) return null;
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
    if (!m) return null;
    const [_, Y, Mo, D, H, Mi] = m;
    const dt = new Date(`${Y}-${Mo}-${D}T${H}:${Mi}:00`);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString();
  }

  async function apiFetch(path, { method = "GET", headers = {}, body = null } = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${path}`;
    const h = {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
      ...headers
    };
    const res = await fetch(url, { method, headers: h, body: body ? JSON.stringify(body) : null });
    const txt = await res.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
    if (!res.ok) {
      const msg = (data && data.message) ? data.message : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async function selectTable(table, select = "*", filter = "", headers = {}) {
    const q = `${table}?select=${encodeURIComponent(select)}${filter ? "&" + filter : ""}`;
    return apiFetch(q, { headers });
  }

  async function insertTable(table, row, headers = {}) {
    return apiFetch(`${table}?select=*`, {
      method: "POST",
      headers: { Prefer: "return=representation", ...headers },
      body: row
    });
  }

  async function patchTable(table, filter, patch, headers = {}) {
    return apiFetch(`${table}?${filter}&select=*`, {
      method: "PATCH",
      headers: { Prefer: "return=representation", ...headers },
      body: patch
    });
  }

  function loadLocal() {
    ME.id = localStorage.getItem(LS.meId);
    ME.key = localStorage.getItem(LS.meKey);

    ADMIN.logged = localStorage.getItem(LS.adminLogged) === "1";
    ADMIN.token = localStorage.getItem(LS.adminTokenStore);
    ADMIN.user = localStorage.getItem(LS.adminUser) || "";
    ADMIN.mail = localStorage.getItem(LS.adminMail) || "";
  }

  function setAdminUI() {
    $("admUser").value = ADMIN.user || "";
    $("admMail").value = ADMIN.mail || "";
    $("admPass").value = "";

    if (ADMIN.logged && ADMIN.token) {
      $("adminGate").style.display = "none";
      $("adminPanel").style.display = "block";
      $("btnAdminRefresh").disabled = false;
    } else {
      $("adminGate").style.display = "block";
      $("adminPanel").style.display = "none";
      $("btnAdminRefresh").disabled = true;
    }
  }

  function renderMeBadge() {
    if (ME.id) {
      const p = PUBLIC_PERSONEL.find(x => x.id === ME.id);
      ME.ad = p ? p.ad : ME.ad;
      $("meBadge").textContent = ME.ad || "Seçildi";
      $("meHint").textContent = "Not yaz → izin/giriş/çıkış yap.";
    } else {
      $("meBadge").textContent = "Seçilmedi";
      $("meHint").textContent = "Önce listeden kendi adını seç.";
    }
  }

  function itemElPersonel(p, clickableForAdmin) {
    const div = document.createElement("div");
    div.className = "item";

    const left = document.createElement("div");
    left.className = "itemLeft";
    const b = document.createElement("b");
    b.textContent = p.ad;

    const tag = document.createElement("span");
    tag.className = "tag unk";
    tag.innerHTML = `<span class="dot"></span><span>${ME.id === p.id ? "Seçili" : "Seç"}</span>`;
    left.appendChild(b);
    left.appendChild(tag);

    const actions = document.createElement("div");
    actions.className = "actions";
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = ME.id === p.id ? "Seçili" : "Seç";
    btn.onclick = async () => {
      ME.id = p.id; ME.ad = p.ad;
      localStorage.setItem(LS.meId, ME.id);
      renderMeBadge();
      await refreshMyButtons();
      await refreshPublicList();
    };
    actions.appendChild(btn);

    div.appendChild(left);
    div.appendChild(actions);

    if (clickableForAdmin) {
      div.style.cursor = "pointer";
      div.addEventListener("click", (ev) => {
        if (ev.target && ev.target.tagName && ev.target.tagName.toLowerCase() === "button") return;
        openDetail(p.id, p.ad);
      });
    }

    return div;
  }

  async function refreshPublicList() {
    try {
      setPill("warn", "Yükleniyor…");
      const data = await selectTable("personel", "id,ad,created_at", "order=created_at.desc");
      PUBLIC_PERSONEL = data || [];

      // if selected missing, clear
      if (ME.id && !PUBLIC_PERSONEL.some(x => x.id === ME.id)) {
        ME.id = null; ME.ad = null;
        localStorage.removeItem(LS.meId);
      }

      renderMeBadge();

      const list = $("publicList");
      list.innerHTML = "";
      if (PUBLIC_PERSONEL.length === 0) {
        list.innerHTML = `<div class="hint">Henüz personel yok. Üstten “Kendimi Ekle” ile başlayabilirsiniz.</div>`;
      } else {
        PUBLIC_PERSONEL.forEach(p => list.appendChild(itemElPersonel(p, false)));
      }

      setPill("good", "Hazır");
    } catch (e) {
      setPill("bad", "Hata");
      toast("Liste alınamadı: " + e.message);
    }
  }

  async function addSelf() {
    const ad = ($("inpName").value || "").trim();
    if (ad.length < 2) { toast("Ad Soyad en az 2 karakter olmalı."); return; }

    let key = ME.key || localStorage.getItem(LS.meKey);
    if (!key) {
      key = randHex(32);
      localStorage.setItem(LS.meKey, key);
      ME.key = key;
    }

    try {
      setPill("warn", "Kaydediliyor…");
      const res = await insertTable("personel", { ad, personel_key: key });
      const created = res && res[0];
      if (!created) throw new Error("Kayıt dönmedi.");

      ME.id = created.id;
      ME.ad = created.ad;
      localStorage.setItem(LS.meId, ME.id);

      $("inpName").value = "";
      toast("Kayıt tamam ✅");
      await refreshPublicList();
      await refreshMyButtons();
      setPill("good", "Hazır");
    } catch (e) {
      setPill("bad", "Hata");
      toast("Eklenemedi: " + e.message + " (Bu cihazda daha önce eklendiysen listeden adını seç.)");
    }
  }

  async function myOpenSession() {
    if (!ME.id || !ME.key) return null;
    const headers = { "x-personel-key": ME.key };
    const open = await selectTable(
      "kayitlar",
      "id,personel_id,giris_ts,cikis_ts",
      `personel_id=eq.${ME.id}&cikis_ts=is.null&order=giris_ts.desc&limit=1`,
      headers
    );
    return (open && open[0]) ? open[0] : null;
  }

  async function refreshMyButtons() {
    const hasMe = !!(ME.id && ME.key);
    $("btnGiris").disabled = !hasMe;
    $("btnCikis").disabled = !hasMe;
    $("btnIzin").disabled = !hasMe;

    if (!hasMe) return;

    try {
      const open = await myOpenSession();
      if (open) {
        $("btnGiris").disabled = true;
        $("btnCikis").disabled = false;
        $("btnIzin").disabled = true; // içerideyken izin olmaz
        $("meHint").textContent = "Durum: İçeride. Çıkış için “ÇIKIŞ”.";
      } else {
        $("btnGiris").disabled = false;
        $("btnCikis").disabled = true;
        $("btnIzin").disabled = false;
        $("meHint").textContent = "Durum: Boşta. İzin / Giriş yapabilirsin.";
      }
    } catch (e) {
      toast("Durum alınamadı: " + e.message);
    }
  }

  async function doGiris() {
    if (!ME.id || !ME.key) { toast("Önce listeden kendi adını seç."); return; }
    try {
      setPill("warn", "Giriş kaydı…");
      const note = ($("inpNote").value || "").trim();
      const headers = { "x-personel-key": ME.key };
      const body = { personel_id: ME.id };
      if (note) body.personel_note = note;

      const res = await insertTable("kayitlar", body, headers);
      if (!res || !res[0]) throw new Error("Kayıt dönmedi.");

      $("inpNote").value = "";
      toast("Giriş alındı ✅");
      await refreshMyButtons();
      setPill("good", "Hazır");
    } catch (e) {
      setPill("bad", "Hata");
      toast("Giriş yapılamadı: " + e.message);
    }
  }

  async function doCikis() {
    if (!ME.id || !ME.key) { toast("Önce listeden kendi adını seç."); return; }
    try {
      setPill("warn", "Çıkış kaydı…");
      const headers = { "x-personel-key": ME.key };
      const open = await myOpenSession();
      if (!open) { toast("Açık giriş yok."); setPill("good", "Hazır"); await refreshMyButtons(); return; }

      const note = ($("inpNote").value || "").trim();
      const patch = { cikis_ts: new Date().toISOString() };
      if (note) patch.personel_note = note;

      const res = await patchTable("kayitlar", `id=eq.${open.id}`, patch, headers);
      if (!res || !res[0]) throw new Error("Güncelleme dönmedi.");

      $("inpNote").value = "";
      toast("Çıkış alındı ✅");
      await refreshMyButtons();
      setPill("good", "Hazır");
    } catch (e) {
      setPill("bad", "Hata");
      toast("Çıkış yapılamadı: " + e.message);
    }
  }

  async function doIzin() {
    if (!ME.id || !ME.key) { toast("Önce listeden kendi adını seç."); return; }
    try {
      const note = ($("inpNote").value || "").trim();
      if (!note) { toast("İzin için not yaz (örn: Bugün izin aldım)."); return; }

      setPill("warn", "İzin kaydı…");
      const headers = { "x-personel-key": ME.key };
      const res = await insertTable("kayitlar", { personel_id: ME.id, izin: true, personel_note: note }, headers);
      if (!res || !res[0]) throw new Error("Kayıt dönmedi.");

      $("inpNote").value = "";
      toast("İzin kaydedildi ✅");
      setPill("good", "Hazır");
    } catch (e) {
      setPill("bad", "Hata");
      toast("İzin kaydı olmadı: " + e.message);
    }
  }

  async function adminLogin() {
    const user = ($("admUser").value || "").trim();
    const mail = ($("admMail").value || "").trim();
    const pass = ($("admPass").value || "").trim();
    if (pass.length < 10) { toast("Token kısa görünüyor."); return; }

    try {
      setPill("warn", "Admin doğrulanıyor…");
      const headers = { "x-admin-token": pass };
      await selectTable("kayitlar", "id", "limit=1", headers);

      localStorage.setItem(LS.adminLogged, "1");
      localStorage.setItem(LS.adminTokenStore, pass);
      localStorage.setItem(LS.adminUser, user);
      localStorage.setItem(LS.adminMail, mail);

      ADMIN.logged = true; ADMIN.token = pass; ADMIN.user = user; ADMIN.mail = mail;

      toast("Admin giriş ✅");
      setPill("good", "Hazır");
      setAdminUI();
      await refreshAdminList();
    } catch (e) {
      setPill("bad", "Hata");
      toast("Admin giriş olmadı: " + e.message);
    }
  }

  function modalShow(bgId, show) {
    const el = $(bgId);
    el.style.display = show ? "flex" : "none";
    el.setAttribute("aria-hidden", show ? "false" : "true");
  }

  function filterText(s) { return (s || "").toLowerCase(); }

  function rangeSince(rangeVal) {
    if (rangeVal === "all") return null;
    const days = parseInt(rangeVal, 10);
    if (days === 0) {
      const d = new Date();
      d.setHours(0,0,0,0);
      return d.toISOString();
    }
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return since.toISOString();
  }

  async function fetchPersonelListAdmin() {
    const headers = { "x-admin-token": ADMIN.token };
    return (await selectTable("personel", "id,ad,created_at", "order=created_at.desc", headers)) || [];
  }

  async function fetchKayitlarAdmin({ personelId = null, rangeVal = "3" } = {}) {
    const headers = { "x-admin-token": ADMIN.token };
    let filter = "order=giris_ts.desc&limit=500";
    const since = rangeSince(rangeVal);
    if (since) filter = `giris_ts=gte.${encodeURIComponent(since)}&` + filter;
    if (personelId) filter = `personel_id=eq.${personelId}&` + filter;

    // select fields including notes/izin flags (columns added in SQL step below)
    return (await selectTable(
      "kayitlar",
      "id,personel_id,giris_ts,cikis_ts,edited,edited_at,edit_note,personel_note,izin",
      filter,
      headers
    )) || [];
  }

  function buildAdminPersonelItem(p) {
    const div = document.createElement("div");
    div.className = "item";
    div.style.cursor = "pointer";

    const left = document.createElement("div");
    left.className = "itemLeft";
    const b = document.createElement("b");
    b.textContent = p.ad;
    const t = document.createElement("span");
    t.className = "tag unk";
    t.innerHTML = `<span class="dot"></span><span>Detay için tıkla</span>`;
    left.appendChild(b); left.appendChild(t);

    const actions = document.createElement("div");
    actions.className = "actions";
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Detay";
    btn.onclick = (ev) => { ev.stopPropagation(); openDetail(p.id, p.ad); };
    actions.appendChild(btn);

    div.appendChild(left); div.appendChild(actions);
    div.addEventListener("click", () => openDetail(p.id, p.ad));
    return div;
  }

  function renderAdminList(personelList) {
    const list = $("adminList");
    list.innerHTML = "";
    if (!personelList.length) {
      list.innerHTML = `<div class="hint">Henüz personel yok.</div>`;
      return;
    }
    personelList.forEach(p => list.appendChild(buildAdminPersonelItem(p)));
  }

  async function refreshAdminList() {
    if (!(ADMIN.logged && ADMIN.token)) return;
    try {
      setPill("warn", "Admin yükleniyor…");
      const plist = await fetchPersonelListAdmin();
      renderAdminList(plist);
      setPill("good", "Hazır");
    } catch (e) {
      setPill("bad", "Hata");
      toast("Admin liste alınamadı: " + e.message);
    }
  }

  function renderDetailRows(rows) {
    const q = filterText($("detailSearch").value);
    const list = $("detailList");
    list.innerHTML = "";

    const filtered = rows.filter(r => {
      const note = filterText(r.personel_note || "");
      const isIzin = r.izin === true;
      const key = `${note} ${isIzin ? "izin" : ""} ${prettyDT(r.giris_ts)} ${prettyDT(r.cikis_ts)}`.toLowerCase();
      return !q || key.includes(q);
    });

    if (!filtered.length) {
      list.innerHTML = `<div class="hint">Kayıt yok.</div>`;
      return;
    }

    filtered.forEach(r => {
      const it = document.createElement("div");
      it.className = "item";

      const left = document.createElement("div");
      left.className = "itemLeft";
      const b = document.createElement("b");
      const title = r.izin ? `İZİN • ${prettyDT(r.giris_ts)}` : `${prettyDT(r.giris_ts)} → ${prettyDT(r.cikis_ts)}`;
      b.textContent = title;

      const tag = document.createElement("span");
      tag.className = "tag " + (r.izin ? "good" : (r.cikis_ts ? "good" : "bad"));
      tag.innerHTML = `<span class="dot"></span><span>${r.izin ? "İzin" : (r.cikis_ts ? "Kapalı" : "Açık (İçeride)")}</span>`;

      left.appendChild(b);
      left.appendChild(tag);

      const note = document.createElement("div");
      note.className = "hint";
      note.style.margin = "6px 0 0";
      note.textContent = (r.personel_note || "").trim() ? `Not: ${r.personel_note}` : "Not: -";
      left.appendChild(note);

      const actions = document.createElement("div");
      actions.className = "actions";
      const btn = document.createElement("button");
      btn.className = "btn btn-warn";
      btn.textContent = "DÜZELT";
      btn.onclick = () => openEdit(r);
      actions.appendChild(btn);

      it.appendChild(left);
      it.appendChild(actions);
      list.appendChild(it);
    });
  }

  async function openDetail(personelId, personelAd) {
    if (!(ADMIN.logged && ADMIN.token)) return;
    DETAIL.personelId = personelId;
    DETAIL.personelAd = personelAd;
    $("detailTitle").textContent = `📌 ${personelAd} • Detay`;

    $("detailSearch").value = "";
    $("detailRange").value = "3";

    modalShow("detailBg", true);

    await refreshDetail();
  }

  async function refreshDetail() {
    if (!(ADMIN.logged && ADMIN.token) || !DETAIL.personelId) return;
    try {
      setPill("warn", "Detay yükleniyor…");
      const rangeVal = $("detailRange").value;
      const rows = await fetchKayitlarAdmin({ personelId: DETAIL.personelId, rangeVal });
      DETAIL.rows = rows || [];
      renderDetailRows(DETAIL.rows);
      setPill("good", "Hazır");
    } catch (e) {
      setPill("bad", "Hata");
      toast("Detay alınamadı: " + e.message);
    }
  }

  function openEdit(row) {
    EDIT_CTX.kayitId = row.id;
    EDIT_CTX.personelId = DETAIL.personelId;
    EDIT_CTX.personelAd = DETAIL.personelAd;
    EDIT_CTX.afterSave = async () => { await refreshDetail(); };

    $("editInfo").textContent = `${DETAIL.personelAd} • Kayıt: ${row.id}`;
    $("editGiris").value = prettyDT(row.giris_ts);
    $("editCikis").value = row.cikis_ts ? prettyDT(row.cikis_ts) : "";
    $("editNote").value = (row.personel_note || "").trim();

    modalShow("editBg", true);
  }

  async function saveEdit() {
    if (!(ADMIN.logged && ADMIN.token) || !EDIT_CTX.kayitId) return;
    try {
      const g = toIsoFromInput($("editGiris").value);
      const c = toIsoFromInput($("editCikis").value);
      const note = ($("editNote").value || "").trim();

      if (!g) { toast("Giriş formatı yanlış. Örn: 2026-02-10 08:10"); return; }
      if (c && new Date(c).getTime() < new Date(g).getTime()) { toast("Çıkış, girişten önce olamaz."); return; }

      setPill("warn", "Düzeltme kaydı…");
      const headers = { "x-admin-token": ADMIN.token };
      const patch = {
        giris_ts: g,
        cikis_ts: c,
        edited: true,
        edited_at: new Date().toISOString(),
        edit_note: "admin düzeltme",
        personel_note: note || null
      };

      const res = await patchTable("kayitlar", `id=eq.${EDIT_CTX.kayitId}`, patch, headers);
      if (!res || !res[0]) throw new Error("Güncelleme dönmedi.");

      toast("Düzeltildi ✅");
      setPill("good", "Hazır");
      modalShow("editBg", false);
      if (typeof EDIT_CTX.afterSave === "function") await EDIT_CTX.afterSave();
    } catch (e) {
      setPill("bad", "Hata");
      toast("Düzeltme olmadı: " + e.message);
    }
  }

  function closeAllModals() {
    modalShow("editBg", false);
    modalShow("detailBg", false);
  }

  async function initDbColumnsHint() {
    // Ensure kayitlar has columns personel_note, izin (for new build).
    // We cannot alter DB from client; this is just UI guidance if missing.
    // If columns not exist, inserts will fail with message; user can run SQL patch in Supabase.
  }

  function bindUI() {
    $("btnAddSelf").onclick = addSelf;
    $("btnRefreshPublic").onclick = async () => { await refreshPublicList(); await refreshMyButtons(); };
    $("btnGiris").onclick = doGiris;
    $("btnCikis").onclick = doCikis;
    $("btnIzin").onclick = doIzin;

    $("btnAdminLogin").onclick = adminLogin;
    $("btnAdminRefresh").onclick = refreshAdminList;

    $("btnDetailClose").onclick = closeAllModals;
    $("detailBg").onclick = (ev) => { if (ev.target === $("detailBg")) modalShow("detailBg", false); };
    $("editBg").onclick = (ev) => { if (ev.target === $("editBg")) modalShow("editBg", false); };

    $("detailSearch").addEventListener("input", () => renderDetailRows(DETAIL.rows));
    $("detailRange").addEventListener("change", refreshDetail);

    $("admSearch").addEventListener("input", async () => {
      const q = filterText($("admSearch").value);
      const plist = await fetchPersonelListAdmin();
      const filtered = plist.filter(p => filterText(p.ad).includes(q));
      renderAdminList(filtered);
    });

    $("admRange").addEventListener("change", async () => {
      // This range is for global search later (keep simple: just refresh list).
      await refreshAdminList();
    });

    $("btnEditCancel").onclick = () => modalShow("editBg", false);
    $("btnEditSave").onclick = saveEdit;
  }

  async function boot() {
    loadLocal();
    setAdminUI();

    // If admin is "logged" but token missing, reset
    if (ADMIN.logged && !ADMIN.token) {
      localStorage.removeItem(LS.adminLogged);
      ADMIN.logged = false;
      setAdminUI();
    }

    await refreshPublicList();
    await refreshMyButtons();
    if (ADMIN.logged && ADMIN.token) await refreshAdminList();

    setPill("good", "Hazır");
  }

  // Expose minimal config check
  if (!SUPABASE_URL || !ANON_KEY) {
    alert("Config eksik: Supabase URL veya anon key yok.");
    return;
  }

  bindUI();
  boot();
})();
