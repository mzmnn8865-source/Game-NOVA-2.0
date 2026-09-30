"use strict";

/* ============================================================
   Nova Lumen - Game Script v2
   ساخته شده توسط آریا عزیزی
   بدون هیچ فریمورکی
   ============================================================ */

/* ------------------------------------------------------------
   ۱. ابزارهای کمکی
------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const nowMs = () => performance.now();
const TWO_PI = Math.PI * 2;

/* ------------------------------------------------------------
   ۲. تنظیمات
------------------------------------------------------------ */
const settings = {
  quality: "medium",
  bloom: true,
  particles: true,
  blur: true,
  dayNight: true,
  musicVolume: 0.7,
  sfxVolume: 0.8,
  saveMusic: true,
  mode: "normal",
  load() {
    try {
      const raw = localStorage.getItem("novalumen.settings");
      if (raw) Object.assign(this, JSON.parse(raw));
    } catch (e) {}
  },
  save() {
    try {
      localStorage.setItem("novalumen.settings", JSON.stringify({
        quality: this.quality, bloom: this.bloom, particles: this.particles,
        blur: this.blur, dayNight: this.dayNight, musicVolume: this.musicVolume,
        sfxVolume: this.sfxVolume, saveMusic: this.saveMusic, mode: this.mode,
      }));
    } catch (e) {}
  },
};

const stats = {
  highScore: 0,
  totalLumens: 0,
  load() {
    try {
      this.highScore = parseInt(localStorage.getItem("novalumen.highScore") || "0", 10);
      this.totalLumens = parseInt(localStorage.getItem("novalumen.totalLumens") || "0", 10);
    } catch (e) {}
  },
  save() {
    try {
      localStorage.setItem("novalumen.highScore", String(this.highScore));
      localStorage.setItem("novalumen.totalLumens", String(this.totalLumens));
    } catch (e) {}
  },
};

/* ------------------------------------------------------------
   ۳. توست
------------------------------------------------------------ */
function toast(msg, type) {
  const wrap = $("toastWrap");
  if (!wrap) return;
  const t = document.createElement("div");
  t.className = "toast" + (type ? " " + type : "");
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => {
    t.classList.add("out");
    setTimeout(() => t.remove(), 400);
  }, 2200);
}

