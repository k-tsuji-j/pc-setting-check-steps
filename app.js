// ============================================================
// 設定：YouTube動画のURL（または動画ID）をここに貼り付けてください。
// 例）step1: "https://www.youtube.com/watch?v=XXXXXXXXXXX"  または  "XXXXXXXXXXX"
// 空のままなら「動画は準備中です」と表示されます。
// ============================================================
const VIDEOS = {
  step1: "https://www.youtube.com/watch?v=k7wr-aqHVOk&list=RDk7wr-aqHVOk&start_radio=1",
  step2: "https://www.youtube.com/watch?v=k7wr-aqHVOk&list=RDk7wr-aqHVOk&start_radio=1",
  step3: "https://www.youtube.com/watch?v=k7wr-aqHVOk&list=RDk7wr-aqHVOk&start_radio=1"
};

const STEPS = [
  { id: "step1", href: "step1.html", label: "ブラウザのタブ" },
  { id: "step2", href: "step2.html", label: "システムトレイのアプリ" },
  { id: "step3", href: "step3.html", label: "タスクビューの画面" }
];

const mem = {};
const store = {
  get(k) { try { return localStorage.getItem("pccheck:" + k) === "1"; } catch (e) { return mem[k] === true; } },
  set(k, v) { try { localStorage.setItem("pccheck:" + k, v ? "1" : "0"); } catch (e) { mem[k] = v; } }
};

function videoId(v) {
  if (!v) return "";
  const m = v.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
  if (m) return m[1];
  return /^[\w-]{11}$/.test(v) ? v : "";
}


// ---- YouTube：サムネイル → クリックで再生。失敗・無反応は理由つきでリンクに切り替える ----
let ytApi;
function loadYtApi() {
  if (ytApi) return ytApi;
  ytApi = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
    const sc = document.createElement("script");
    sc.src = "https://www.youtube.com/iframe_api";
    sc.onerror = () => reject(new Error("api-blocked"));
    document.head.appendChild(sc);
  });
  return ytApi;
}
function showFacade(el, id) {
  el.classList.add("facade");
  el.style.backgroundImage = `url(https://i.ytimg.com/vi/${id}/hqdefault.jpg)`;
  el.innerHTML = `<button type="button" class="facadebtn" aria-label="動画を再生"><span>▶</span></button>`;
  el.querySelector("button").addEventListener("click", () => startPlayer(el, id));
}
function failVideo(el, id, why) {
  el.classList.remove("facade"); el.classList.add("empty"); el.style.backgroundImage = "";
  el.innerHTML = `<div>動画を再生できませんでした（${why}）。<br><br>` +
    `<a class="btn primary" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">YouTubeで動画を見る</a></div>`;
}
const YT_ERR = { 2: "動画IDが不正", 5: "プレーヤーエラー", 100: "動画が見つからない/非公開", 101: "埋め込み禁止", 150: "埋め込み禁止", 153: "参照元(リファラ)なし" };
function startPlayer(el, id) {
  el.innerHTML = `<div class="loading">読み込み中…</div><div id="yt-${el.dataset.video}"></div>`;
  el.classList.add("playing");
  const timer = setTimeout(() => failVideo(el, id, "応答なし：社内ネットワークやブラウザ拡張でYouTubeが遮断されている可能性"), 10000);
  loadYtApi().then(() => {
    new YT.Player(`yt-${el.dataset.video}`, {
      videoId: id, width: "100%", height: "100%",
      playerVars: { rel: 0, playsinline: 1, autoplay: 1, origin: location.origin },
      events: {
        onReady: e => { clearTimeout(timer); const l = el.querySelector(".loading"); if (l) l.remove(); e.target.playVideo(); },
        onError: e => { clearTimeout(timer); failVideo(el, id, YT_ERR[e.data] || "エラーコード " + e.data); }
      }
    });
  }).catch(() => { clearTimeout(timer); failVideo(el, id, "YouTubeのスクリプトを読み込めません"); });
}

