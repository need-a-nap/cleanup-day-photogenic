"use strict";

/* ─── 상수 ─────────────────────────────── */
const REACTIONS = [
  { key: "museum", emoji: "🏛️", label: "박물관으로" },
  { key: "dino",   emoji: "🦖", label: "이게 아직도?" },
  { key: "magic",  emoji: "🪄", label: "마법수준" },
  { key: "box",    emoji: "📦", label: "이사준비완" },
  { key: "shine",  emoji: "😎", label: "눈부셔요" },
  { key: "zero",   emoji: "🗑️", label: "무소유" },
];
const MAX_DIM = 1200;            // 압축 시 긴 변 최대 픽셀
const TARGET_BYTES = 300 * 1024; // 목표 용량

const $ = (id) => document.getElementById(id);
const wall = $("wall");

/* ─── Supabase 클라이언트 ───────────────── */
const configured = window.SUPABASE_URL && window.SUPABASE_ANON_KEY;
const sb = configured
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

function imageUrl(path) {
  return sb.storage.from("photos").getPublicUrl(path).data.publicUrl;
}

let posts = [];
let compressed = null; // { blob, dataUrl, width, height, bytes }
const myReactions = JSON.parse(localStorage.getItem("cleanup_reactions") || "{}");

/* ─── 비눗방울 배경 ─────────────────────── */
(function makeBubbles() {
  const layer = $("bubbles");
  const n = window.innerWidth < 768 ? 12 : 20;
  for (let i = 0; i < n; i++) {
    const b = document.createElement("div");
    b.className = "bubble";
    const size = 12 + Math.random() * 56;
    b.style.width = b.style.height = size + "px";
    b.style.left = Math.random() * 100 + "vw";
    b.style.setProperty("--drift", (Math.random() * 120 - 60) + "px");
    b.style.animationDuration = 9 + Math.random() * 14 + "s";
    b.style.animationDelay = -Math.random() * 20 + "s";
    layer.appendChild(b);
  }
})();

/* ─── 유틸 ─────────────────────────────── */
function toast(msg, ms = 2400) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.hidden = true), ms);
}

function fmtDate(iso) {
  const ts = Date.parse(iso);
  const d = new Date(ts);
  const diff = Date.now() - ts;
  if (diff < 60e3) return "방금 전";
  if (diff < 3600e3) return Math.floor(diff / 60e3) + "분 전";
  if (diff < 86400e3) return Math.floor(diff / 3600e3) + "시간 전";
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// 게시물 id 기반 고정 기울기 (-2.6 ~ 2.6도)
function tiltOf(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ((h % 53) / 10 - 2.6).toFixed(2);
}

/* ─── 렌더링 (메이슨리) ─────────────────── */
function colCount() {
  return window.innerWidth < 768 ? 1 : 3;
}

function makeCard(post) {
  const card = document.createElement("article");
  card.className = "polaroid";
  card.style.setProperty("--tilt", tiltOf(post.id) + "deg");
  card.style.setProperty("--tape-tilt", (tiltOf(post.id + "t") * 1.4) + "deg");

  const img = document.createElement("img");
  img.className = "polaroid-img";
  img.src = imageUrl(post.image_path);
  img.alt = post.memo || post.nickname + "님의 사진";
  img.loading = "lazy";
  if (post.width && post.height) {
    img.style.aspectRatio = `${post.width} / ${post.height}`;
  }
  img.addEventListener("click", () => {
    $("lightboxImg").src = img.src;
    $("lightbox").hidden = false;
  });
  card.appendChild(img);

  if (post.memo) {
    const memo = document.createElement("p");
    memo.className = "polaroid-memo";
    memo.textContent = post.memo;
    card.appendChild(memo);
  }

  const meta = document.createElement("div");
  meta.className = "polaroid-meta";
  const nick = document.createElement("span");
  nick.className = "polaroid-nick";
  nick.textContent = post.nickname;
  const date = document.createElement("span");
  date.className = "polaroid-date";
  date.textContent = fmtDate(post.created_at);
  meta.append(nick, date);
  card.appendChild(meta);

  const bar = document.createElement("div");
  bar.className = "reactions";
  const mine = myReactions[post.id] || {};
  for (const r of REACTIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reaction-btn" + (mine[r.key] ? " on" : "");
    const count = (post.reactions && post.reactions[r.key]) || 0;
    btn.innerHTML = `<span>${r.emoji}</span><span class="rlabel">${r.label}</span><span class="cnt">${count || ""}</span>`;
    btn.addEventListener("click", () => onReact(post, r.key, btn));
    bar.appendChild(btn);
  }
  card.appendChild(bar);
  return card;
}

function render() {
  wall.innerHTML = "";
  $("emptyState").hidden = posts.length > 0;

  const n = colCount();
  const cols = [];
  for (let i = 0; i < n; i++) {
    const col = document.createElement("div");
    col.className = "wall-col";
    wall.appendChild(col);
    cols.push(col);
  }
  // 가장 짧은 열에 순서대로 붙여 핀터레스트식 지그재그 채움
  for (const post of posts) {
    let target = cols[0];
    for (const c of cols) {
      if (c.offsetHeight < target.offsetHeight) target = c;
    }
    target.appendChild(makeCard(post));
  }
}

let lastCols = colCount();
window.addEventListener("resize", () => {
  clearTimeout(window._rz);
  window._rz = setTimeout(() => {
    if (colCount() !== lastCols) {
      lastCols = colCount();
      render();
    }
  }, 200);
});

/* ─── 데이터 ────────────────────────────── */
async function loadPosts(silent = false) {
  try {
    const { data, error } = await sb
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    posts = data;
    $("loading").hidden = true;
    render();
  } catch {
    $("loading").hidden = true;
    if (!silent) toast("목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요 🙏");
  }
}

async function onReact(post, key, btn) {
  const mine = myReactions[post.id] || (myReactions[post.id] = {});
  const turningOn = !mine[key];
  const delta = turningOn ? 1 : -1;

  // 낙관적 업데이트
  if (turningOn) mine[key] = true;
  else delete mine[key];
  localStorage.setItem("cleanup_reactions", JSON.stringify(myReactions));
  post.reactions = post.reactions || {};
  post.reactions[key] = Math.max(0, (post.reactions[key] || 0) + delta);
  btn.classList.toggle("on", turningOn);
  btn.classList.remove("bump");
  void btn.offsetWidth;
  btn.classList.add("bump");
  btn.querySelector(".cnt").textContent = post.reactions[key] || "";

  try {
    const { data, error } = await sb.rpc("increment_reaction", {
      post_id: post.id,
      reaction_key: key,
      delta,
    });
    if (!error && data) {
      post.reactions = data;
      btn.querySelector(".cnt").textContent = post.reactions[key] || "";
    }
  } catch { /* 오프라인이어도 낙관적 상태 유지 */ }
}

/* ─── 이미지 압축 ───────────────────────── */
function loadImageEl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지를 읽을 수 없어요")); };
    img.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function compressImage(file) {
  const img = await loadImageEl(file);
  let { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);

  let quality = 0.82;
  let blob = await canvasToBlob(canvas, quality);
  // 목표 용량 이하가 될 때까지 품질을 단계적으로 낮춤
  while (blob && blob.size > TARGET_BYTES && quality > 0.4) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, quality);
  }
  if (!blob) throw new Error("이미지 변환에 실패했어요");
  return {
    blob,
    dataUrl: canvas.toDataURL("image/jpeg", quality),
    width: w,
    height: h,
    bytes: blob.size,
  };
}