/* ------------------------------------------------------------
   ۴. IndexedDB
------------------------------------------------------------ */
const idb = {
  db: null,
  open() {
    return new Promise((resolve) => {
      if (!window.indexedDB) return resolve(null);
      const req = indexedDB.open("NovaLumenDB", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("store")) db.createObjectStore("store");
      };
      req.onsuccess = () => { this.db = req.result; resolve(this.db); };
      req.onerror = () => resolve(null);
    });
  },
  put(key, value) {
    if (!this.db) return Promise.resolve();
    return new Promise((resolve) => {
      const tx = this.db.transaction("store", "readwrite");
      tx.objectStore("store").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  },
  get(key) {
    if (!this.db) return Promise.resolve(null);
    return new Promise((resolve) => {
      const tx = this.db.transaction("store", "readonly");
      const req = tx.objectStore("store").get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  },
  del(key) {
    if (!this.db) return Promise.resolve();
    return new Promise((resolve) => {
      const tx = this.db.transaction("store", "readwrite");
      tx.objectStore("store").delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  },
};

/* ------------------------------------------------------------
   ۵. صدا
------------------------------------------------------------ */
const audio = {
  ctx: null, analyser: null, gain: null, source: null, buffer: null,
  freq: null, bass: 0, energy: 0, beat: 0, lastBeat: 0,
  fileName: "", hasMusic: false,

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    this.gain = this.ctx.createGain();
    this.gain.gain.value = settings.musicVolume;
    this.gain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
  },

  async resume() {
    if (this.ctx && this.ctx.state === "suspended") {
      try { await this.ctx.resume(); } catch (e) {}
    }
  },

  async loadArrayBuffer(arrayBuffer, name) {
    this.init();
    if (!this.ctx) return false;
    try {
      const copy = arrayBuffer.slice(0);
      this.buffer = await this.ctx.decodeAudioData(copy);
      this.fileName = name || "بدون نام";
      this.hasMusic = true;
      return true;
    } catch (e) { return false; }
  },

  async loadFile(file) {
    const buf = await file.arrayBuffer();
    return this.loadArrayBuffer(buf, file.name);
  },

  play() {
    if (!this.buffer || !this.ctx) return;
    this.stop();
    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.loop = true;
    this.source.connect(this.gain);
    try { this.source.start(0); } catch (e) {}
  },

  stop() {
    if (this.source) {
      try { this.source.stop(0); } catch (e) {}
      try { this.source.disconnect(); } catch (e) {}
      this.source = null;
    }
  },

  setVolume(v) {
    settings.musicVolume = v;
    if (this.gain) this.gain.gain.value = v;
  },

  update() {
    if (!this.analyser || !this.freq) return;
    this.analyser.getByteFrequencyData(this.freq);
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += this.freq[i];
    const bassVal = sum / 8 / 255;
    this.bass = this.bass * 0.7 + bassVal * 0.3;
    let total = 0;
    for (let i = 0; i < this.freq.length; i++) total += this.freq[i];
    const eVal = total / this.freq.length / 255;
    this.energy = this.energy * 0.8 + eVal * 0.2;
    if (this.bass > 0.55 && nowMs() - this.lastBeat > 140) {
      this.beat = 1;
      this.lastBeat = nowMs();
    } else {
      this.beat *= 0.9;
      if (this.beat < 0.01) this.beat = 0;
    }
  },
};

/* ------------------------------------------------------------
   ۶. افکت صوتی
------------------------------------------------------------ */
const sfx = {
  play(freq, duration, type, vol) {
    if (!audio.ctx) return;
    const g = audio.ctx.createGain();
    const o = audio.ctx.createOscillator();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.value = 0;
    const v = (vol == null ? 0.2 : vol) * settings.sfxVolume;
    const t = audio.ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g);
    g.connect(audio.ctx.destination);
    o.start(t);
    o.stop(t + duration + 0.02);
  },
  collect() { this.play(880, 0.08, "sine", 0.06); },
  hit() { this.play(160, 0.15, "sawtooth", 0.08); },
  death() {
    this.play(220, 0.3, "sine", 0.15);
    setTimeout(() => this.play(140, 0.4, "sine", 0.12), 80);
  },
  win() {
    this.play(660, 0.2, "sine", 0.15);
    setTimeout(() => this.play(880, 0.2, "sine", 0.15), 120);
    setTimeout(() => this.play(1320, 0.4, "sine", 0.15), 240);
  },
  level() { this.play(660, 0.2, "sine", 0.1); setTimeout(() => this.play(990, 0.25, "sine", 0.1), 120); },
};

/* ------------------------------------------------------------
   ۷. شب و روز
------------------------------------------------------------ */
const dayNight = {
  timeFactor: 0, scoreFactor: 0, blend: 0,
  update(score) {
    const h = new Date().getHours();
    let tf;
    if (h >= 6 && h < 12) tf = (12 - h) / 12 * 0.3;
    else if (h >= 12 && h < 18) tf = (h - 12) / 6 * 0.3;
    else if (h >= 18 && h < 22) tf = 0.3 + (h - 18) / 4 * 0.3;
    else {
      const hh = h >= 22 ? h - 22 : h + 2;
      tf = 0.6 + hh / 8 * 0.4;
    }
    this.timeFactor = clamp(tf, 0, 1);
    this.scoreFactor = clamp(score / 2000, 0, 1) * 0.5;
    this.blend = settings.dayNight ? clamp(this.timeFactor + this.scoreFactor, 0, 1) : 0;
  },
  skyColor() {
    const b = this.blend;
    const r1 = 0xee, g1 = 0xf3, b1 = 0xfb;
    const r2 = 0x2a, g2 = 0x1a, b2 = 0x3a;
    const r3 = 0x05, g3 = 0x06, b3 = 0x0a;
    let r, g, bl;
    if (b < 0.5) {
      const t = b / 0.5;
      r = Math.round(lerp(r1, r2, t));
      g = Math.round(lerp(g1, g2, t));
      bl = Math.round(lerp(b1, b2, t));
    } else {
      const t = (b - 0.5) / 0.5;
      r = Math.round(lerp(r2, r3, t));
      g = Math.round(lerp(g2, g3, t));
      bl = Math.round(lerp(b2, b3, t));
    }
    return "rgb(" + r + "," + g + "," + bl + ")";
  },
  isNight() { return this.blend > 0.5; },
};

/* ------------------------------------------------------------
   ۸. کیفیت گرافیک
------------------------------------------------------------ */
const QUALITY = {
  low:    { dpr: 1,   stars: 60,  particles: 100, trailLen: 0 },
  medium: { dpr: 1.4, stars: 120, particles: 220, trailLen: 0 },
  high:   { dpr: 2,   stars: 200, particles: 350, trailLen: 0 },
};

/* ------------------------------------------------------------
   ۹. وضعیت بازی
------------------------------------------------------------ */
const game = {
  canvas: null, ctx: null, visCanvas: null, visCtx: null,
  W: 0, H: 0, dpr: 1,

  running: false, paused: false, gameOver: false, won: false,
  mode: "normal",
  inputMode: "keyboard", // keyboard یا touch

  player: {
    x: 0, y: 0, vx: 0, vy: 0,
    size: 22,
    baseSize: 22,
    maxSize: 300,
    collected: 0,
    maxCollected: 120,
    color: "#ffffff",
    hue: 200,
    shieldTime: 0,
    invulTime: 0,
    dashCd: 0,
    freezeCd: 0,
    shieldCd: 0,
    facing: { x: 1, y: 0 },
    hp: 3,
    maxHp: 3,
    hurtFlash: 0,
  },

  keys: { up: false, down: false, left: false, right: false },
  touch: { x: 0, y: 0, active: false },
  mouse: { x: 0, y: 0, active: false },

  pixels: [],
  blackHoles: [],
  particles: [],
  stars: [],
  boss: null,

  score: 0,
  level: 1,
  combo: 1,
  comboTimer: 0,
  comboTimerMax: 1500,
  lastCollectTime: 0,

  startTime: 0,
  elapsed: 0,
  timeAttackLimit: 60,

  screenShake: 0,
  hue: 0,

  // موج (با هر ۴۰ پیکسل، موج بعدی)
  wave: 1,
  waveThreshold: 40,

  // شمارش برای موج بعدی
  nextWaveAt: 40,
};

/* ------------------------------------------------------------
   ۱۰. اعمال کیفیت
------------------------------------------------------------ */
function applyQuality() {
  const q = QUALITY[settings.quality] || QUALITY.medium;
  game.dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
  resizeCanvas();
  buildStars();
}

/* ------------------------------------------------------------
   ۱۱. ستاره ها
------------------------------------------------------------ */
function buildStars() {
  const q = QUALITY[settings.quality] || QUALITY.medium;
  const count = settings.particles ? q.stars : 0;
  game.stars = [];
  for (let i = 0; i < count; i++) {
    game.stars.push({
      x: Math.random() * game.W,
      y: Math.random() * game.H,
      r: rand(0.4, 1.6),
      vx: rand(-8, 8), vy: rand(-8, 8),
      hue: randInt(180, 320),
      alpha: rand(0.2, 0.7),
    });
  }
}

function updateStars(dt) {
  for (const s of game.stars) {
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.x < -5) s.x = game.W + 5;
    if (s.x > game.W + 5) s.x = -5;
    if (s.y < -5) s.y = game.H + 5;
    if (s.y > game.H + 5) s.y = -5;
  }
}

/* ------------------------------------------------------------
   ۱۲. اندازه بوم
------------------------------------------------------------ */
function resizeCanvas() {
  if (!game.canvas) return;
  const w = window.innerWidth, h = window.innerHeight;
  game.W = w; game.H = h;
  game.dpr = Math.min(window.devicePixelRatio || 1, (QUALITY[settings.quality] || QUALITY.medium).dpr);
  game.canvas.width = Math.floor(w * game.dpr);
  game.canvas.height = Math.floor(h * game.dpr);
  game.canvas.style.width = w + "px";
  game.canvas.style.height = h + "px";
  game.ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);

  if (game.visCanvas) {
    game.visCanvas.width = Math.floor(w);
    game.visCanvas.height = 90;
  }

  // بروزرسانی maxSize بر اساس ابعاد جدید
  updateMaxSize();
}

function updateMaxSize() {
  const p = game.player;
  // حداکثر اندازه ی پیکسل: ۳۰ درصد مساحت صفحه
  p.maxSize = Math.sqrt(game.W * game.H * 0.30);
  p.baseSize = 22;
  updatePlayerSize();
}

function updatePlayerSize() {
  const p = game.player;
  const prog = clamp(p.collected / p.maxCollected, 0, 1);
  p.size = p.baseSize + (p.maxSize - p.baseSize) * prog;
  // شعاع چرخشی (تقریبی)
  p.hue = 200 + prog * 140; // ۲۰۰ -> ۳۴۰
}

/* ------------------------------------------------------------
   ۱۳. ورودی
------------------------------------------------------------ */
function setupInput() {
  const c = game.canvas;

  // تشخیص دستگاه
  const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  game.inputMode = isTouch ? "touch" : "keyboard";

  // ---------- کیبورد ----------
  window.addEventListener("keydown", (e) => {
    const code = e.code;
    if (["KeyW","ArrowUp"].includes(code)) { game.keys.up = true; game.inputMode = "keyboard"; e.preventDefault(); }
    if (["KeyS","ArrowDown"].includes(code)) { game.keys.down = true; game.inputMode = "keyboard"; e.preventDefault(); }
    if (["KeyA","ArrowLeft"].includes(code)) { game.keys.left = true; game.inputMode = "keyboard"; e.preventDefault(); }
    if (["KeyD","ArrowRight"].includes(code)) { game.keys.right = true; game.inputMode = "keyboard"; e.preventDefault(); }

    if (code === "Space") {
      e.preventDefault();
      if (game.running && !game.paused && !game.gameOver) dash();
    }
    if (code === "KeyQ") {
      if (game.running && !game.paused && !game.gameOver) freeze();
    }
    if (code === "KeyE") {
      if (game.running && !game.paused && !game.gameOver) shield();
    }
    if (code === "Escape" || code === "KeyP") {
      if (game.running && !game.gameOver) togglePause();
    }
  });

  window.addEventListener("keyup", (e) => {
    const code = e.code;
    if (["KeyW","ArrowUp"].includes(code)) game.keys.up = false;
    if (["KeyS","ArrowDown"].includes(code)) game.keys.down = false;
    if (["KeyA","ArrowLeft"].includes(code)) game.keys.left = false;
    if (["KeyD","ArrowRight"].includes(code)) game.keys.right = false;
  });

  // ---------- لمس ----------
  const setTouch = (x, y) => {
    const r = c.getBoundingClientRect();
    game.touch.x = x - r.left;
    game.touch.y = y - r.top;
    game.touch.active = true;
    game.inputMode = "touch";
  };

  c.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (game.paused || game.gameOver) return;
    const t = e.touches[0];
    setTouch(t.clientX, t.clientY);
  }, { passive: false });

  c.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const t = e.touches[0];
    setTouch(t.clientX, t.clientY);
  }, { passive: false });

  c.addEventListener("touchend", (e) => {
    if (e.touches.length === 0) game.touch.active = false;
  }, { passive: false });

  // ---------- موس (برای کلیک روی پاورآپ ها و ...) ----------
  c.addEventListener("mousemove", (e) => {
    const r = c.getBoundingClientRect();
    game.mouse.x = e.clientX - r.left;
    game.mouse.y = e.clientY - r.top;
    game.mouse.active = true;
  });
  c.addEventListener("mouseleave", () => { game.mouse.active = false; });

  window.addEventListener("resize", () => {
    resizeCanvas();
    buildStars();
  });
}

