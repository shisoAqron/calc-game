/* ====================================================
   けいさんゲーム  ロジック
   ==================================================== */
"use strict";

/* ---------- 設定 ---------- */
const QUESTIONS_PER_GAME = 10;

// むずかしさごとの 数のはんい・もちじかん
const DIFFICULTY = {
  easy:   { add: 10,  sub: 10,  mul: 5,  divMax: 5,  time: 20 },
  normal: { add: 20,  sub: 20,  mul: 9,  divMax: 9,  time: 15 },
  hard:   { add: 100, sub: 100, mul: 12, divMax: 12, time: 12 },
};

const OP_INFO = {
  add: { sign: "＋", fn: (a, b) => a + b },
  sub: { sign: "－", fn: (a, b) => a - b },
  mul: { sign: "×", fn: (a, b) => a * b },
  div: { sign: "÷", fn: (a, b) => a / b },
};

const GOOD_WORDS = ["せいかい！", "やったね！", "すごい！", "てんさい！", "おみごと！"];
const BAD_WORDS = ["ざんねん！", "おしい！", "ドンマイ！"];

/* ====================================================
   サウンド（Web Audio API でその場で合成・音声ファイル不要）
   ==================================================== */
const Sound = {
  ctx: null,
  enabled: true,

  // ミュートの設定
  setMuted(muted) {
    this.enabled = !muted;
  },

  // ユーザー操作のタイミングで作成・再開（スマホの自動再生制限対策）
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  },

  // 単音（エンベロープ付き）
  tone(freq, start, dur, type, vol) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.03);
  },

  // 減衰するホワイトノイズ源をつくる
  noiseSource(dur, decayPow) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const p = decayPow == null ? 1.5 : decayPow;
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, p);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  },

  // 歪み（ワーブシェイパー）カーブ＝爆発のザラつき用
  distortionCurve(amount) {
    const n = 256, curve = new Float32Array(n), deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  },

  // 選択: 「コリッ」（高域ノイズの立ち上がり＋ピッチ下降ブリップ）
  select() {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // カチッとした立ち上がり（一瞬の高域ノイズ）
    const click = this.noiseSource(0.03, 0.3);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2000;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.28, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    click.connect(hp).connect(cg).connect(ctx.destination);
    click.start(t);
    click.stop(t + 0.03);

    // 「コリッ」の本体（短いピッチ下降ブリップ）
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(380, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  },

  // 正解: 煌びやかな上昇アルペジオ＋高音のキラキラ装飾
  correct() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    // 明るく高めのベル風アルペジオ (E6 G6 C7 E7)
    const arp = [1318.5, 1567.98, 2093.0, 2637.02];
    arp.forEach((f, i) => this.tone(f, t + i * 0.06, 0.5, "triangle", 0.28));
    // さらに高音をパラパラ鳴らして「キラキラ感」を出す
    const sparkle = [3136.0, 4186.0, 3520.0, 4698.6, 2793.8, 5274.0];
    sparkle.forEach((f, i) => this.tone(f, t + 0.18 + i * 0.05, 0.22, "triangle", 0.12));
  },

  // 不正解: 多層の爆発音（鋭いアタック＋歪んだ爆風＋深いサブ＋ゴロゴロ余韻）
  explosion() {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.destination;

    // 1) 鋭いアタック「バチッ！」（高域ノイズの一瞬）
    const crack = this.noiseSource(0.09, 0.6);
    const chp = ctx.createBiquadFilter();
    chp.type = "highpass";
    chp.frequency.value = 900;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.8, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    crack.connect(chp).connect(cg).connect(out);
    crack.start(t);
    crack.stop(t + 0.09);

    // 2) 本体の爆風（歪み付き・ローパスを大きく下げて「ドカーン」）
    const dur = 0.95;
    const blast = this.noiseSource(dur, 1.4);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(80, t + dur);
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.distortionCurve(60);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(1.0, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + dur);
    blast.connect(lp).connect(shaper).connect(bg).connect(out);
    blast.start(t);
    blast.stop(t + dur);

    // 3) サブベースの「ドゥゥン」（深く落ちて腹に響く）
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(180, t);
    sub.frequency.exponentialRampToValueAtTime(26, t + 0.6);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.95, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    sub.connect(sg).connect(out);
    sub.start(t);
    sub.stop(t + 0.7);

    // 4) 余韻のゴロゴロ（低くこもったノイズの尾）
    const tail = this.noiseSource(0.85, 0.8);
    const tlp = ctx.createBiquadFilter();
    tlp.type = "lowpass";
    tlp.frequency.value = 200;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.exponentialRampToValueAtTime(0.4, t + 0.1);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    tail.connect(tlp).connect(tg).connect(out);
    tail.start(t);
    tail.stop(t + 0.85);
  },
};

