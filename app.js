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


// ---- YouTube：ページ内で再生し、止まったら自動で立て直す ----
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
const YT_ERR = { 2: "動画IDが不正", 5: "HTML5プレーヤーのエラー", 100: "動画が見つからない/非公開", 101: "所有者が埋め込みを禁止", 150: "所有者が埋め込みを禁止", 153: "参照元(リファラ)が送られていない" };
const YT_STATE = { "-1": "未開始", 0: "終了", 1: "再生中", 2: "一時停止", 3: "読み込み中", 5: "頭出し済み" };
const DEBUG = /[?&]debug=1/.test(location.search);

// 動画の上に小さく状態を出す（再生は止めない／差し替えない）
function videoNote(el, msg) {
  let n = el.querySelector(".vnote");
  if (!n) { n = document.createElement("div"); n.className = "vnote"; el.appendChild(n); }
  n.textContent = msg; n.hidden = !msg;
}
function vlog(el, msg) {
  if (!DEBUG) return;
  let box = el.parentElement.querySelector(".vdebug");
  if (!box) { box = document.createElement("pre"); box.className = "vdebug"; el.after(box); }
  box.textContent += new Date().toLocaleTimeString() + "  " + msg + "\n";
}

// 診断：YouTube 再生・広告に必要な通信先に届くか（?debug=1 のときだけ）
async function probeNetwork(el) {
  const targets = [
    ["YouTube本体", "https://www.youtube.com/favicon.ico"],
    ["YouTube(nocookie)", "https://www.youtube-nocookie.com/favicon.ico"],
    ["サムネイル", "https://i.ytimg.com/vi/k7wr-aqHVOk/default.jpg"],
    ["広告(doubleclick)", "https://static.doubleclick.net/instream/ad_status.js"],
    ["広告(googleads)", "https://googleads.g.doubleclick.net/pagead/id"],
    ["広告SDK(imasdk)", "https://imasdk.googleapis.com/js/sdkloader/ima3.js"],
    ["広告(googlesyndication)", "https://pagead2.googlesyndication.com/pagead/show_ads.js"],
    ["統計(s.youtube)", "https://s.youtube.com/api/stats/qoe"]
  ];
  const ua = navigator.userAgent;
  const br = (ua.match(/Edg\/[\d.]+/) || ua.match(/Chrome\/[\d.]+/) || ua.match(/Firefox\/[\d.]+/) || ["不明"])[0];
  vlog(el, `ブラウザ: ${br}  Cookie: ${navigator.cookieEnabled ? "有効" : "無効"}`);
  for (const [name, url] of targets) {
    const t = performance.now();
    try { await fetch(url, { mode: "no-cors", cache: "no-store" }); vlog(el, `通信OK  ${name} (${Math.round(performance.now() - t)}ms)`); }
    catch (e) { vlog(el, `通信NG  ${name} → 遮断されています（広告ブロック/社内フィルタの可能性）`); }
  }
}

