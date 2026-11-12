/* MatchPoint — interface, saisie tactile et déroulement des combats.

   Déroulement d'un tour :
     idle   le joueur cherche un premier alignement
     combo  le chrono tourne ; les tuiles alignées restent en place,
            verrouillées ; chaque nouvel alignement, ou prolongement d'un
            alignement verrouillé, relance le chrono. Le combo s'arrête à la
            fin du chrono ou au premier mouvement qui n'aligne rien (ce
            mouvement reste joué)
     busy   fin du combo : les tuiles verrouillées disparaissent, la grille
            retombe (cascades comptées), les héros agissent, puis les
            ennemis ; la saisie est bloquée
     over   partie terminée */

import {
  COLS, ROWS, TYPES, colOf, rowOf, createBoard, findMatches, trySwap, forceSwap,
  lockGroups, lockedPoints, clearLocked, collapse, findMove, shuffle, isAdjacent,
  comboMultiplier, COMBO_BONUS,
} from "./engine.js";
import { HEROES, heroPower, upgradeCost, teamMaxHp, buildLevel } from "./data.js";

const SWAP_MS = 140;
const POP_MS = 260;
const FALL_MS = 340;
const COMBO_START = 4.0;  // secondes accordées après le premier alignement
const COMBO_STEP = 0.25;  // le chrono raccourcit à chaque alignement…
const COMBO_MIN = 1.8;    // …sans descendre sous ce plancher
const HINT_DELAY = 6000;

const $ = (sel) => document.querySelector(sel);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const icon = (name) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#${name}"/></svg>`;
const gem = (type) => `<div class="gem" data-type="${type}">${icon("g-" + type)}</div>`;
const fmt = (n) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/* ── Sauvegarde ──────────────────────────────────────────────────────── */

const SAVE_KEY = "matchpoint-save-v1";
const freshSave = () => ({
  coins: 0,
  level: 1, // plus haut niveau débloqué
  heroes: Object.fromEntries(TYPES.map((t) => [t, 1])),
  sound: true,
  seenHelp: false,
});

function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY)) || {};
    const base = freshSave();
    return { ...base, ...raw, heroes: { ...base.heroes, ...raw.heroes } };
  } catch {
    return freshSave();
  }
}
function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch { /* stockage indisponible (navigation privée) : on joue sans sauvegarde */ }
}

let save = loadSave();
let pickedLevel = save.level;

/* ── Sons (synthèse WebAudio, aucun fichier) ─────────────────────────── */

const sfx = (() => {
  let ctx = null;
  const ready = () => {
    if (!save.sound) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };
  const tone = (freq, dur = 0.12, { type = "triangle", vol = 0.12, delay = 0, slide = 0 } = {}) => {
    const c = ready();
    if (!c) return;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  };
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; // gamme pentatonique montante
  return {
    unlock: ready, // iOS n'autorise le son qu'après un premier toucher
    match(n) {
      const semis = SCALE[Math.min(n - 1, SCALE.length - 1)];
      tone(392 * 2 ** (semis / 12), 0.16);
      tone(784 * 2 ** (semis / 12), 0.1, { vol: 0.05, delay: 0.03 });
    },
    bad: () => tone(170, 0.12, { type: "square", vol: 0.05, slide: 0.7 }),
    hit: () => tone(230, 0.15, { type: "sawtooth", vol: 0.09, slide: 0.4 }),
    magic: () => { tone(660, 0.25, { type: "sine", slide: 2 }); tone(990, 0.2, { type: "sine", vol: 0.06, delay: 0.05, slide: 1.5 }); },
    heal: () => { tone(523, 0.12); tone(659, 0.18, { delay: 0.08 }); },
    shield: () => tone(196, 0.2, { type: "square", vol: 0.05 }),
    coin: () => { tone(988, 0.07); tone(1319, 0.15, { delay: 0.06 }); },
    hurt: () => tone(120, 0.28, { type: "sawtooth", vol: 0.13, slide: 0.5 }),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { delay: i * 0.11 })),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, { type: "sine", delay: i * 0.16 })),
  };
})();

