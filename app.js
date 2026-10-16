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
        const origin = encodeURIComponent(location.origin);
        el.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?rel=0&playsinline=1&origin=${origin}" title="解説動画" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        el.insertAdjacentHTML("afterend", `<p class="vlink"><a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">表示されない場合は、YouTubeで開く</a></p>`);
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