function renderStepper(current) {
  const ol = document.querySelector(".stepper");
  if (!ol) return;
  ol.innerHTML = STEPS.map((s, i) => {
    const done = store.get(s.id);
    const cls = done ? "done" : s.id === current ? "current" : "";
    const st = done ? "完了" : s.id === current ? "いま、ここ" : "未完了";
    return `<li class="${cls}"><a href="${s.href}"><span class="dot">${done ? "✓" : i + 1}</span>` +
      `<span><span class="lbl">STEP ${i + 1}　${s.label}</span><span class="st">${st}</span></span></a></li>`;
  }).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  const current = document.body.dataset.step || "";
  renderStepper(current);

  // 動画：<details> を開いた時にはじめて読み込む（ページ表示を YouTube で待たせない）
  document.querySelectorAll(".video[data-video]").forEach(el => {
    const id = videoId(VIDEOS[el.dataset.video]);
    const details = el.closest("details");
    const load = () => {
      if (el.dataset.loaded) return;
      el.dataset.loaded = "1";
      if (id && location.protocol === "file:") {
        // file:// だと Referer / origin が無く YouTube が エラー153 を返すため、リンクで案内する
        el.classList.add("empty");
        el.innerHTML = `<div><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" style="max-width:60%;border-radius:8px"><br>` +
          `<a class="btn primary" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">YouTubeで動画を見る</a></div>`;
      } else if (id) {
        showFacade(el, id);
        el.insertAdjacentHTML("afterend", `<p class="vlink"><a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">再生できない場合は、YouTubeで開く</a></p>`);
      } else {
        el.classList.add("empty");
        el.textContent = "動画は準備中です（app.js の VIDEOS にYouTubeのURLを設定すると表示されます）";
      }
    };
    if (details) details.addEventListener("toggle", () => { if (details.open) load(); });
    else load();
  });

  // 手順アニメーション（▶ で再生、終わったら「もう一度」）
  document.querySelectorAll("figure.anim").forEach(fig => {
    const stage = fig.querySelector(".stage");
    const btn = fig.querySelector(".playbtn");
    const dur = Number(fig.dataset.dur || 8) * 1000;
    let timer;
    btn.addEventListener("click", () => {
      clearTimeout(timer);
      stage.classList.remove("playing");
      void stage.offsetWidth; // アニメーションを最初からやり直す
      stage.classList.add("playing");
      timer = setTimeout(() => {
        btn.className = "playbtn replay";
        btn.innerHTML = "<span>↻</span> もう一度";
      }, dur + 200);
    });
  });

  // 完了ボタン
  const btn = document.getElementById("doneBtn");
  const next = document.getElementById("nextBtn");
  const badge = document.getElementById("badge");
  const idx = STEPS.findIndex(s => s.id === current);
  if (btn) {
    const sync = () => {
      const on = store.get(current);
      btn.classList.toggle("on", on);
      btn.textContent = on ? `✓ STEP ${idx + 1} 完了（取り消す）` : `STEP ${idx + 1} を完了にする`;
      if (badge) { badge.textContent = on ? "✓ 完了" : "未完了"; badge.classList.toggle("ok", on); }
      if (next) { next.setAttribute("aria-disabled", on ? "false" : "true"); next.classList.toggle("primary", on); }
      renderStepper(current);
    };
    btn.addEventListener("click", () => { store.set(current, !store.get(current)); sync(); });
    sync();
  }

  // 前のステップが未完了なら案内
  const banner = document.getElementById("prevBanner");
  if (banner && idx > 0 && !store.get(STEPS[idx - 1].id)) {
    banner.hidden = false;
    banner.querySelector("a").href = STEPS[idx - 1].href;
  }

  // トップページ
  const doneCount = STEPS.filter(s => store.get(s.id)).length;
  document.querySelectorAll("[data-status]").forEach(el => {
    const ok = store.get(el.dataset.status);
    el.textContent = ok ? "✓ 完了" : "未完了";
    el.classList.toggle("ok", ok);
    el.closest(".card").classList.toggle("done", ok);
  });
  const bar = document.getElementById("bar");
  if (bar) {
    bar.style.width = (doneCount / STEPS.length * 100) + "%";
    document.getElementById("count").textContent = `${doneCount} / ${STEPS.length} 完了`;
    document.getElementById("allok").classList.toggle("show", doneCount === STEPS.length);
  }
  const reset = document.getElementById("resetBtn");
  if (reset) reset.addEventListener("click", () => {
    STEPS.forEach(s => store.set(s.id, false));
    location.reload();
  });
});