/* ── Éléments ────────────────────────────────────────────────────────── */

const homeEl = $("#home");
const gameEl = $("#game");
const boardEl = $("#board");
const boardWrap = $("#board-wrap");
const enemiesEl = $("#enemies");
const chipsEl = $("#chips");
const comboEl = $("#combo");
const comboLabel = $("#combo-label");
const comboFill = $("#combo-fill");
const fxEl = $("#fx");
const toastEl = $("#toast");
const modalEl = $("#modal");
const pauseBtn = $("#btn-pause");

let G = null;            // partie en cours
const els = new Map();   // id de tuile → élément
const chipEls = {};      // type → puce de héros
let hintTimer = 0;
let toastTimer = 0;

function show(screen) {
  homeEl.hidden = screen !== "home";
  gameEl.hidden = screen !== "game";
}

/* ── Fenêtres ────────────────────────────────────────────────────────── */

function showModal({ title, html = "", actions }) {
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = html;
  const box = $("#modal-actions");
  box.innerHTML = "";
  for (const action of actions) {
    const btn = document.createElement("button");
    btn.className = action.primary ? "cta" : "btn2";
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      modalEl.hidden = true;
      action.run?.();
    });
    box.appendChild(btn);
  }
  modalEl.hidden = false;
}

function showHelp(then) {
  const row = (type, text) => `<li>${gem(type)}<span>${text}</span></li>`;
  showModal({
    title: "Comment jouer",
    html: `<ul class="rules">
      <li><span class="num">1</span><span>Fais glisser une tuile pour <strong>aligner 3 symboles</strong> identiques ou plus.</span></li>
      <li><span class="num">2</span><span>Le chrono démarre et les tuiles alignées restent en place, verrouillées : <strong>enchaîne les combinaisons</strong> en créant d'autres alignements ou en prolongeant un alignement existant. Le combo se termine à la fin du chrono, au premier mouvement qui n'aligne rien, ou quand tu touches le chrono.</span></li>
      <li><span class="num">3</span><span>Chaque combinaison supplémentaire ajoute <strong>+${COMBO_BONUS * 100} %</strong> à tous les effets du tour. <strong>Touche un ennemi</strong> pour le cibler ; son compteur indique dans combien de tours il attaque.</span></li>
      ${row("sword", "<strong>Chevalier</strong> — frappe la cible")}
      ${row("bow", "<strong>Archère</strong> — transperce jusqu'à l'ennemi suivant")}
      ${row("magic", "<strong>Mage</strong> — touche tous les ennemis")}
      ${row("shield", "<strong>Gardien</strong> — armure qui absorbe les coups")}
      ${row("heart", "<strong>Soigneuse</strong> — rend des points de vie")}
      ${row("coin", "<strong>Trésorier</strong> — pièces pour améliorer tes héros")}
    </ul>`,
    actions: [{ label: "Compris", primary: true, run: then }],
  });
}

/* ── Accueil ─────────────────────────────────────────────────────────── */

function renderHome() {
  $("#home-coins").textContent = save.coins;
  $("#lvl-num").textContent = pickedLevel;
  $("#lvl-prev").disabled = pickedLevel <= 1;
  $("#lvl-next").disabled = pickedLevel >= save.level;
  const def = buildLevel(pickedLevel);
  $("#lvl-info").textContent =
    `${def.waves.length} vagues${def.boss ? " · Boss" : ""} · ${def.reward} pièces`;
  $("#btn-sound").textContent = save.sound ? "Son : activé" : "Son : coupé";

  const list = $("#hero-list");
  list.innerHTML = "";
  for (const type of TYPES) {
    const level = save.heroes[type];
    const cost = upgradeCost(level);
    const row = document.createElement("div");
    row.className = "hero";
    row.innerHTML = `${gem(type)}
      <div>
        <div class="hero-name">${HEROES[type].name}<small>Niv. ${level}</small></div>
        <div class="hero-effect">${HEROES[type].effect} · ${fmt(heroPower(type, level))} par point</div>
      </div>
      <button class="buy" aria-label="Améliorer ${HEROES[type].name} pour ${cost} pièces">${icon("g-coin")}${cost}</button>`;
    const buy = row.querySelector(".buy");
    buy.disabled = save.coins < cost;
    buy.addEventListener("click", () => {
      if (save.coins < cost) return;
      save.coins -= cost;
      save.heroes[type] = level + 1;
      persist();
      sfx.coin();
      renderHome();
    });
    list.appendChild(row);
  }
}