/* ------------------------------------------------------------
   ۱۴. پاورآپ ها
------------------------------------------------------------ */
function dash() {
  const p = game.player;
  if (p.dashCd > 0) return;
  p.dashCd = 1.2;
  // جهت: اگر کلید فشرده، جهت همون، وگرنه facing
  let dx = 0, dy = 0;
  if (game.keys.left) dx -= 1;
  if (game.keys.right) dx += 1;
  if (game.keys.up) dy -= 1;
  if (game.keys.down) dy += 1;
  if (dx === 0 && dy === 0) {
    dx = p.facing.x;
    dy = p.facing.y;
  }
  const m = Math.hypot(dx, dy) || 1;
  p.vx += (dx / m) * 900;
  p.vy += (dy / m) * 900;
  spawnParticles(p.x, p.y, 12, p.hue);
  sfx.level();
}

function freeze() {
  const p = game.player;
  if (p.freezeCd > 0) return;
  p.freezeCd = 6;
  for (const b of game.blackHoles) b.frozen = 2.5;
  toast("زمان منجمد شد", "success");
  sfx.level();
}

function shield() {
  const p = game.player;
  if (p.shieldCd > 0) return;
  p.shieldCd = 8;
  p.shieldTime = 3;
  toast("سپر فعال شد", "success");
  sfx.level();
}

/* ------------------------------------------------------------
   ۱۵. ذرات
------------------------------------------------------------ */
function spawnParticles(x, y, count, hue) {
  const q = QUALITY[settings.quality] || QUALITY.medium;
  if (!settings.particles) count = Math.min(count, 4);
  if (game.particles.length > q.particles) return;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TWO_PI;
    const sp = rand(30, 180);
    game.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: rand(0.5, 1.1),
      maxLife: 1.1,
      r: rand(1.5, 3.5),
      hue: hue + rand(-20, 20),
    });
  }
}

/* ------------------------------------------------------------
   ۱۶. ساخت پیکسل ها و سیاه چاله ها
------------------------------------------------------------ */
function buildLevel() {
  const W = game.W, H = game.H;

  game.pixels = [];
  game.blackHoles = [];
  game.particles = [];
  game.boss = null;

  // پیکسل ها
  const count = game.player.maxCollected;
  for (let i = 0; i < count; i++) {
    spawnPixel(W, H);
  }

  // سیاه چاله ها
  if (game.mode !== "zen") {
    const bhCount = game.mode === "endless" ? 3 : 2;
    for (let i = 0; i < bhCount; i++) {
      game.blackHoles.push(makeBlackHole(W, H, 1));
    }
  }
}

