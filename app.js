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

/* ---------- 状態 ---------- */
const state = {
  op: "add",
  diff: "easy",
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
    opGrid.querySelectorAll(".op-btn").forEach((b) => b.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    state.op = btn.dataset.op;
  });

  const diffGrid = $("diff-grid");
  diffGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".diff-btn");
    if (!btn) return;
    diffGrid.querySelectorAll(".diff-btn").forEach((b) => b.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    state.diff = btn.dataset.diff;
  });

  $("start-btn").addEventListener("click", startGame);
}

/* ====================================================
   ゲーム開始
   ==================================================== */
function startGame() {
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

  // 成績にあわせて 星・メダル・タイトル
  const ratio = state.correctCount / QUESTIONS_PER_GAME;
  let stars, medal, title;
  if (ratio >= 0.9) { stars = 3; medal = "🏆"; title = "パーフェクト！"; }
  else if (ratio >= 0.6) { stars = 2; medal = "🥇"; title = "クリア！"; }
  else if (ratio >= 0.3) { stars = 1; medal = "🥈"; title = "がんばった！"; }
  else { stars = 0; medal = "🥉"; title = "またチャレンジ！"; }

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
   初期化
   ==================================================== */
function init() {
  initHome();
  initKeypad();
  initResult();
  initPause();
  showScreen("home");
}

document.addEventListener("DOMContentLoaded", init);