function goHome() {
  G = null;
  clearHint();
  pickedLevel = Math.min(pickedLevel, save.level);
  renderHome();
  show("home");
}

$("#lvl-prev").addEventListener("click", () => { pickedLevel = Math.max(1, pickedLevel - 1); renderHome(); });
$("#lvl-next").addEventListener("click", () => { pickedLevel = Math.min(save.level, pickedLevel + 1); renderHome(); });
$("#btn-help").addEventListener("click", () => showHelp());
$("#btn-sound").addEventListener("click", () => { save.sound = !save.sound; persist(); renderHome(); sfx.coin(); });
$("#btn-reset").addEventListener("click", () => {
  showModal({
    title: "Tout recommencer ?",
    html: "<p>Ta progression, tes pièces et les niveaux de tes héros seront effacés.</p>",
    actions: [
      { label: "Annuler", primary: true },
      { label: "Effacer ma progression", run: () => { save = { ...freshSave(), sound: save.sound, seenHelp: true }; persist(); pickedLevel = 1; renderHome(); } },
    ],
  });
});
$("#btn-play").addEventListener("click", () => {
  sfx.unlock();
  if (save.seenHelp) return startGame(pickedLevel);
  save.seenHelp = true;
  persist();
  showHelp(() => startGame(pickedLevel));
});

/* ── Grille : affichage ──────────────────────────────────────────────── */

function setPos(el, cell, row = rowOf(cell)) {
  el.style.transform = `translate(${colOf(cell) * 100}%, ${row * 100}%)`;
}

function addTile(tile, cell, fromRow) {
  const el = document.createElement("div");
  el.className = "tile";
  el.dataset.type = tile.type;
  el.innerHTML = `<div class="gem">${icon("g-" + tile.type)}</div>`;
  setPos(el, cell, fromRow);
  boardEl.appendChild(el);
  els.set(tile.id, el);
  return el;
}

function popTile(tile, delay) {
  const el = els.get(tile.id);
  if (!el) return;
  els.delete(tile.id);
  setTimeout(() => {
    el.classList.remove("locked");
    el.classList.add("pop");
    setTimeout(() => el.remove(), POP_MS);
  }, delay);
}

function fitBoard() {
  const size = Math.floor(Math.min(boardWrap.clientWidth / COLS, boardWrap.clientHeight / ROWS));
  if (size <= 0) return;
  boardEl.style.width = `${size * COLS}px`;
  boardEl.style.height = `${size * ROWS}px`;
}
new ResizeObserver(fitBoard).observe(boardWrap);

/* Fait tomber les tuiles à leur place : `starts` donne la rangée de départ
   des tuiles qui viennent d'être créées. */
async function dropTiles(starts) {
  boardEl.classList.add("falling");
  for (const { tile, cell, fromRow } of starts) addTile(tile, cell, fromRow);
  boardEl.getBoundingClientRect(); // fige les positions de départ avant la transition
  G.grid.forEach((tile, cell) => {
    const el = tile && els.get(tile.id);
    if (el) setPos(el, cell);
  });
  await sleep(FALL_MS + 30);
  boardEl.classList.remove("falling");
}

/* ── Messages flottants ──────────────────────────────────────────────── */