function spawnPixel(W, H) {
  const pad = 60;
  const margin = 80;
  // دور از مرکز (جایی که بازیکن شروع می کنه)
  let x, y, tries = 0;
  do {
    x = rand(pad, W - pad);
    y = rand(pad, H - pad);
    tries++;
  } while (dist(x, y, W / 2, H / 2) < margin && tries < 20);

  const size = rand(6, 10);
  game.pixels.push({
    x, y,
    size,
    hue: randInt(180, 340),
    phase: Math.random() * TWO_PI,
    attracted: false,
    collected: false,
  });
}

function makeBlackHole(W, H, level) {
  const types = ["purple", "red", "green", "ice"];
  const type = types[randInt(0, Math.min(types.length - 1, Math.floor(level / 2)))] || "purple";
  const base = {
    x: rand(120, W - 120),
    y: rand(120, H - 120),
    type,
    r: 22 + Math.random() * 10,
    strength: 40,
    speed: 50,
    vx: rand(-1, 1),
    vy: rand(-1, 1),
    frozen: 0,
    phase: Math.random() * TWO_PI,
  };
  if (type === "red") { base.speed *= 1.5; base.strength *= 0.9; }
  if (type === "green") { base.strength *= 1.3; base.speed *= 0.7; }
  if (type === "ice") { base.strength *= 1.15; base.speed = 0; }

  const m = Math.hypot(base.vx, base.vy) || 1;
  base.vx = (base.vx / m) * base.speed;
  base.vy = (base.vy / m) * base.speed;
  return base;
}

/* ------------------------------------------------------------
   ۱۷. شروع بازی
------------------------------------------------------------ */
async function startGame() {
  audio.init();
  await audio.resume();

  resizeCanvas();
  buildStars();
  updateMaxSize();

  game.running = true;
  game.paused = false;
  game.gameOver = false;
  game.won = false;
  game.score = 0;
  game.level = 1;
  game.combo = 1;
  game.comboTimer = 0;
  game.elapsed = 0;
  game.startTime = nowMs();
  game.screenShake = 0;
  game.wave = 1;
  game.nextWaveAt = game.waveThreshold;

  const p = game.player;
  p.x = game.W / 2;
  p.y = game.H / 2;
  p.vx = 0; p.vy = 0;
  p.collected = 0;
  p.invulTime = 1.5;
  p.shieldTime = 0;
  p.dashCd = 0; p.freezeCd = 0; p.shieldCd = 0;
  p.hp = 3;
  p.maxHp = 3;
  p.hurtFlash = 0;
  p.facing = { x: 1, y: 0 };
  updatePlayerSize();

  buildLevel();

  if (audio.hasMusic) audio.play();

  $("menuScreen").classList.add("hide");
  $("gameScreen").classList.remove("hidden");
  hideModal("gameOverModal");
  hideModal("pauseModal");

  updateHUD();
}

/* ------------------------------------------------------------
   ۱۸. پایان بازی (برد یا باخت)
------------------------------------------------------------ */
function endGame(reason) {
  if (game.gameOver) return;
  game.gameOver = true;
  game.running = false;
  audio.stop();
  if (reason === "win") {
    game.won = true;
    sfx.win();
  } else {
    sfx.death();
  }

  const elapsed = (nowMs() - game.startTime) / 1000;
  const elapsedStr = Math.floor(elapsed) + " ثانیه";

  const isRecord = game.score > stats.highScore;
  if (isRecord) stats.highScore = game.score;
  stats.totalLumens += game.player.collected;
  stats.save();

  $("resultScore").textContent = game.score;
  $("resultLumens").textContent = game.player.collected;
  $("resultLevel").textContent = game.wave;
  $("resultTime").textContent = elapsedStr;

  if (isRecord) $("newRecord").classList.remove("hidden");
  else $("newRecord").classList.add("hidden");

  if (reason === "win") {
    $("gameOverTitle").textContent = "صفحه پر شد!";
    $("gameOverSub").textContent = "کل صفحه شد پیکسل. کارت درسته!";
  } else if (game.mode === "timeattack") {
    $("gameOverTitle").textContent = "زمان تموم شد";
    $("gameOverSub").textContent = "پیکسل هایی که جمع کردی ثبت شد";
  } else {
    $("gameOverTitle").textContent = "پیکسل هات پرید";
    $("gameOverSub").textContent = "دوباره تلاش کن";
  }

  $("highScoreDisplay").textContent = stats.highScore;
  $("totalLumensDisplay").textContent = stats.totalLumens;

  showModal("gameOverModal");
}

function togglePause() {
  if (!game.running || game.gameOver) return;
  game.paused = !game.paused;
  if (game.paused) {
    showModal("pauseModal");
    audio.stop();
  } else {
    hideModal("pauseModal");
    if (audio.hasMusic) { audio.resume(); audio.play(); }
  }
}

/* ------------------------------------------------------------
   ۱۹. HUD
------------------------------------------------------------ */
function updateHUD() {
  $("hudScore").textContent = game.score;
  $("hudLevel").textContent = game.wave;

  const p = game.player;
  const prog = clamp(p.collected / p.maxCollected, 0, 1);
  $("energyFill").style.width = (prog * 100) + "%";
  $("energyText").textContent = Math.round(prog * 100) + "%";

  let color;
  if (prog < 0.25) color = "#ffffff";
  else if (prog < 0.5) color = "#00f5ff";
  else if (prog < 0.75) color = "#8b5cf6";
  else color = "#fbbf24";
  $("energyFill").style.boxShadow = "0 0 14px " + color;

  if (game.combo > 1) {
    $("comboItem").classList.remove("hidden");
    $("hudCombo").textContent = "x" + game.combo;
  } else {
    $("comboItem").classList.add("hidden");
  }

  setCooldown("pwDashCd", p.dashCd, 1.2);
  setCooldown("pwShieldCd", p.shieldCd, 8);
  setCooldown("pwFreezeCd", p.freezeCd, 6);
}

function setCooldown(id, cd, max) {
  const el = $(id);
  if (!el) return;
  const ratio = clamp(cd / max, 0, 1);
  el.style.transform = "scaleY(" + ratio + ")";
}