/* ─── 업로드 모달 ───────────────────────── */
const modal = $("uploadModal");

function openModal() {
  modal.hidden = false;
  $("nicknameInput").value = localStorage.getItem("cleanup_nickname") || "";
  document.body.style.overflow = "hidden";
}
function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = "";
}
function resetForm() {
  compressed = null;
  $("photoInput").value = "";
  $("photoPreview").hidden = true;
  $("photoPreview").src = "";
  $("photoPlaceholder").hidden = false;
  $("photoInfo").textContent = "";
  $("memoInput").value = "";
}

$("openUploadTop").addEventListener("click", openModal);
$("openUploadFab").addEventListener("click", openModal);
modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModal));

$("photoInput").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  $("photoInfo").textContent = "사진을 가볍게 만드는 중… 🫧";
  try {
    compressed = await compressImage(file);
    $("photoPreview").src = compressed.dataUrl;
    $("photoPreview").hidden = false;
    $("photoPlaceholder").hidden = true;
    const kb = Math.round(compressed.bytes / 1024);
    const origKb = Math.round(file.size / 1024);
    $("photoInfo").textContent = `${origKb.toLocaleString()}KB → ${kb.toLocaleString()}KB로 압축 완료 ✨`;
  } catch {
    compressed = null;
    $("photoInfo").textContent = "";
    toast("사진을 불러오지 못했어요. 다른 사진으로 시도해주세요.");
  }
});

$("submitBtn").addEventListener("click", async () => {
  const nickname = $("nicknameInput").value.trim().slice(0, 20);
  const memo = $("memoInput").value.trim().slice(0, 200);
  if (!compressed) return toast("사진을 먼저 선택해주세요 📸");
  if (!nickname) return toast("닉네임을 입력해주세요 ✏️");

  const btn = $("submitBtn");
  btn.disabled = true;
  btn.textContent = "벽에 붙이는 중… 🩹";
  try {
    const id = crypto.randomUUID();
    const path = `${id}.jpg`;

    const { error: upErr } = await sb.storage
      .from("photos")
      .upload(path, compressed.blob, { contentType: "image/jpeg" });
    if (upErr) throw new Error("사진 업로드에 실패했어요");

    const { data, error: insErr } = await sb
      .from("posts")
      .insert({
        id,
        nickname,
        memo,
        image_path: path,
        width: compressed.width,
        height: compressed.height,
      })
      .select()
      .single();
    if (insErr) throw new Error("게시물 저장에 실패했어요");

    localStorage.setItem("cleanup_nickname", nickname);
    posts.unshift(data);
    render();
    resetForm();
    closeModal();
    toast("폴라로이드가 벽에 붙었어요! 🎉");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    toast(err.message || "업로드에 실패했어요. 다시 시도해주세요 🙏");
  } finally {
    btn.disabled = false;
    btn.textContent = "벽에 붙이기 🩹";
  }
});

/* ─── 라이트박스 ────────────────────────── */
$("lightbox").addEventListener("click", () => {
  $("lightbox").hidden = true;
  $("lightboxImg").src = "";
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("lightbox").hidden = true;
    if (!modal.hidden) closeModal();
  }
});

/* ─── 시작 & 주기적 새로고침 ────────────── */
if (!configured) {
  $("loading").textContent = "⚙️ 설정이 필요해요 — config.js에 Supabase 주소와 키를 넣어주세요";
} else {
  loadPosts();
  setInterval(() => {
    if (document.visibilityState === "visible" && modal.hidden) loadPosts(true);
  }, 45000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadPosts(true);
  });
}