function floatText(text, x, y, cls = "") {
  const el = document.createElement("div");
  el.className = `float ${cls}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  fxEl.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}
function floatOver(target, text, cls, dy = 0) {
  const r = target.getBoundingClientRect();
  floatText(text, r.left + r.width / 2, r.top + r.height / 2 + dy, cls);
}
function showToast(text) {
  clearTimeout(toastTimer);
  toastEl.textContent = text;
  toastEl.hidden = true;
  void toastEl.offsetWidth; // relance l'animation
  toastEl.hidden = false;
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 1300);
}
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/* ── Partie : mise en place ──────────────────────────────────────────── */

const blankTally = () => Object.fromEntries(TYPES.map((t) => [t, 0]));

function startGame(level) {
  const maxHp = teamMaxHp(save.heroes);
  G = {
    level,
    def: buildLevel(level),
    wave: -1,
    enemies: [],
    target: 0,
    hp: maxHp,
    maxHp,
    armor: 0,
    maxArmor: Math.round(maxHp * 0.4),
    grid: createBoard(),
    phase: "busy",
    paused: false,
    combo: { count: 0, remaining: 0, total: 1 },
    maxCombo: 0,
    tally: blankTally(),
    runCoins: 0,
    selected: -1,
  };
  show("game");
  boardEl.innerHTML = "";
  els.clear();
  fxEl.innerHTML = "";
  toastEl.hidden = true;
  fitBoard();

  chipsEl.innerHTML = "";
  for (const type of TYPES) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `${gem(type)}<b></b>`;
    chipsEl.appendChild(chip);
    chipEls[type] = chip;
  }

  $("#hud-level").textContent = `Niveau ${level}`;
  spawnWave();
  updateTeam();
  updateChips();
  updateCoins();

  const game = G;
  dropTiles(G.grid.map((tile, cell) => ({ tile, cell, fromRow: rowOf(cell) - ROWS }))).then(() => {
    if (G !== game) return;
    G.phase = "idle";
    updateCombo();
    scheduleHint();
  });
  updateCombo();
}

function spawnWave() {
  G.wave++;
  G.enemies = G.def.waves[G.wave].map((e) => ({ ...e, maxHp: e.hp, cdMax: e.cd, cd: e.first }));
  G.target = 0;
  $("#hud-wave").textContent = `Vague ${G.wave + 1} / ${G.def.waves.length}`;

  enemiesEl.innerHTML = "";
  G.enemies.forEach((enemy, i) => {
    const card = document.createElement("button");
    card.className = `enemy${enemy.boss ? " boss" : ""}`;
    card.innerHTML = `<span class="cd">${icon("i-clock")}<b></b></span>
      <span class="face">${enemy.icon}</span>
      <span class="ename">${enemy.name}</span>
      <span class="ehp"><i></i></span>
      <span class="ehp-num"></span>`;
    card.addEventListener("click", () => {
      if (!G || enemy.hp <= 0) return;
      G.target = i;
      markTarget();
    });
    enemy.el = card;
    enemiesEl.appendChild(card);
    updateEnemy(enemy);
  });
  markTarget();
}

/* ── Partie : mises à jour d'affichage ───────────────────────────────── */

function updateEnemy(enemy) {
  const el = enemy.el;
  el.querySelector(".ehp i").style.width = `${(enemy.hp / enemy.maxHp) * 100}%`;
  el.querySelector(".ehp-num").textContent = enemy.hp;
  el.querySelector(".cd b").textContent = enemy.cd;
  el.classList.toggle("soon", enemy.cd <= 1);
  el.classList.toggle("dead", enemy.hp <= 0);
  el.setAttribute("aria-label", `${enemy.name}, ${enemy.hp} points de vie, attaque dans ${enemy.cd} tour(s)`);
}

/* Ennemi ciblé ; si la cible est morte, on passe au premier survivant. */
function currentTarget() {
  let enemy = G.enemies[G.target];
  if (!enemy || enemy.hp <= 0) {
    G.target = G.enemies.findIndex((e) => e.hp > 0);
    enemy = G.enemies[G.target];
    markTarget();
  }
  return enemy;
}
function markTarget() {
  G.enemies.forEach((e, i) => e.el.classList.toggle("target", i === G.target && e.hp > 0));
}

function updateTeam() {
  $("#hp-fill").style.transform = `scaleX(${G.hp / G.maxHp})`;
  $("#hp-text").textContent = `${G.hp} / ${G.maxHp}`;
  $("#armor-num").textContent = G.armor;
  $("#armor").classList.toggle("on", G.armor > 0);
}
function updateCoins() {
  $("#hud-coins").textContent = save.coins + G.runCoins;
}
function updateChips() {
  for (const type of TYPES) {
    const pts = G.tally[type];
    chipEls[type].classList.toggle("on", pts > 0);
    chipEls[type].querySelector("b").textContent = pts > 0 ? pts : "";
  }
}
function updateCombo(bump = false) {
  const { count } = G.combo;
  const live = G.phase === "combo";
  comboEl.classList.toggle("live", live || (G.phase === "busy" && count > 0));
  if (G.phase === "idle") comboLabel.textContent = "À toi de jouer";
  else if (count > 1) comboLabel.textContent = `Combo ×${count} · effets ×${fmt(comboMultiplier(count))}`;
  else if (count === 1) comboLabel.textContent = "Enchaîne !";
  else comboLabel.textContent = "";
  if (!live) comboFill.style.transform = "scaleX(0)";
  if (bump) replay(comboLabel, "bump");
  pauseBtn.disabled = G.phase === "busy";
}

/* ── Indice : montre un coup après quelques secondes d'inactivité ────── */

function clearHint() {
  clearTimeout(hintTimer);
  for (const el of boardEl.querySelectorAll(".hint")) el.classList.remove("hint");
}
function scheduleHint() {
  clearHint();
  const game = G;
  hintTimer = setTimeout(() => {
    if (G !== game || G.phase !== "idle" || G.paused) return;
    const move = findMove(G.grid);
    if (!move) return;
    for (const cell of move) els.get(G.grid[cell]?.id)?.classList.add("hint");
  }, HINT_DELAY);
}

/* ── Saisie : glisser une tuile, ou toucher deux cases voisines ──────── */

let drag = null;
const canPlay = () => G && !G.paused && (G.phase === "idle" || G.phase === "combo");

function cellAt(event) {
  const r = boardEl.getBoundingClientRect();
  const c = Math.min(COLS - 1, Math.max(0, Math.floor(((event.clientX - r.left) / r.width) * COLS)));
  const row = Math.min(ROWS - 1, Math.max(0, Math.floor(((event.clientY - r.top) / r.height) * ROWS)));
  return row * COLS + c;
}

function select(cell) {
  for (const el of boardEl.querySelectorAll(".sel")) el.classList.remove("sel");
  G.selected = cell;
  if (cell >= 0) els.get(G.grid[cell]?.id)?.classList.add("sel");
}

boardEl.addEventListener("pointerdown", (event) => {
  sfx.unlock();
  if (!canPlay()) return;
  event.preventDefault();
  drag = { cell: cellAt(event), x: event.clientX, y: event.clientY };
  try { boardEl.setPointerCapture(event.pointerId); } catch { /* pointeur déjà relâché */ }
});

boardEl.addEventListener("pointermove", (event) => {
  if (!drag || !canPlay()) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  const threshold = (boardEl.clientWidth / COLS) * 0.33;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
  const from = drag.cell;
  drag = null;
  if (!G.grid[from]) return; // on ne « tire » pas un trou
  let c = colOf(from);
  let r = rowOf(from);
  if (Math.abs(dx) > Math.abs(dy)) c += Math.sign(dx);
  else r += Math.sign(dy);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
  attemptSwap(from, r * COLS + c);
});

boardEl.addEventListener("pointerup", () => {
  if (!drag) return;
  const cell = drag.cell;
  drag = null;
  if (!canPlay()) return;
  if (G.selected >= 0 && G.selected !== cell && isAdjacent(G.selected, cell)) attemptSwap(G.selected, cell);
  else if (G.selected === cell || !G.grid[cell] || G.grid[cell].locked) select(-1);
  else select(cell);
});
boardEl.addEventListener("pointercancel", () => { drag = null; });

function attemptSwap(a, b) {
  const ta = G.grid[a];
  const tb = G.grid[b];
  // Une tuile verrouillée ne bouge pas : le geste est ignoré, sans mettre
  // fin au combo (ce n'est pas un mouvement raté, juste un toucher sans effet).
  if (ta?.locked || tb?.locked) return;
  clearHint();
  select(-1);
  const groups = trySwap(G.grid, a, b);
  if (ta) setPos(els.get(ta.id), b);
  if (tb) setPos(els.get(tb.id), a);

  if (!groups) {
    sfx.bad();
    // En plein combo, un mouvement qui n'aligne rien reste joué (les tuiles
    // gardent leur nouvelle place) et met fin au combo.
    if (G.phase === "combo") {
      forceSwap(G.grid, a, b);
      endCombo();
      return;
    }
    // Premier mouvement du tour : il est annulé, les tuiles reviennent.
    const game = G;
    setTimeout(() => {
      if (G !== game) return;
      for (const tile of [ta, tb]) {
        const cell = tile ? G.grid.indexOf(tile) : -1;
        const el = tile && els.get(tile.id);
        if (cell >= 0 && el) setPos(el, cell);
      }
    }, SWAP_MS + 20);
    scheduleHint();
    return;
  }

  if (G.phase === "idle") {
    G.phase = "combo";
    G.combo.count = 0;
  }
  scoreGroups(groups, SWAP_MS);
  const time = Math.max(COMBO_MIN, COMBO_START - COMBO_STEP * (G.combo.count - 1));
  G.combo.total = time;
  G.combo.remaining = time;
}

function endCombo() {
  if (G.phase !== "combo") return;
  G.phase = "busy";
  resolveTurn(G);
}

/* Fin du combo : fait disparaître toutes les tuiles verrouillées, en vague.
   Renvoie la durée de l'animation. */
function popLocked() {
  const tiles = clearLocked(G.grid);
  const stagger = tiles.length ? Math.min(22, 330 / tiles.length) : 0;
  tiles.forEach((tile, i) => popTile(tile, i * stagger));
  return tiles.length ? tiles.length * stagger + POP_MS : 0;
}

/* Compte les alignements (nouveaux ou prolongés) dans le tour et verrouille
   leurs tuiles, qui restent en place jusqu'à la fin du combo. Chaque groupe
   compte pour une combinaison ; les points gagnés sont la différence de
   valeur des alignements verrouillés avant et après (prolonger un alignement
   de 3 en 4 rapporte donc la différence entre les deux). */
function scoreGroups(groups, delay) {
  const before = lockedPoints(G.grid);
  const cells = lockGroups(G.grid, groups);
  const after = lockedPoints(G.grid);

  for (const cell of cells) {
    const el = els.get(G.grid[cell].id);
    setTimeout(() => el.classList.add("locked"), delay); // après la fin du glissement
  }
  for (let i = 0; i < groups.length; i++) {
    G.combo.count++;
    sfx.match(G.combo.count);
  }
  G.maxCombo = Math.max(G.maxCombo, G.combo.count);

  const board = boardEl.getBoundingClientRect();
  const size = board.width / COLS;
  for (const type of TYPES) {
    const pts = after[type] - before[type];
    if (pts <= 0) continue;
    G.tally[type] += pts;
    // Le gain s'affiche au-dessus des tuiles qui viennent d'être verrouillées.
    const mine = cells.filter((cell) => G.grid[cell].type === type);
    const x = board.left + (mine.reduce((s, c) => s + colOf(c), 0) / mine.length + 0.5) * size;
    const y = board.top + (mine.reduce((s, c) => s + rowOf(c), 0) / mine.length + 0.5) * size;
    setTimeout(() => floatText(`+${pts}`, x, y, "pts"), delay);
  }
  updateChips();
  updateCombo(true);
}

/* ── Chrono du combo ─────────────────────────────────────────────────── */

/* Le chrono avance à l'horloge : chaque image le fait progresser pour une
   barre fluide, et un minuteur prend le relais si le navigateur suspend les
   images (onglet en arrière-plan), pour qu'un combo ne reste jamais figé. */
let lastTick = performance.now();
function tick() {
  const now = performance.now();
  const dt = Math.min(0.25, (now - lastTick) / 1000);
  lastTick = now;
  if (!G || G.phase !== "combo" || G.paused) return;
  G.combo.remaining -= dt;
  comboFill.style.transform = `scaleX(${Math.max(0, G.combo.remaining / G.combo.total)})`;
  if (G.combo.remaining <= 0) endCombo();
}
// Toucher le chrono termine le combo tout de suite (plus rien à aligner).
comboEl.addEventListener("click", () => {
  if (G && G.phase === "combo" && !G.paused) G.combo.remaining = 0;
});

function frame() {
  tick();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(tick, 100);

/* ── Fin de tour ─────────────────────────────────────────────────────── */

async function resolveTurn(game) {
  const gone = () => G !== game;
  drag = null;
  select(-1);
  updateCombo();
  await sleep(2 * SWAP_MS + 60); // laisse finir le dernier glissement (aller-retour si refusé)
  if (gone()) return;

  // Tous les alignements du combo disparaissent ensemble, puis la grille
  // retombe ; les alignements créés par la chute s'ajoutent au tour.
  for (;;) {
    await sleep(popLocked() + 40);
    if (gone()) return;
    const { spawns } = collapse(G.grid);
    await dropTiles(spawns.map((s) => ({ tile: s.tile, cell: s.to, fromRow: rowOf(s.to) - s.drop })));
    if (gone()) return;
    const groups = findMatches(G.grid);
    if (!groups.length) break;
    scoreGroups(groups, 0);
    await sleep(240); // montre un instant la cascade verrouillée avant de la retirer
    if (gone()) return;
  }

  await heroesAct();
  if (gone()) return;

  if (!G.enemies.some((e) => e.hp > 0)) {
    await sleep(450);
    if (gone()) return;
    if (G.wave + 1 >= G.def.waves.length) return finish(true);
    spawnWave();
    showToast(`Vague ${G.wave + 1}`);
  } else {
    await enemiesAct();
    if (gone()) return;
    if (G.hp <= 0) {
      await sleep(350);
      if (gone()) return;
      return finish(false);
    }
  }

  G.combo.count = 0;
  G.tally = blankTally();
  updateChips();

  if (!findMove(G.grid)) {
    shuffle(G.grid);
    showToast("Mélange !");
    G.grid.forEach((tile) => {
      const el = els.get(tile.id);
      el.dataset.type = tile.type;
      el.querySelector("use").setAttribute("href", `#g-${tile.type}`);
    });
    await dropTiles([]);
    if (gone()) return;
  }

  G.phase = "idle";
  updateCombo();
  scheduleHint();
}