/* ------------------------------------------------------------
   ۲۰. آپدیت
------------------------------------------------------------ */
function update(dt) {
  if (!game.running || game.paused || game.gameOver) return;

  game.elapsed = (nowMs() - game.startTime) / 1000;

  if (game.mode === "timeattack" && game.elapsed >= game.timeAttackLimit) {
    endGame("lose");
    return;
  }

  audio.update();
  dayNight.update(game.score);

  const p = game.player;

  // ---------- حرکت بازیکن ----------
  if (game.inputMode === "keyboard") {
    const accel = 1400;
    if (game.keys.left) p.vx -= accel * dt;
    if (game.keys.right) p.vx += accel * dt;
    if (game.keys.up) p.vy -= accel * dt;
    if (game.keys.down) p.vy += accel * dt;
  } else {
    // لمس: دنبال انگشت
    if (game.touch.active) {
      const dx = game.touch.x - p.x;
      const dy = game.touch.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 4) {
        const speed = Math.min(d * 10, 700);
        p.vx += (dx / d) * speed * dt * 6;
        p.vy += (dy / d) * speed * dt * 6;
      }
    }
  }

  // ---------- اصطکاک ----------
  const fr = Math.pow(0.0005, dt);
  p.vx *= fr;
  p.vy *= fr;

  // ---------- محدودیت سرعت ----------
  const maxSpeed = 520;
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > maxSpeed) {
    p.vx = (p.vx / sp) * maxSpeed;
    p.vy = (p.vy / sp) * maxSpeed;
  }

  // ---------- جابجایی ----------
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // ---------- facing (برای دَش) ----------
  if (Math.abs(p.vx) > 20 || Math.abs(p.vy) > 20) {
    const m = Math.hypot(p.vx, p.vy) || 1;
    p.facing.x = p.vx / m;
    p.facing.y = p.vy / m;
  }

  // ---------- برخورد با دیواره ----------
  const half = p.size / 2;
  if (p.x < half) { p.x = half; p.vx = Math.abs(p.vx) * 0.3; }
  if (p.x > game.W - half) { p.x = game.W - half; p.vx = -Math.abs(p.vx) * 0.3; }
  if (p.y < half) { p.y = half; p.vy = Math.abs(p.vy) * 0.3; }
  if (p.y > game.H - half) { p.y = game.H - half; p.vy = -Math.abs(p.vy) * 0.3; }

  // ---------- کمبو ----------
  if (game.comboTimer > 0) {
    game.comboTimer -= dt * 1000;
    if (game.comboTimer <= 0) {
      game.combo = 1;
      game.comboTimer = 0;
    }
  }

  // ---------- کول داون ----------
  if (p.dashCd > 0) p.dashCd = Math.max(0, p.dashCd - dt);
  if (p.freezeCd > 0) p.freezeCd = Math.max(0, p.freezeCd - dt);
  if (p.shieldCd > 0) p.shieldCd = Math.max(0, p.shieldCd - dt);
  if (p.shieldTime > 0) p.shieldTime = Math.max(0, p.shieldTime - dt);
  if (p.invulTime > 0) p.invulTime = Math.max(0, p.invulTime - dt);
  if (p.hurtFlash > 0) p.hurtFlash = Math.max(0, p.hurtFlash - dt);

  updateStars(dt);

  // ---------- پیکسل ها (آهنربا) ----------
  const magnetRadius = 90 + p.collected * 1.8;
  const pullSpeed = 250 + p.collected * 4;

  for (let i = game.pixels.length - 1; i >= 0; i--) {
    const px = game.pixels[i];
    px.phase += dt * 3;

    if (px.attracted) {
      const dx = p.x - px.x;
      const dy = p.y - px.y;
      const d = Math.hypot(dx, dy) || 1;
      px.x += (dx / d) * pullSpeed * dt;
      px.y += (dy / d) * pullSpeed * dt;
      // چک برخورد
      if (d < half + px.size * 0.5) {
        game.pixels.splice(i, 1);
        collectPixel(px);
        continue;
      }
    } else {
      const d = dist(p.x, p.y, px.x, px.y);
      if (d < magnetRadius) px.attracted = true;
    }
  }

  // ---------- سیاه چاله ها ----------
  for (const b of game.blackHoles) {
    if (b.frozen > 0) { b.frozen -= dt; continue; }

    // سرعت سیاه چاله با موج بیشتر می شه
    const speedMul = 1 + (game.wave - 1) * 0.15;
    b.x += b.vx * speedMul * dt;
    b.y += b.vy * speedMul * dt;

    if (b.x < 60 || b.x > game.W - 60) b.vx *= -1;
    if (b.y < 60 || b.y > game.H - 60) b.vy *= -1;
    b.x = clamp(b.x, 60, game.W - 60);
    b.y = clamp(b.y, 60, game.H - 60);

    // گرانش روی بازیکن
    if (p.shieldTime <= 0 && p.invulTime <= 0) {
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 240 && d > 1) {
        const force = (b.strength * 10) / (d * d) * 1000;
        p.vx += (dx / d) * force * dt;
        p.vy += (dy / d) * force * dt;
      }
      if (d < b.r + half) {
        // برخورد!
        p.hp--;
        p.invulTime = 1.6;
        p.hurtFlash = 0.4;
        game.screenShake = 14;
        spawnParticles(p.x, p.y, 30, 0);
        sfx.hit();

        // نصف پیکسل ها رو از دست می ده (کمی سختگیرانه)
        const lost = Math.floor(p.collected * 0.05);
        p.collected = Math.max(0, p.collected - lost);
        updatePlayerSize();

        // دور کردن بازیکن از سیاه چاله
        if (d > 0.1) {
          const push = 300;
          p.vx -= (dx / d) * push;
          p.vy -= (dy / d) * push;
        }

        toast("-1 جان", "error");

        if (p.hp <= 0) {
          endGame("lose");
          return;
        }
      }
    }
  }

  // ---------- ذرات ----------
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const pa = game.particles[i];
    pa.x += pa.vx * dt;
    pa.y += pa.vy * dt;
    pa.vx *= 0.92;
    pa.vy *= 0.92;
    pa.life -= dt;
    if (pa.life <= 0) game.particles.splice(i, 1);
  }

  // ---------- چک برد ----------
  if (game.mode !== "endless" && game.mode !== "timeattack") {
    if (p.collected >= p.maxCollected) {
      endGame("win");
      return;
    }
  }

  // ---------- حالت بی پایان و حمله زمانی: اسپاون مجدد ----------
  if ((game.mode === "endless" || game.mode === "timeattack") && game.pixels.length < 40) {
    for (let i = 0; i < 25; i++) spawnPixel(game.W, game.H);
  }

  // ---------- موج ----------
  if (p.collected >= game.nextWaveAt) {
    game.wave++;
    game.nextWaveAt += game.waveThreshold;

    // سیاه چاله جدید (حداکثر ۶)
    if (game.mode !== "zen" && game.blackHoles.length < 6) {
      game.blackHoles.push(makeBlackHole(game.W, game.H, game.wave));
    }
    toast("موج " + game.wave, "success");
    sfx.level();
  }

  if (game.screenShake > 0) {
    game.screenShake = Math.max(0, game.screenShake - dt * 40);
  }

  game.hue = (game.hue + dt * 40) % 360;
}