function startPlayer(el, id) {
  el.innerHTML = `<div id="yt-${el.dataset.video}"></div>`;
  el.classList.add("playing");
  videoNote(el, "読み込み中…");
  el.classList.remove("facade"); el.style.backgroundImage = "";
  if (DEBUG) probeNetwork(el);
  let player, lastT = -1, stuck = 0, wait0 = 0, retries = 0, watch, started = false, autoMuted = false, prev = null, adFails = 0;

  loadYtApi().then(() => {
    player = new YT.Player(`yt-${el.dataset.video}`, {
      // 追跡防止（Edge 等）の影響を受けにくい nocookie ドメインのプレーヤーを使う
      host: "https://www.youtube-nocookie.com",
      videoId: id, width: "100%", height: "100%",
      playerVars: { rel: 0, playsinline: 1, origin: location.origin },
      events: {
        onReady: () => { vlog(el, "プレーヤー準備OK"); videoNote(el, "動画の ▶ を押すと再生します"); startWatch(); },
        onStateChange: e => {
          vlog(el, `状態: ${YT_STATE[e.data] ?? e.data}  位置 ${player.getCurrentTime().toFixed(1)}s`);
          if (e.data === 1 && !autoMuted) videoNote(el, "");
          // 本編前に「読み込み中 → 未開始」へ戻る＝広告の読み込みに失敗してプレーヤーがリセットされた
          if (!started && prev === 3 && e.data === -1) adFailed();
          prev = e.data;
        },
        onError: e => {
          const why = YT_ERR[e.data] || "エラーコード " + e.data;
          vlog(el, "エラー: " + e.data + " " + why);
          // 一時的なエラー(5)は位置を保って読み直す。埋め込み禁止などは理由を表示
          if (e.data === 5 && retries < 3) return recover("プレーヤーエラーのため再読み込み");
          videoNote(el, "再生できません：" + why);
        }
      }
    });
  }).catch(() => { videoNote(el, "YouTubeのスクリプトを読み込めません（社内フィルタ等で遮断されている可能性）"); vlog(el, "iframe_api 読み込み失敗"); });

  // 広告失敗からの立て直し：1回目は読み直し、2回目は消音で読み直し（消音なら自動再生が通りやすい）
  function adFailed() {
    adFails++;
    if (adFails === 1) {
      vlog(el, "広告の読み込みに失敗 → 動画を読み直して再試行");
      videoNote(el, "広告を読み込めなかったため、もう一度読み込んでいます…");
      player.loadVideoById(id);
    } else if (adFails === 2) {
      vlog(el, "広告の読み込みに再度失敗 → 消音にして読み直し");
      autoMuted = true; player.mute(); player.loadVideoById(id);
      videoNote(el, "消音で再生を試しています。再生されたら動画内の 🔊 で音が出ます");
    } else {
      vlog(el, "広告の読み込みに3回失敗 → 停止（広告ブロック/追跡防止/社内フィルタの可能性）");
      videoNote(el, "広告を読み込めず再生できません。広告ブロック拡張・ブラウザの追跡防止・社内フィルタの設定が原因の可能性があります");
    }
  }

  // 見張り：再生中/読み込み中なのに位置が進まない状態が続いたら、自動で立て直す
  function startWatch() {
    clearInterval(watch);
    watch = setInterval(() => {
      if (!player || !player.getPlayerState) return;
      const st = player.getPlayerState(), t = player.getCurrentTime();
      if (autoMuted && !player.isMuted()) { autoMuted = false; videoNote(el, ""); }
      // 本編が始まる前：0秒のまま「読み込み中」が続く＝ブラウザの自動再生制限で音あり再生が止められている
      if (!started) {
        if (t > 0.5) { started = true; wait0 = 0; vlog(el, "本編の再生開始"); }
        else if (st === 3) {
          wait0 += 2;
          if (wait0 === 8) {
            vlog(el, "0秒で停止(自動再生制限) → 消音にして再生");
            autoMuted = true; player.mute(); player.playVideo();
            videoNote(el, "自動再生の制限のため消音で再生中です。動画内の 🔊 を押すと音が出ます");
          }
        } else wait0 = 0;
        lastT = t; return;
      }
      if ((st === 1 || st === 3) && Math.abs(t - lastT) < 0.05) stuck += 2; else stuck = 0;
      lastT = t;
      if (stuck === 6) { vlog(el, `停止を検知(${YT_STATE[st]}, ${t.toFixed(1)}s) → 再生を再開`); player.playVideo(); }
      if (stuck >= 12) recover(`停止が続くため ${t.toFixed(1)}s から読み直し`);
    }, 2000);
  }
  function recover(reason) {
    if (retries >= 3) { videoNote(el, "通信が不安定で再生が止まりました。▶ を押すと続きから再生します"); stuck = 0; return; }
    retries++; stuck = 0;
    const t = Math.max(0, (player.getCurrentTime && player.getCurrentTime()) || 0);
    vlog(el, `${reason}（${retries}回目）`);
    videoNote(el, "再接続しています…");
    started = false;
    player.loadVideoById({ videoId: id, startSeconds: t });
  }
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

  // 動画
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
        startPlayer(el, id);
        el.insertAdjacentHTML("afterend", `<p class="vlink"><a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">再生できない場合は、YouTubeで開く</a></p>`);
      } else {
        el.classList.add("empty");
        el.textContent = "動画は準備中です（app.js の VIDEOS にYouTubeのURLを設定すると表示されます）";
      }
    };
    // 画面に近づいたら読み込む（ページの表示を YouTube で待たせない）
    if (details) details.addEventListener("toggle", () => { if (details.open) load(); });
    if (details && !details.open) return;
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: "300px" });
      io.observe(el);
    } else load();
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