/* ---------- 状態 ---------- */
const state = {
  op: "add",
  diff: "easy",
  mode: "none",   // 将来用: "none" | "hyakumasu" | "endless"（現在は未実装）
  qIndex: 0,
  score: 0,
  streak: 0,
  maxStreak: 0,
  correctCount: 0,
  current: null,    // { a, b, op, answer }
  input: "",
  timeLeft: 0,        // のこり秒数（小数）
  rafId: 0,
  timerRunning: false,
  tStart: 0,          // 計測開始時刻
  tDuration: 0,       // 制限時間(ms)
  tPausedAccum: 0,    // ポーズで止まっていた合計時間(ms)
  tPauseStart: 0,     // ポーズ開始時刻
  locked: false,      // 演出中の入力ロック
  paused: false,
};

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const screens = {
  home: $("screen-home"),
  game: $("screen-game"),
  result: $("screen-result"),
};

/* ====================================================
   画面切り替え
   ==================================================== */
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove("is-active"));
  screens[name].classList.add("is-active");
}

/* ====================================================
   トップページ
   ==================================================== */
function initHome() {
  const opGrid = $("op-grid");
  opGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".op-btn");
    if (!btn) return;
    Sound.unlock(); // トップでの操作で音声を有効化
    Sound.select();
    opGrid.querySelectorAll(".op-btn").forEach((b) => b.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    state.op = btn.dataset.op;
  });

  const diffGrid = $("diff-grid");
  diffGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".diff-btn");
    if (!btn) return;
    Sound.unlock();
    Sound.select();
    diffGrid.querySelectorAll(".diff-btn").forEach((b) => b.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    state.diff = btn.dataset.diff;
  });

  // モード（百マス／エンドレス）: まだ未実装なのでお知らせを出すだけ
  const modeGrid = $("mode-grid");
  modeGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".mode-btn");
    if (!btn) return;
    Sound.unlock();
    Sound.select();
    showToast("きのうついかをまっててね");
  });

  $("start-btn").addEventListener("click", startGame);
}

/* お知らせトーストを一定時間だけ表示 */
let toastTimer = null;
function showToast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-on"), 1900);
}

/* ====================================================
   ゲーム開始
   ==================================================== */
function startGame() {
  Sound.unlock(); // ユーザー操作のうちに音声を有効化
  state.qIndex = 0;
  state.score = 0;
  state.streak = 0;
  state.maxStreak = 0;
  state.correctCount = 0;
  state.paused = false;

  $("score-value").textContent = "0";
  $("streak-value").textContent = "0";

  showScreen("game");
  nextQuestion();
}

/* ---------- 問題生成 ---------- */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickOp() {
  if (state.op === "mix") {
    const ops = ["add", "sub", "mul", "div"];
    return ops[randInt(0, ops.length - 1)];
  }
  return state.op;
}

function makeQuestion() {
  const cfg = DIFFICULTY[state.diff];
  const op = pickOp();
  let a, b;

  switch (op) {
    case "add":
      a = randInt(1, cfg.add);
      b = randInt(1, cfg.add);
      break;
    case "sub":
      a = randInt(1, cfg.sub);
      b = randInt(0, a); // 答えが0以上になるように
      break;
    case "mul":
      a = randInt(1, cfg.mul);
      b = randInt(1, cfg.mul);
      break;
    case "div": {
      // わりきれる問題を作る: b × answer = a
      b = randInt(1, cfg.divMax);
      const ans = randInt(1, cfg.divMax);
      a = b * ans;
      break;
    }
  }
  const answer = OP_INFO[op].fn(a, b);
  return { a, b, op, answer };
}

/* ---------- 次の問題へ ---------- */
function nextQuestion() {
  if (state.qIndex >= QUESTIONS_PER_GAME) {
    endGame();
    return;
  }
  state.qIndex++;
  state.current = makeQuestion();
  state.input = "";
  state.locked = false;

  // 表示更新
  const { a, b, op } = state.current;
  $("q-a").textContent = a;
  $("q-b").textContent = b;
  $("q-op").textContent = OP_INFO[op].sign;
  $("q-mark").textContent = "？";

  const card = $("question-card");
  card.classList.remove("is-pop");
  void card.offsetWidth; // reflow でアニメ再生
  card.classList.add("is-pop");

  renderAnswer();
  $("answer-box").classList.remove("is-correct", "is-wrong");
  setMascot("⭐", "がんばろう！");

  // 進捗（HUDに「何問目か」を表示）
  $("q-current").textContent = state.qIndex;
  $("q-total").textContent = QUESTIONS_PER_GAME;

  startTimer();
}