function collectPixel(px) {
  const p = game.player;
  p.collected++;
  updatePlayerSize();

  // امتیاز
  game.score += 10 * game.combo;

  // کمبو
  const t = nowMs();
  if (t - game.lastCollectTime < 800) {
    game.combo = Math.min(10, game.combo + 1);
  } else {
    game.combo = 1;
  }
  game.lastCollectTime = t;
  game.comboTimer = game.comboTimerMax;

  spawnParticles(px.x, px.y, 6, px.hue);
  sfx.collect();
}

/* ------------------------------------------------------------
   ۲۱. رسم
------------------------------------------------------------ */
function render() {
  const ctx = game.ctx;
  if (!ctx) return;

  const W = game.W, H = game.H;
  ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);

  let sx = 0, sy = 0;
  if (game.screenShake > 0) {
    sx = rand(-game.screenShake, game.screenShake) * 0.5;
    sy = rand(-game.screenShake, game.screenShake) * 0.5;
  }
  ctx.translate(sx, sy);

  // پس زمینه
  ctx.fillStyle = dayNight.skyColor();
  ctx.fillRect(-20, -20, W + 40, H + 40);

  drawAmbient(ctx);

  // ستاره ها
  if (settings.particles) {
    for (const s of game.stars) {
      ctx.globalAlpha = s.alpha * (dayNight.isNight() ? 1 : 0.4);
      ctx.fillStyle = "hsl(" + s.hue + ",90%,70%)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // سیاه چاله ها
  for (const b of game.blackHoles) drawBlackHole(ctx, b);

  // پیکسل ها
  for (const px of game.pixels) drawPixelItem(ctx, px);

  // ذرات
  for (const pa of game.particles) drawParticle(ctx, pa);

  // بازیکن
  drawPlayer(ctx);

  ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);

  // ویژوالایزر
  drawVisualizer();
}

function drawAmbient(ctx) {
  const night = dayNight.isNight();
  const t = nowMs() * 0.0002;
  const orbs = [
    { x: game.W * (0.3 + Math.sin(t) * 0.05), y: game.H * (0.3 + Math.cos(t * 0.8) * 0.05), c: "0,245,255" },
    { x: game.W * (0.7 + Math.cos(t * 0.9) * 0.05), y: game.H * (0.6 + Math.sin(t) * 0.05), c: "139,92,246" },
    { x: game.W * (0.5 + Math.sin(t * 1.2) * 0.06), y: game.H * (0.8 + Math.cos(t) * 0.04), c: "255,43,191" },
  ];
  const alpha = night ? 0.14 : 0.06;
  for (const o of orbs) {
    const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, 320);
    grad.addColorStop(0, "rgba(" + o.c + "," + alpha + ")");
    grad.addColorStop(1, "rgba(" + o.c + ",0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, game.W, game.H);
  }
}

function drawPixelItem(ctx, px) {
  const bob = Math.sin(px.phase) * 2;
  const x = px.x;
  const y = px.y + bob;
  const s = px.size;

  // هاله
  const grad = ctx.createRadialGradient(x, y, 0, x, y, s * 3);
  grad.addColorStop(0, "hsla(" + px.hue + ",100%,70%,0.7)");
  grad.addColorStop(0.5, "hsla(" + px.hue + ",100%,60%,0.2)");
  grad.addColorStop(1, "hsla(" + px.hue + ",100%,60%,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(x - s * 3, y - s * 3, s * 6, s * 6);

  // مربع
  ctx.fillStyle = "hsl(" + px.hue + ",100%,70%)";
  ctx.fillRect(x - s / 2, y - s / 2, s, s);

  // درخشش مرکزی
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x - s * 0.2, y - s * 0.2, s * 0.4, s * 0.4);
}

function drawBlackHole(ctx, b) {
  const r = b.r;
  let hue = 280;
  if (b.type === "red") hue = 0;
  else if (b.type === "green") hue = 140;
  else if (b.type === "ice") hue = 200;

  const grad = ctx.createRadialGradient(b.x, b.y, r * 0.8, b.x, b.y, r * 3);
  grad.addColorStop(0, "hsla(" + hue + ",90%,60%,0.7)");
  grad.addColorStop(0.5, "hsla(" + hue + ",90%,50%,0.25)");
  grad.addColorStop(1, "hsla(" + hue + ",90%,50%,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(b.x, b.y, r * 3, 0, TWO_PI);
  ctx.fill();

  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(nowMs() * 0.0008);
  ctx.strokeStyle = "hsla(" + hue + ",100%,70%,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.4, 0, Math.PI * 1.3);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(b.x, b.y, r, 0, TWO_PI);
  ctx.fill();

  if (b.frozen > 0) {
    ctx.strokeStyle = "rgba(0,245,255," + (0.5 + Math.sin(nowMs() * 0.02) * 0.3) + ")";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r + 8, 0, TWO_PI);
    ctx.stroke();
  }
}

function drawParticle(ctx, p) {
  const a = clamp(p.life / p.maxLife, 0, 1);
  ctx.fillStyle = "hsla(" + p.hue + ",100%,65%," + a + ")";
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r * a, 0, TWO_PI);
  ctx.fill();
}