async function heroesAct() {
  const mult = comboMultiplier(G.combo.count);
  for (const type of TYPES) {
    const pts = G.tally[type];
    if (!pts) continue;
    const attack = type === "sword" || type === "bow" || type === "magic";
    if (attack && !currentTarget()) continue; // plus personne à frapper
    const amount = Math.max(1, Math.round(pts * heroPower(type, save.heroes[type]) * mult));
    const chip = chipEls[type];
    chip.classList.add("fire");

    if (type === "sword") {
      damage(currentTarget(), amount);
      sfx.hit();
    } else if (type === "bow") {
      // Perforant : ce qui dépasse les PV de la cible continue sur l'ennemi suivant.
      let rest = amount;
      for (let enemy = currentTarget(); enemy && rest > 0; enemy = currentTarget()) {
        const dealt = Math.min(enemy.hp, rest);
        damage(enemy, dealt);
        rest -= dealt;
      }
      sfx.hit();
    } else if (type === "magic") {
      for (const enemy of G.enemies) if (enemy.hp > 0) damage(enemy, amount);
      sfx.magic();
    } else if (type === "shield") {
      const gained = Math.min(G.maxArmor, G.armor + amount) - G.armor;
      G.armor += gained;
      floatOver($("#armor"), gained ? `+${gained}` : "Max", "shield", -16);
      sfx.shield();
    } else if (type === "heart") {
      const healed = Math.min(G.maxHp, G.hp + amount) - G.hp;
      G.hp += healed;
      floatOver($("#team"), healed ? `+${healed}` : "PV max", "heal", -16);
      sfx.heal();
    } else {
      G.runCoins += amount;
      floatOver(chip, `+${amount}`, "coin", -30);
      updateCoins();
      sfx.coin();
    }
    updateTeam();
    await sleep(380);
    chip.classList.remove("fire");
  }
}