/* ---------- 答え表示 ---------- */
function renderAnswer() {
  const box = $("answer-box");
  if (state.input === "") {
    box.innerHTML = '<span class="answer-placeholder">？</span>';
  } else {
    box.textContent = state.input;
  }
}

function setMascot(face, words) {
  $("mascot").firstChild.nodeValue = face;
  $("mascot-bubble").textContent = words;
}

/* ====================================================
   タイマー（爆弾の導火線）
   ==================================================== */
function startTimer() {
  cancelAnimationFrame(state.rafId);
  state.tDuration = DIFFICULTY[state.diff].time * 1000;
  state.tStart = performance.now();
  state.tPausedAccum = 0;
  state.tPauseStart = 0;
  state.timeLeft = DIFFICULTY[state.diff].time;
  state.timerRunning = true;
  updateTimerUI(1);
  state.rafId = requestAnimationFrame(tick);
}

// 導火線を毎フレームなめらかに更新
function tick() {
  if (!state.timerRunning) return;
  if (state.paused) {
    state.rafId = requestAnimationFrame(tick);
    return;
  }
  const elapsed = performance.now() - state.tStart - state.tPausedAccum;
  const remaining = Math.max(0, state.tDuration - elapsed);
  state.timeLeft = remaining / 1000;
  updateTimerUI(remaining / state.tDuration);

  if (remaining <= 0) {
    state.timerRunning = false;
    handleTimeout();
    return;
  }
  state.rafId = requestAnimationFrame(tick);
}

function updateTimerUI(fraction) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  $("fuse-fill").style.width = pct + "%";
  $("fuse-spark").style.opacity = pct <= 2 ? "0" : "1";
  $("time-value").textContent = Math.max(0, Math.ceil(state.timeLeft));
  $("fuse").classList.toggle("is-danger", state.timeLeft <= 5);
}

function stopTimer() {
  state.timerRunning = false;
  cancelAnimationFrame(state.rafId);
}

/* ====================================================
   キーパッド入力
   ==================================================== */
function initKeypad() {
  const pad = $("keypad");
  pad.addEventListener("click", (e) => {
    const btn = e.target.closest(".key");
    if (!btn) return;
    handleKey(btn.dataset.key);
  });

  // 物理キーボードでも遊べるように
  window.addEventListener("keydown", (e) => {
    if (!screens.game.classList.contains("is-active")) return;
    if (e.key >= "0" && e.key <= "9") handleKey(e.key);
    else if (e.key === "Enter") handleKey("enter");
    else if (e.key === "Backspace") handleKey("clear");
  });
}

function handleKey(key) {
  Sound.unlock(); // タップのたびに音声を有効化（iOS対策）
  if (state.locked || state.paused) return;

  if (key === "clear") {
    state.input = state.input.slice(0, -1);
    renderAnswer();
    return;
  }
  if (key === "enter") {
    submitAnswer();
    return;
  }
  // 数字
  if (state.input.length >= 4) return; // 入れすぎ防止
  if (state.input === "0") state.input = ""; // 先頭ゼロを避ける
  state.input += key;
  renderAnswer();
}

/* ====================================================
   答え合わせ
   ==================================================== */
function submitAnswer() {
  if (state.input === "") return;
  stopTimer();
  state.locked = true;

  const value = parseInt(state.input, 10);
  if (value === state.current.answer) {
    onCorrect();
  } else {
    onWrong(false);
  }
}

function handleTimeout() {
  state.locked = true;
  // 時間切れは「？」のまま正解を見せる
  onWrong(true);
}

function onCorrect() {
  state.correctCount++;
  state.streak++;
  state.maxStreak = Math.max(state.maxStreak, state.streak);

  // スコア: 基本10点 + のこり時間ボーナス + れんぞくボーナス
  const gain = 10 + Math.max(0, Math.round(state.timeLeft)) + (state.streak - 1) * 2;
  state.score += gain;

  $("score-value").textContent = state.score;
  $("streak-value").textContent = state.streak;
  $("q-mark").textContent = state.current.answer;
  $("answer-box").classList.add("is-correct");
  setMascot("😆", "やったね！");

  const word = GOOD_WORDS[randInt(0, GOOD_WORDS.length - 1)];
  showFx(true, word, "👍");
  launchConfetti();
  Sound.correct();

  setTimeout(afterFeedback, 1400);
}

function onWrong(isTimeout) {
  state.streak = 0;
  $("streak-value").textContent = "0";
  $("q-mark").textContent = state.current.answer; // 正しい答えを見せる
  $("answer-box").classList.add("is-wrong");
  setMascot("😣", isTimeout ? "じかんぎれ…" : "ちがうよ〜");

  const word = isTimeout ? "じかんぎれ！" : BAD_WORDS[randInt(0, BAD_WORDS.length - 1)];
  showFx(false, word, "💥");
  boomEffect();
  Sound.explosion();

  setTimeout(afterFeedback, 1600);
}