function drawPlayer(ctx) {
  const p = game.player;
  const half = p.size / 2;

  // هاله بزرگ بیرونی
  const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.2);
  grad.addColorStop(0, "hsla(" + p.hue + ",100%,65%,0.5)");
  grad.addColorStop(0.4, "hsla(" + p.hue + ",100%,60%,0.15)");
  grad.addColorStop(1, "hsla(" + p.hue + ",100%,60%,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(p.x - p.size * 2.2, p.y - p.size * 2.2, p.size * 4.4, p.size * 4.4);

  // اگر سپر فعاله
  if (p.shieldTime > 0) {
    const shieldR = p.size * 0.9 + 6 + Math.sin(nowMs() * 0.008) * 3;
    ctx.strokeStyle = "rgba(0,245,255," + (0.5 + Math.sin(nowMs() * 0.01) * 0.3) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, shieldR, 0, TWO_PI);
    ctx.stroke();
  }

  // چشمک زدن وقتی آسیب دیده
  if (p.invulTime > 0) {
    const blink = Math.sin(nowMs() * 0.02) > 0;
    if (!blink) {
      ctx.globalAlpha = 0.4;
    }
  }

  // رنگ بر اساس hurtFlash
  let color;
  if (p.hurtFlash > 0) {
    color = "#ff3366";
  } else {
    color = "hsl(" + p.hue + ",100%,70%)";
  }

  // مربع اصلی
  ctx.fillStyle = color;
  ctx.fillRect(p.x - half, p.y - half, p.size, p.size);

  // درخشش مرکزی
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  const innerSize = p.size * 0.35;
  ctx.fillRect(p.x - innerSize / 2, p.y - innerSize / 2, innerSize, innerSize);

  // حاشیه روشن
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(p.x - half + 1, p.y - half + 1, p.size - 2, p.size - 2);

  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------
   ۲۲. ویژوالایزر
------------------------------------------------------------ */
function drawVisualizer() {
  if (!game.visCtx || !audio.freq) return;
  const ctx = game.visCtx;
  const W = game.visCanvas.width, H = game.visCanvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!audio.hasMusic) return;

  const bars = 48;
  const step = Math.floor(audio.freq.length / bars) || 1;
  const barW = W / bars;
  const night = dayNight.isNight();

  for (let i = 0; i < bars; i++) {
    let v = 0;
    for (let j = 0; j < step; j++) v += audio.freq[i * step + j];
    v = v / step / 255;
    const h = v * H * 0.9;
    const hue = (i / bars) * 360 + game.hue;
    const grad = ctx.createLinearGradient(0, H, 0, H - h);
    grad.addColorStop(0, "hsla(" + hue + ",100%,60%,0)");
    grad.addColorStop(1, "hsla(" + hue + ",100%,65%," + (night ? 0.9 : 0.6) + ")");
    ctx.fillStyle = grad;
    ctx.fillRect(i * barW + 1, H - h, barW - 2, h);
  }
}

/* ------------------------------------------------------------
   ۲۳. حلقه
------------------------------------------------------------ */
let lastFrame = 0;
function loop(ts) {
  if (!lastFrame) lastFrame = ts;
  const dt = Math.min((ts - lastFrame) / 1000, 0.05);
  lastFrame = ts;

  if (game.running && !game.paused && !game.gameOver) {
    update(dt);
    updateHUD();
  }

  render();
  requestAnimationFrame(loop);
}

/* ------------------------------------------------------------
   ۲۴. مودال ها
------------------------------------------------------------ */
function showModal(id) { const m = $(id); if (m) m.classList.remove("hidden"); }
function hideModal(id) { const m = $(id); if (m) m.classList.add("hidden"); }

/* ------------------------------------------------------------
   ۲۵. راه اندازی UI
------------------------------------------------------------ */
function setupUI() {
  $("btnPlay").addEventListener("click", () => startGame());

  $("btnModeSelect").addEventListener("click", () => showModal("modeModal"));

  $("btnSettings").addEventListener("click", () => {
    syncSettingsUI();
    showModal("settingsModal");
  });

  $("btnAbout").addEventListener("click", () => showModal("aboutModal"));

  $("closeMode").addEventListener("click", () => hideModal("modeModal"));

  const modeButtons = ["modeNormal", "modeZen", "modeTimeAttack", "modeEndless"];
  modeButtons.forEach((id) => {
    $(id).addEventListener("click", () => {
      const btn = $(id);
      const mode = btn.dataset.mode;
      settings.mode = mode;
      game.mode = mode;
      settings.save();
      document.querySelectorAll(".mode-card").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      const labels = { normal: "عادی", zen: "ذهن آرام", timeattack: "حمله زمانی", endless: "بی پایان" };
      $("currentModeLabel").textContent = labels[mode] || "عادی";
      hideModal("modeModal");
      toast("حالت: " + (labels[mode] || "عادی"));
    });
  });

  $("closeSettings").addEventListener("click", () => hideModal("settingsModal"));
  $("closeSettings2").addEventListener("click", () => hideModal("settingsModal"));

  const mv = $("musicVolume");
  mv.addEventListener("input", () => {
    const v = parseInt(mv.value, 10) / 100;
    $("musicVolumeLabel").textContent = mv.value;
    audio.setVolume(v);
    settings.save();
  });

  const sv = $("sfxVolume");
  sv.addEventListener("input", () => {
    settings.sfxVolume = parseInt(sv.value, 10) / 100;
    $("sfxVolumeLabel").textContent = sv.value;
    settings.save();
  });

  $("bloomToggle").addEventListener("change", (e) => {
    settings.bloom = e.target.checked;
    settings.save();
  });

  $("particlesToggle").addEventListener("change", (e) => {
    settings.particles = e.target.checked;
    settings.save();
    buildStars();
  });

  $("blurToggle").addEventListener("change", (e) => {
    settings.blur = e.target.checked;
    document.documentElement.classList.toggle("no-blur", !settings.blur);
    settings.save();
  });

  $("dayNightToggle").addEventListener("change", (e) => {
    settings.dayNight = e.target.checked;
    settings.save();
  });

  $("saveMusicToggle").addEventListener("change", (e) => {
    settings.saveMusic = e.target.checked;
    settings.save();
  });

  const qIds = { low: "qualLow", medium: "qualMedium", high: "qualHigh" };
  Object.keys(qIds).forEach((key) => {
    $(qIds[key]).addEventListener("click", () => {
      settings.quality = key;
      settings.save();
      document.querySelectorAll("#qualityChips .chip").forEach((c) => c.classList.remove("active"));
      $(qIds[key]).classList.add("active");
      applyQuality();
      toast("گرافیک: " + (key === "low" ? "کم" : key === "medium" ? "متوسط" : "زیاد"));
    });
  });

  const dropZone = $("dropZone");
  const fileInput = $("musicFileInput");

  dropZone.addEventListener("click", (e) => {
    if (e.target.tagName !== "LABEL") fileInput.click();
  });
  dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file) handleMusicFile(file);
  });
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleMusicFile(file);
  });

  $("btnClearMusic").addEventListener("click", async () => {
    audio.stop();
    audio.buffer = null;
    audio.hasMusic = false;
    await idb.del("music");
    $("musicInfo").classList.add("hidden");
    $("musicStatusLabel").textContent = "بدون موزیک";
    toast("موزیک حذف شد");
  });

  $("btnResume").addEventListener("click", () => togglePause());
  $("btnRestartFromPause").addEventListener("click", () => {
    hideModal("pauseModal");
    game.paused = false;
    startGame();
  });
  $("btnBackToMenu").addEventListener("click", () => {
    hideModal("pauseModal");
    game.paused = false;
    game.running = false;
    game.gameOver = false;
    audio.stop();
    $("gameScreen").classList.add("hidden");
    $("menuScreen").classList.remove("hide");
  });

  $("btnPlayAgain").addEventListener("click", () => {
    hideModal("gameOverModal");
    startGame();
  });
  $("btnBackToMenu2").addEventListener("click", () => {
    hideModal("gameOverModal");
    game.running = false;
    game.gameOver = false;
    audio.stop();
    $("gameScreen").classList.add("hidden");
    $("menuScreen").classList.remove("hide");
  });

  $("btnPause").addEventListener("click", () => togglePause());
  $("closeAbout").addEventListener("click", () => hideModal("aboutModal"));

  $("pwDash").addEventListener("click", () => dash());
  $("pwShield").addEventListener("click", () => shield());
  $("pwFreeze").addEventListener("click", () => freeze());
}

