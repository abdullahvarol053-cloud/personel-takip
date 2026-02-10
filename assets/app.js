
(() => {
  const cfg = window.APP_CFG || {};
  const SUPABASE_URL = cfg.SUPABASE_URL;
  const ANON_KEY = cfg.ANON_KEY;

  const $ = (id) => document.getElementById(id);

  const LS = {
    meId: "pt_me_id",
    meKey: "pt_me_key",
    adminLogged: "pt_admin_logged",
    adminTokenStore: "pt_admin_token_store",
    adminUser: "pt_admin_user",
    adminMail: "pt_admin_mail",
    localRecords: "pt_local_records_v2",
    draft: "pt_draft_v2",
  };

  let PUBLIC_PERSONEL = [];
  let ME = { id: null, key: null, ad: null };
  let ADMIN = { logged: false, token: null, user: "", mail: "" };

  let DRAFT = null; // {id,personel_id,personel_ad,kind,note,created_at_iso,status,extra}
  // kind: "not" | "giris" | "cikis" | "izin"

  let DETAIL = { personelId: null, personelAd: null, rows: [] };
  let EDIT_CTX = { kayitId: null };

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(toast._tm);
    toast._tm = setTimeout(() => (t.style.display = "none"), 2600);
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

  function toIsoFromDateOnly(dateStr, endOfDay=false) {
    if (!dateStr) return null;
    const d = new Date(dateStr + (endOfDay ? "T23:59:59" : "T00:00:00"));
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
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

  // ---------------- LOCAL RECORDS ----------------
  function loadLocalRecords() {
    try {
      return JSON.parse(localStorage.getItem(LS.localRecords) || "[]") || [];
    } catch { return []; }
  }

  function saveLocalRecords(arr) {
    localStorage.setItem(LS.localRecords, JSON.stringify(arr));
  }

  function pruneLocal3Days(arr) {
    const since = Date.now() - 3*24*60*60*1000;
    return arr.filter(r => {
      const t = new Date(r.created_at_iso || r.created_at || 0).getTime();
      return !isNaN(t) && t >= since;
    });
  }

  function setDraft(d) {
    DRAFT = d;
    if (d) localStorage.setItem(LS.draft, JSON.stringify(d));
    else localStorage.removeItem(LS.draft);
    renderDraftHint();
  }

  function loadDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(LS.draft) || "null");
      DRAFT = d;
    } catch { DRAFT = null; }
  }

  function renderDraftHint() {
    const hasMe = !!(ME.id && ME.key);
    const btnSend = $("btnSend");
    if (!hasMe) {
      $("draftHint").textContent = "Önce personel seç.";
      btnSend.disabled = true;
      return;
    }
    if (!DRAFT || DRAFT.personel_id !== ME.id) {
      $("draftHint").textContent = "Not yaz → (İzin/Giriş/Çıkış/Not) seç → Kaydı Gönder.";
      btnSend.disabled = true;
      return;
    }
    const s = DRAFT.status === "sent" ? "Gönderildi ✅" : "Gönderilmedi 🟡";
    $("draftHint").textContent = `${s} • ${DRAFT.kind.toUpperCase()} • ${prettyDT(DRAFT.created_at_iso)}`;
    btnSend.disabled = (DRAFT.status === "sent");
  }

  function renderLocalList() {
    const list = $("localList");
    const all = pruneLocal3Days(loadLocalRecords());
    saveLocalRecords(all); // prune persist
    list.innerHTML = "";
    const mine = ME.id ? all.filter(r => r.personel_id === ME.id) : [];
    if (!mine.length) {
      list.innerHTML = `<div class="hint">Son 3 gün içinde telefon kaydı yok.</div>`;
      return;
    }
    mine.sort((a,b) => (b.created_at_iso||"").localeCompare(a.created_at_iso||""));
    mine.forEach(r => {
      const it = document.createElement("div");
      it.className = "item";
      const left = document.createElement("div");
      left.className = "itemLeft";
      const b = document.createElement("b");
      b.textContent = `${prettyDT(r.created_at_iso)} • ${r.kind.toUpperCase()}`;
      const note = document.createElement("div");
      note.className = "hint";
      note.style.margin = "6px 0 0";
      note.textContent = `Not: ${r.note || "-"}`;
      left.appendChild(b); left.appendChild(note);

      const tag = document.createElement("span");
      tag.className = "tag " + (r.status === "sent" ? "good" : "warn");
      tag.innerHTML = `<span class="dot"></span><span>${r.status === "sent" ? "Gönderildi" : "Bekliyor"}</span>`;

      it.appendChild(left);
      it.appendChild(tag);
      list.appendChild(it);
    });
  }

  // ---------------- LOGIN / STATE ----------------
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

    const enabled = ADMIN.logged && ADMIN.token;
    $("adminGate").style.display = enabled ? "none" : "block";
    $("adminPanel").style.display = enabled ? "block" : "none";

    $("btnAdminRefresh").disabled = !enabled;
    $("btnExportExcel").disabled = !enabled;
    $("btnBackup").disabled = !enabled;
    $("lblRestore").style.display = enabled ? "inline-flex" : "none";
  }

  function enablePersonButtons(on) {
    $("btnSetIzin").disabled = !on;
    $("btnSetGiris").disabled = !on;
    $("btnSetCikis").disabled = !on;
    $("btnSetNot").disabled = !on;
  }

  function renderMeBadge() {
    if (ME.id) {
      const p = PUBLIC_PERSONEL.find(x => x.id === ME.id);
      ME.ad = p ? p.ad : ME.ad;
      $("meBadge").textContent = ME.ad || "Seçildi";
      enablePersonButtons(true);
    } else {
      $("meBadge").textContent = "Seçilmedi";
      enablePersonButtons(false);
    }
    renderDraftHint();
    renderLocalList();
  }

  // ---------------- PUBLIC LIST ----------------
  function itemElPersonel(p) {
    const div = document.createElement("div");
    div.className = "item";

    const left = document.createElement("div");
    left.className = "itemLeft";
    const b = document.createElement("b");
    b.textContent = p.ad;

    const tag = document.createElement("span");
    tag.className = "tag " + (ME.id === p.id ? "good" : "unk");
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
      renderMeBadge(); // IMPORTANT: this opens buttons
      await refreshPublicList(); // refresh visuals
    };
    actions.appendChild(btn);

    div.appendChild(left);
    div.appendChild(actions);
    return div;
  }

  async function refreshPublicList() {
    try {
      setPill("warn", "Yükleniyor…");
      const data = await selectTable("personel", "id,ad,created_at", "order=created_at.desc");
      PUBLIC_PERSONEL = data || [];

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
        PUBLIC_PERSONEL.forEach(p => list.appendChild(itemElPersonel(p)));
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
      renderMeBadge();
      setPill("good", "Hazır");
    } catch (e) {
      setPill("bad", "Hata");
      toast("Eklenemedi: " + e.message + " (Daha önce eklendiysen listeden adını seç.)");
    }
  }

  // ---------------- PERSONEL DRAFT + SEND ----------------
  function ensureMeSelected() {
    if (!ME.id || !ME.key) { toast("Önce listeden kendi adını seç."); return false; }
    return true;
  }

  function addLocalRecord(rec) {
    const all = loadLocalRecords();
    all.push(rec);
    saveLocalRecords(pruneLocal3Days(all));
    renderLocalList();
  }

  function makeDraft(kind) {
    if (!ensureMeSelected()) return;
    const note = ($("inpNote").value || "").trim();
    if (!note) { toast("Not yaz (yağ/mazot/parça/bakım/izin…)."); return; }

    const d = {
      local_id: randHex(16),
      personel_id: ME.id,
      personel_ad: ME.ad || "",
      kind,
      note,
      created_at_iso: new Date().toISOString(),
      status: "pending"
    };
    setDraft(d);
    addLocalRecord(d);
    toast(kind === "izin" ? "İzin taslağı hazır 🟡" : "Taslak hazır 🟡");
  }

  async function myOpenSession() {
    if (!ME.id || !ME.key) return null;
    const headers = { "x-personel-key": ME.key };
    const open = await selectTable(
      "kayitlar",
      "id,personel_id,giris_ts,cikis_ts,personel_note,izin",
      `personel_id=eq.${ME.id}&cikis_ts=is.null&izin=eq.false&order=giris_ts.desc&limit=1`,
      headers
    );
    return (open && open[0]) ? open[0] : null;
  }

  async function sendDraft() {
    if (!ensureMeSelected()) return;
    if (!DRAFT || DRAFT.personel_id !== ME.id) { toast("Önce taslak oluştur (Not / Giriş / Çıkış / İzin)."); return; }
    if (DRAFT.status === "sent") { toast("Zaten gönderildi."); return; }

    try {
      setPill("warn", "Gönderiliyor…");
      const headers = { "x-personel-key": ME.key };

      const note = (DRAFT.note || "").trim();
      const tagNote = (DRAFT.kind === "not") ? ("İŞ: " + note) : note;

      if (DRAFT.kind === "izin") {
        await insertTable("kayitlar", { personel_id: ME.id, izin: true, personel_note: tagNote }, headers);
      } else if (DRAFT.kind === "giris") {
        await insertTable("kayitlar", { personel_id: ME.id, izin: false, personel_note: tagNote }, headers);
      } else if (DRAFT.kind === "cikis") {
        const open = await myOpenSession();
        if (!open) throw new Error("Açık giriş yok. Önce GİRİŞ taslağı oluşturup gönder.");
        await patchTable("kayitlar", `id=eq.${open.id}`, { cikis_ts: new Date().toISOString(), personel_note: tagNote }, headers);
      } else if (DRAFT.kind === "not") {
        // Note-only: store as a normal row, not izin, no cikis; admin will see as open but that's OK; tag "İŞ:"
        await insertTable("kayitlar", { personel_id: ME.id, izin: false, personel_note: tagNote }, headers);
      } else {
        throw new Error("Bilinmeyen taslak türü.");
      }

      // mark local as sent
      const all = loadLocalRecords();
      for (const r of all) {
        if (r.local_id === DRAFT.local_id) { r.status = "sent"; r.sent_at_iso = new Date().toISOString(); }
      }
      saveLocalRecords(pruneLocal3Days(all));

      DRAFT.status = "sent";
      setDraft(DRAFT);
      $("inpNote").value = "";
      toast("Gönderildi ✅");
      setPill("good", "Hazır");
      renderLocalList();
    } catch (e) {
      setPill("bad", "Hata");
      toast("Gönderilemedi: " + e.message);
    }
  }

  // ---------------- ADMIN ----------------
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

      await refreshAdminAll();
    } catch (e) {
      setPill("bad", "Hata");
      toast("Admin giriş olmadı: " + e.message);
    }
  }

  function filterText(s) { return (s || "").toLowerCase(); }

  function buildRecordLabel(r) {
    const note = (r.personel_note || "").trim();
    if (r.izin) return { t: "İZİN", cls: "warn" };
    if (note.startsWith("İŞ:")) return { t: "İŞ", cls: "good" };
    if (r.cikis_ts) return { t: "ÇIKIŞ", cls: "good" };
    // Open session or "GİRİŞ" record
    return { t: "GİRİŞ/İŞ", cls: "bad" };
  }

  async function fetchPersonelListAdmin() {
    const headers = { "x-admin-token": ADMIN.token };
    return (await selectTable("personel", "id,ad,created_at", "order=created_at.desc", headers)) || [];
  }

  function buildDateFilter() {
    const quick = $("admQuick").value;
    const start = $("admStart").value;
    const end = $("admEnd").value;

    let sinceIso = null;
    let untilIso = null;

    if (start) sinceIso = toIsoFromDateOnly(start, false);
    if (end) untilIso = toIsoFromDateOnly(end, true);

    if (!sinceIso && !untilIso) {
      if (quick !== "all") {
        const days = parseInt(quick, 10);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        sinceIso = since.toISOString();
      }
    }
    return { sinceIso, untilIso };
  }

  async function fetchKayitlarAdmin({ personelId = null } = {}) {
    const headers = { "x-admin-token": ADMIN.token };
    const { sinceIso, untilIso } = buildDateFilter();

    let filter = "order=giris_ts.desc&limit=800";
    if (personelId) filter = `personel_id=eq.${personelId}&` + filter;
    if (sinceIso) filter = `giris_ts=gte.${encodeURIComponent(sinceIso)}&` + filter;
    if (untilIso) filter = `giris_ts=lte.${encodeURIComponent(untilIso)}&` + filter;

    return (await selectTable(
      "kayitlar",
      "id,personel_id,giris_ts,cikis_ts,edited,edited_at,edit_note,personel_note,izin",
      filter,
      headers
    )) || [];
  }

  function renderAdminPersons(plist) {
    const list = $("adminPersonList");
    list.innerHTML = "";
    if (!plist.length) {
      list.innerHTML = `<div class="hint">Henüz personel yok.</div>`;
      return;
    }
    plist.forEach(p => {
      const it = document.createElement("div");
      it.className = "item";
      it.style.cursor = "pointer";

      const left = document.createElement("div");
      left.className = "itemLeft";
      const b = document.createElement("b");
      b.textContent = p.ad;
      const tag = document.createElement("span");
      tag.className = "tag unk";
      tag.innerHTML = `<span class="dot"></span><span>Tüm hareketler</span>`;
      left.appendChild(b); left.appendChild(tag);

      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "Detay";
      btn.onclick = (ev) => { ev.stopPropagation(); openDetail(p.id, p.ad); };

      it.appendChild(left);
      it.appendChild(btn);
      it.addEventListener("click", () => openDetail(p.id, p.ad));
      list.appendChild(it);
    });
  }

  function renderAdminRecords(rows, plist) {
    const q = filterText($("admSearch").value);
    const list = $("adminRecordList");
    list.innerHTML = "";

    const pid2name = new Map(plist.map(p => [p.id, p.ad]));
    const filtered = rows.filter(r => {
      const name = filterText(pid2name.get(r.personel_id) || "");
      const note = filterText(r.personel_note || "");
      const lbl = buildRecordLabel(r).t.toLowerCase();
      const key = `${name} ${note} ${lbl} ${prettyDT(r.giris_ts)} ${prettyDT(r.cikis_ts)}`.toLowerCase();
      return !q || key.includes(q);
    });

    $("admCount").textContent = String(filtered.length);

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
      const name = pid2name.get(r.personel_id) || r.personel_id;
      const lab = buildRecordLabel(r);
      b.textContent = `${name} • ${prettyDT(r.giris_ts)}`;
      const note = document.createElement("div");
      note.className = "hint";
      note.style.margin = "6px 0 0";
      note.textContent = `Tür: ${lab.t} • Not: ${(r.personel_note || "-")}`;

      left.appendChild(b);
      left.appendChild(note);

      const tag = document.createElement("span");
      tag.className = "tag " + (lab.cls || "unk");
      tag.innerHTML = `<span class="dot"></span><span>${lab.t}</span>`;

      it.appendChild(left);
      it.appendChild(tag);
      list.appendChild(it);
    });
  }

  async function refreshAdminAll() {
    if (!(ADMIN.logged && ADMIN.token)) return;
    try {
      setPill("warn", "Admin yükleniyor…");
      const plist = await fetchPersonelListAdmin();
      renderAdminPersons(plist);
      const rows = await fetchKayitlarAdmin({ personelId: null });
      renderAdminRecords(rows, plist);
      setPill("good", "Hazır");
    } catch (e) {
      setPill("bad", "Hata");
      toast("Admin yüklenemedi: " + e.message);
    }
  }

  // ---------------- DETAIL + EDIT ----------------
  function modalShow(bgId, show) {
    const el = $(bgId);
    el.style.display = show ? "flex" : "none";
    el.setAttribute("aria-hidden", show ? "false" : "true");
  }

  async function openDetail(personelId, personelAd) {
    if (!(ADMIN.logged && ADMIN.token)) return;
    DETAIL.personelId = personelId;
    DETAIL.personelAd = personelAd;
    $("detailTitle").textContent = `📌 ${personelAd} • Tüm Hareketler`;
    $("detailSearch").value = "";
    $("detailQuick").value = "all";
    modalShow("detailBg", true);
    await refreshDetail();
  }

  async function refreshDetail() {
    if (!(ADMIN.logged && ADMIN.token) || !DETAIL.personelId) return;
    try {
      setPill("warn", "Detay…");
      const headers = { "x-admin-token": ADMIN.token };

      // detailQuick overrides global filter
      const quick = $("detailQuick").value;
      let filter = `personel_id=eq.${DETAIL.personelId}&order=giris_ts.desc&limit=1200`;
      if (quick !== "all") {
        const days = parseInt(quick, 10);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        filter = `personel_id=eq.${DETAIL.personelId}&giris_ts=gte.${encodeURIComponent(since)}&order=giris_ts.desc&limit=1200`;
      }
      const rows = await selectTable("kayitlar",
        "id,personel_id,giris_ts,cikis_ts,edited,edited_at,edit_note,personel_note,izin",
        filter,
        headers
      );
      DETAIL.rows = rows || [];
      renderDetailRows();
      setPill("good", "Hazır");
    } catch (e) {
      setPill("bad", "Hata");
      toast("Detay alınamadı: " + e.message);
    }
  }

  function renderDetailRows() {
    const q = filterText($("detailSearch").value);
    const list = $("detailList");
    list.innerHTML = "";
    const rows = DETAIL.rows || [];
    const filtered = rows.filter(r => {
      const note = filterText(r.personel_note || "");
      const lbl = buildRecordLabel(r).t.toLowerCase();
      const key = `${note} ${lbl} ${prettyDT(r.giris_ts)} ${prettyDT(r.cikis_ts)}`.toLowerCase();
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
      const lab = buildRecordLabel(r);
      const b = document.createElement("b");
      b.textContent = `${prettyDT(r.giris_ts)} • ${lab.t}`;
      const note = document.createElement("div");
      note.className = "hint";
      note.style.margin = "6px 0 0";
      note.textContent = `Not: ${(r.personel_note || "-")}`;
      left.appendChild(b); left.appendChild(note);

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

  function openEdit(row) {
    EDIT_CTX.kayitId = row.id;
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

      setPill("warn", "Düzeltme…");
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
      await refreshDetail();
      await refreshAdminAll(); // reflect if in list
    } catch (e) {
      setPill("bad", "Hata");
      toast("Düzeltme olmadı: " + e.message);
    }
  }

  // ---------------- EXPORT (Excel .xls) ----------------
  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  }

  function exportExcelFromCurrentList() {
    // Build from DOM list (adminRecordList)
    const items = $("adminRecordList").querySelectorAll(".item");
    const rows = [];
    items.forEach(it => {
      const b = it.querySelector(".itemLeft b")?.textContent || "";
      const hint = it.querySelector(".itemLeft .hint")?.textContent || "";
      // b: "Name • YYYY-MM-DD HH:MM"
      // hint: "Tür: ... • Not: ..."
      const name = (b.split("•")[0] || "").trim();
      const dt = (b.split("•")[1] || "").trim();
      const m = hint.match(/Tür:\s*([^•]+)•\s*Not:\s*(.*)$/);
      const tur = m ? m[1].trim() : "";
      const note = m ? m[2].trim() : "";
      rows.push({ Personel: name, TarihSaat: dt, Tür: tur, Not: note });
    });

    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const filename = `personel_kayitlari_${stamp}.xls`;

    // Excel-compatible HTML table (Turkish-safe)
    const esc = (s) => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const tableRows = rows.map(r => `<tr><td>${esc(r.Personel)}</td><td>${esc(r.TarihSaat)}</td><td>${esc(r.Tür)}</td><td>${esc(r.Not)}</td></tr>`).join("");
    const html = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body>
<table border="1">
<tr><th>Personel</th><th>Tarih Saat</th><th>Tür</th><th>Not</th></tr>
${tableRows}
</table>
</body></html>`;
    downloadText(filename, html, "application/vnd.ms-excel;charset=utf-8");
    toast("Excel indirildi ✅");
  }

  // ---------------- BACKUP / RESTORE ----------------
  async function doBackup() {
    if (!(ADMIN.logged && ADMIN.token)) return;
    try {
      setPill("warn", "Yedek…");
      const headers = { "x-admin-token": ADMIN.token };
      const personel = await selectTable("personel", "id,ad,created_at", "order=created_at.desc", headers);
      const kayitlar = await selectTable("kayitlar", "id,personel_id,giris_ts,cikis_ts,edited,edited_at,edit_note,personel_note,izin", "order=giris_ts.desc&limit=50000", headers);

      const data = {
        meta: { app: "personel_takip_final", created_at: new Date().toISOString() },
        personel: personel || [],
        kayitlar: kayitlar || []
      };

      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      downloadText(`personel_yedek_${stamp}.json`, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
      setPill("good", "Hazır");
      toast("Yedek indirildi ✅");
    } catch (e) {
      setPill("bad", "Hata");
      toast("Yedek alınamadı: " + e.message);
    }
  }

  async function doRestore(file) {
    if (!(ADMIN.logged && ADMIN.token)) return;
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const personel = Array.isArray(data.personel) ? data.personel : [];
      const kayitlar = Array.isArray(data.kayitlar) ? data.kayitlar : [];

      if (!confirm("Yedekten AL: Mevcut veriler silinmez, sadece EKLENİR. Devam?")) return;

      setPill("warn", "Yedekten alınıyor…");
      const headers = { "x-admin-token": ADMIN.token };

      // fetch existing ids to dedupe
      const existingP = await selectTable("personel", "id", "limit=50000", headers);
      const existingK = await selectTable("kayitlar", "id", "limit=50000", headers);
      const setP = new Set((existingP||[]).map(x => x.id));
      const setK = new Set((existingK||[]).map(x => x.id));

      // insert missing personel (id forced). Requires DB to allow id insert; if not, we skip and map by name.
      // Safer: insert by name only if missing by name.
      const existingNames = new Set((await selectTable("personel","ad","limit=50000",headers) || []).map(x => (x.ad||"").trim().toLowerCase()));
      for (const p of personel) {
        const name = (p.ad||"").trim();
        if (!name) continue;
        const keyName = name.toLowerCase();
        if (!existingNames.has(keyName)) {
          try {
            await insertTable("personel", { ad: name, personel_key: randHex(32) }, headers);
            existingNames.add(keyName);
          } catch {}
        }
      }

      // refresh personel map
      const plist = await selectTable("personel", "id,ad", "limit=50000", headers);
      const name2id = new Map((plist||[]).map(p => [(p.ad||"").trim().toLowerCase(), p.id]));

      // insert missing records (cannot force id; insert without id)
      for (const r of kayitlar) {
        if (!r) continue;
        const pid = r.personel_id;
        // if pid doesn't exist, try map by name from embedded personel list
        let finalPid = pid;
        // can't reliably map; if pid unknown, skip
        if (!plist.some(p => p.id === finalPid)) continue;

        // dedupe by (personel_id + giris_ts + note + izin) as heuristic
        const giris = r.giris_ts;
        if (!giris) continue;

        // quick check: skip if exact id already exists
        if (r.id && setK.has(r.id)) continue;

        try {
          await insertTable("kayitlar", {
            personel_id: finalPid,
            giris_ts: r.giris_ts,
            cikis_ts: r.cikis_ts,
            izin: !!r.izin,
            personel_note: r.personel_note || null,
            edited: !!r.edited,
            edited_at: r.edited_at || null,
            edit_note: r.edit_note || null
          }, headers);
        } catch {}
      }

      setPill("good", "Hazır");
      toast("Yedekten alındı ✅");
      await refreshAdminAll();
    } catch (e) {
      setPill("bad", "Hata");
      toast("Yedekten alma olmadı: " + e.message);
    } finally {
      $("inpRestore").value = "";
    }
  }

  // ---------------- UI BIND ----------------
  function bindUI() {
    $("btnAddSelf").onclick = addSelf;
    $("btnRefreshPublic").onclick = refreshPublicList;

    $("btnSetIzin").onclick = () => makeDraft("izin");
    $("btnSetGiris").onclick = () => makeDraft("giris");
    $("btnSetCikis").onclick = () => makeDraft("cikis");
    $("btnSetNot").onclick  = () => makeDraft("not");
    $("btnSend").onclick = sendDraft;

    $("btnAdminLogin").onclick = adminLogin;
    $("btnAdminRefresh").onclick = refreshAdminAll;

    $("btnApplyFilter").onclick = refreshAdminAll;
    $("btnClearFilter").onclick = () => {
      $("admSearch").value = "";
      $("admQuick").value = "7";
      $("admStart").value = "";
      $("admEnd").value = "";
      refreshAdminAll();
    };

    $("admSearch").addEventListener("input", () => refreshAdminAll());
    $("admQuick").addEventListener("change", () => refreshAdminAll());
    $("admStart").addEventListener("change", () => refreshAdminAll());
    $("admEnd").addEventListener("change", () => refreshAdminAll());

    $("btnExportExcel").onclick = exportExcelFromCurrentList;

    $("btnBackup").onclick = doBackup;
    $("inpRestore").addEventListener("change", (ev) => doRestore(ev.target.files && ev.target.files[0]));

    $("btnDetailClose").onclick = () => modalShow("detailBg", false);
    $("detailBg").onclick = (ev) => { if (ev.target === $("detailBg")) modalShow("detailBg", false); };
    $("editBg").onclick = (ev) => { if (ev.target === $("editBg")) modalShow("editBg", false); };

    $("detailSearch").addEventListener("input", renderDetailRows);
    $("detailQuick").addEventListener("change", refreshDetail);

    $("btnEditCancel").onclick = () => modalShow("editBg", false);
    $("btnEditSave").onclick = saveEdit;
  }

  async function boot() {
    if (!SUPABASE_URL || !ANON_KEY) {
      alert("Config eksik: Supabase URL veya anon key yok.");
      return;
    }

    loadLocal();
    loadDraft();
    setAdminUI();

    // Ensure meKey exists for personel ops
    if (!ME.key) {
      const k = localStorage.getItem(LS.meKey);
      if (k) ME.key = k;
    }

    await refreshPublicList();
    renderDraftHint();
    renderLocalList();

    if (ADMIN.logged && ADMIN.token) {
      await refreshAdminAll();
    }

    setPill("good", "Hazır");
  }

  bindUI();
  boot();
})();