function afterFeedback() {
  hideFx();
  nextQuestion();
}

/* ====================================================
   演出
   ==================================================== */
function showFx(good, text, emoji) {
  const fx = $("fx");
  const txt = $("fx-text");
  const emo = $("fx-emoji");
  txt.textContent = text;
  txt.className = "fx-text " + (good ? "good" : "bad");
  emo.textContent = emoji;
  fx.classList.add("is-on");
}

function hideFx() {
  $("fx").classList.remove("is-on");
  $("fx-confetti").innerHTML = "";
}

function launchConfetti() {
  const wrap = $("fx-confetti");
  wrap.innerHTML = "";
  const colors = ["#ff5c5c", "#ffcc33", "#36c98a", "#36b6f0", "#9a5cf0", "#f05cc0"];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement("div");
    p.className = "confetti-piece";
    p.style.left = Math.random() * 100 + "%";
    p.style.background = colors[randInt(0, colors.length - 1)];
    p.style.animationDuration = 0.9 + Math.random() * 0.9 + "s";
    p.style.animationDelay = Math.random() * 0.2 + "s";
    p.style.transform = `rotate(${randInt(0, 360)}deg)`;
    wrap.appendChild(p);
  }
}

function boomEffect() {
  const g = $("screen-game");
  g.classList.add("is-boom", "shake");
  setTimeout(() => g.classList.remove("is-boom", "shake"), 450);
}

/* ====================================================
   ゲーム終了 → リザルト
   ==================================================== */
function endGame() {
  stopTimer();

  $("result-score").textContent = state.score;
  $("result-correct").textContent = state.correctCount;
  $("result-total").textContent = QUESTIONS_PER_GAME;
  $("result-streak").textContent = state.maxStreak;

  // 成績にあわせて 星・メダル・タイトル（4段階）
  //  全問正解     → 星3つ
  //  8割以上      → 星2つ
  //  4割以上      → 星1つ
  //  4割未満      → 星0こ
  const correct = state.correctCount;
  const total = QUESTIONS_PER_GAME;
  let stars, medal, title;
  if (correct === total) { stars = 3; medal = "🏆"; title = "パーフェクト！"; }
  else if (correct * 10 >= total * 8) { stars = 2; medal = "🥈"; title = "よくできたね！"; }
  else if (correct * 10 >= total * 4) { stars = 1; medal = "🥉"; title = "がんばったね！"; }
  else { stars = 0; medal = "😭"; title = "つぎは がんばろう！"; }

  $("result-medal").textContent = medal;
  $("result-title").textContent = title;
  const starEls = [];
  for (let i = 0; i < 3; i++) {
    starEls.push(i < stars ? "⭐" : '<span class="dim">⭐</span>');
  }
  $("result-stars").innerHTML = starEls.join("");

  showScreen("result");
}

function initResult() {
  $("retry-btn").addEventListener("click", startGame);
  $("home-btn").addEventListener("click", () => {
    stopTimer();
    showScreen("home");
  });
}

/* ====================================================
   ポーズ
   ==================================================== */
function initPause() {
  const overlay = $("pause-overlay");
  $("pause-btn").addEventListener("click", () => {
    if (state.locked || state.paused) return;
    state.paused = true;
    state.tPauseStart = performance.now();
    overlay.classList.add("is-on");
  });
  $("resume-btn").addEventListener("click", () => {
    if (state.tPauseStart) {
      state.tPausedAccum += performance.now() - state.tPauseStart;
      state.tPauseStart = 0;
    }
    state.paused = false;
    overlay.classList.remove("is-on");
  });
  $("quit-btn").addEventListener("click", () => {
    state.paused = false;
    overlay.classList.remove("is-on");
    stopTimer();
    showScreen("home");
  });
}

/* ====================================================
   ミュートボタン
   ==================================================== */
function initMute() {
  const btn = $("mute-btn");

  const render = () => {
    const muted = !Sound.enabled;
    btn.classList.toggle("is-muted", muted);
    btn.querySelector(".mute-ico").textContent = muted ? "🔈" : "🔊";
    btn.setAttribute("aria-pressed", String(muted));
  };

  render(); // 起動時：保存済みの設定を反映

  btn.addEventListener("click", () => {
    Sound.unlock();
    Sound.setMuted(Sound.enabled); // ON⇔OFF を切り替え
    render();
    if (Sound.enabled) Sound.select(); // 復帰時は確認の「コリッ」
  });
}

/* ====================================================
   初期化
   ==================================================== */
function init() {
  initHome();
  initKeypad();
  initResult();
  initPause();
  initMute();
  showScreen("home");
}

document.addEventListener("DOMContentLoaded", init);