async function handleMusicFile(file) {
  if (!file.type.startsWith("audio/") && !file.name.match(/\.(mp3|wav|ogg|m4a|flac|aac)$/i)) {
    toast("فایل صوتی نیست", "error");
    return;
  }
  toast("در حال پردازش موزیک...");
  const ok = await audio.loadFile(file);
  if (!ok) { toast("نتونستم موزیک رو لود کنم", "error"); return; }

  if (settings.saveMusic) {
    try {
      const buf = await file.arrayBuffer();
      await idb.put("music", { data: buf, name: file.name, type: file.type });
    } catch (e) {}
  }

  $("musicName").textContent = file.name;
  $("musicSize").textContent = (file.size / 1024 / 1024).toFixed(2) + " MB";
  $("musicInfo").classList.remove("hidden");
  $("musicStatusLabel").textContent = file.name.length > 14 ? file.name.slice(0, 12) + "..." : file.name;
  toast("موزیک لود شد", "success");
  sfx.level();
}

function syncSettingsUI() {
  $("musicVolume").value = Math.round(settings.musicVolume * 100);
  $("musicVolumeLabel").textContent = Math.round(settings.musicVolume * 100);
  $("sfxVolume").value = Math.round(settings.sfxVolume * 100);
  $("sfxVolumeLabel").textContent = Math.round(settings.sfxVolume * 100);
  $("bloomToggle").checked = settings.bloom;
  $("particlesToggle").checked = settings.particles;
  $("blurToggle").checked = settings.blur;
  $("dayNightToggle").checked = settings.dayNight;
  $("saveMusicToggle").checked = settings.saveMusic;

  document.querySelectorAll("#qualityChips .chip").forEach((c) => c.classList.remove("active"));
  const map = { low: "qualLow", medium: "qualMedium", high: "qualHigh" };
  if (map[settings.quality]) $(map[settings.quality]).classList.add("active");

  document.documentElement.classList.toggle("no-blur", !settings.blur);
}

async function loadSavedMusic() {
  const saved = await idb.get("music");
  if (!saved || !saved.data) return;
  const ok = await audio.loadArrayBuffer(saved.data, saved.name);
  if (ok) {
    $("musicName").textContent = saved.name || "موزیک ذخیره شده";
    $("musicSize").textContent = ((saved.data.byteLength || 0) / 1024 / 1024).toFixed(2) + " MB";
    $("musicInfo").classList.remove("hidden");
    $("musicStatusLabel").textContent = (saved.name || "").length > 14
      ? (saved.name || "").slice(0, 12) + "..."
      : (saved.name || "موزیک");
  }
}

/* ------------------------------------------------------------
   ۲۶. راه اندازی
------------------------------------------------------------ */
async function init() {
  game.canvas = $("gameCanvas");
  game.ctx = game.canvas.getContext("2d", { alpha: false });
  game.visCanvas = $("musicVisualizer");
  game.visCtx = game.visCanvas.getContext("2d");

  settings.load();
  stats.load();
  game.mode = settings.mode || "normal";

  await idb.open();

  syncSettingsUI();
  applyQuality();
  updateMaxSize();

  const fill = $("loadingFill");
  const text = $("loadingText");
  const steps = [
    ["راه اندازی گرافیک...", 25],
    ["بارگذاری صدا...", 50],
    ["آماده سازی رابط...", 75],
    ["آماده!", 100],
  ];
  for (let i = 0; i < steps.length; i++) {
    await new Promise((r) => setTimeout(r, 240));
    fill.style.width = steps[i][1] + "%";
    text.textContent = steps[i][0];
  }

  $("highScoreDisplay").textContent = stats.highScore;
  $("totalLumensDisplay").textContent = stats.totalLumens;

  const labels = { normal: "عادی", zen: "ذهن آرام", timeattack: "حمله زمانی", endless: "بی پایان" };
  $("currentModeLabel").textContent = labels[game.mode] || "عادی";
  document.querySelectorAll(".mode-card").forEach((c) => {
    c.classList.toggle("active", c.dataset.mode === game.mode);
  });

  setupInput();
  setupUI();

  await new Promise((r) => setTimeout(r, 400));
  $("loadingScreen").classList.add("hide");

  loadSavedMusic().catch(() => {});

  requestAnimationFrame(loop);

  setTimeout(() => {
    resizeCanvas();
    buildStars();
    updateMaxSize();
  }, 100);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
  }