function damage(enemy, amount) {
  enemy.hp = Math.max(0, enemy.hp - amount);
  updateEnemy(enemy);
  replay(enemy.el, "hit");
  floatOver(enemy.el, `-${amount}`, "dmg", -10);
  if (enemy.hp <= 0) markTarget();
}

async function enemiesAct() {
  for (const enemy of G.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.cd--;
    updateEnemy(enemy);
    if (enemy.cd > 0) continue;

    replay(enemy.el, "attack");
    await sleep(200);
    const blocked = Math.min(G.armor, enemy.atk);
    const dealt = enemy.atk - blocked;
    G.armor -= blocked;
    G.hp = Math.max(0, G.hp - dealt);
    updateTeam();
    sfx.hurt();
    if (dealt) {
      replay(gameEl, "hurt");
      floatOver($("#team"), `-${dealt}`, "hurt", -16);
    } else {
      floatOver($("#armor"), "Bloqué", "shield", -16);
    }
    await sleep(420);
    enemy.cd = enemy.cdMax;
    updateEnemy(enemy);
    if (G.hp <= 0) return;
  }
  await sleep(120);
}

/* ── Fin de partie, pause ────────────────────────────────────────────── */

function finish(won) {
  const { level, runCoins, def, maxCombo } = G;
  G.phase = "over";
  clearHint();
  const gain = won ? runCoins + def.reward : Math.floor(runCoins / 2);
  save.coins += gain;
  if (won && level >= save.level) save.level = level + 1;
  persist();
  const coins = `<p class="big">${icon("g-coin")}+${gain}</p>`;

  if (won) {
    sfx.win();
    pickedLevel = level + 1;
    showModal({
      title: "Victoire !",
      html: `<p>Niveau ${level} terminé · meilleur combo ×${maxCombo}</p>${coins}`,
      actions: [
        { label: `Niveau ${level + 1}`, primary: true, run: () => startGame(level + 1) },
        { label: "Améliorer mes héros", run: goHome },
      ],
    });
  } else {
    sfx.lose();
    pickedLevel = level;
    showModal({
      title: "Défaite…",
      html: `<p>Ton équipe est tombée à la vague ${G.wave + 1}. Tu gardes la moitié des pièces récoltées.</p>${coins}`,
      actions: [
        { label: "Réessayer", primary: true, run: () => startGame(level) },
        { label: "Améliorer mes héros", run: goHome },
      ],
    });
  }
}

function pause() {
  if (!G || G.paused || G.phase === "busy" || G.phase === "over") return;
  G.paused = true;
  drag = null;
  const game = G;
  showModal({
    title: "Pause",
    actions: [
      { label: "Reprendre", primary: true, run: () => { game.paused = false; if (G === game && G.phase === "idle") scheduleHint(); } },
      { label: save.sound ? "Couper le son" : "Activer le son", run: () => { save.sound = !save.sound; persist(); game.paused = false; pause(); } },
      { label: "Abandonner la partie", run: goHome },
    ],
  });
}
pauseBtn.addEventListener("click", pause);
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });

/* ── Démarrage ───────────────────────────────────────────────────────── */

// iOS : empêche le zoom par pincement de casser la mise en page du jeu.
document.addEventListener("gesturestart", (event) => event.preventDefault());

renderHome();
show("home");

// Hors-ligne : le service worker n'est pas enregistré en développement local,
// pour toujours servir les fichiers à jour.
const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
if ("serviceWorker" in navigator && location.protocol === "https:" && !local) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
