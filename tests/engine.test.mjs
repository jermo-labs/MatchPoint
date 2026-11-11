import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLS, ROWS, TYPES, idx, makeTile, createBoard, findMatches, trySwap,
  clearGroups, collapse, findMove, shuffle, groupPoints, comboMultiplier,
} from "../js/engine.js";

/* Générateur déterministe pour des tests reproductibles. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Construit une grille à partir de lignes de lettres ('.' = trou). */
const LETTERS = { s: "sword", b: "bow", m: "magic", h: "shield", c: "heart", o: "coin" };
function grid(rows) {
  assert.equal(rows.length, ROWS);
  const g = [];
  for (const row of rows) {
    assert.equal(row.length, COLS);
    for (const ch of row) g.push(ch === "." ? null : makeTile(LETTERS[ch]));
  }
  return g;
}

/* Grille sans aucun alignement ni coup évident, servant de fond neutre. */
const QUIET = [
  "sbmhcos",
  "bmhcosb",
  "mhcosbm",
  "hcosbmh",
  "cosbmhc",
  "osbmhco",
];

test("createBoard : grille pleine, sans alignement, avec un coup jouable", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const g = createBoard(seeded(seed));
    assert.equal(g.length, COLS * ROWS);
    assert.ok(g.every((t) => t && TYPES.includes(t.type)));
    assert.equal(findMatches(g).length, 0);
    assert.ok(findMove(g));
  }
});

test("findMatches : fond neutre sans alignement", () => {
  assert.equal(findMatches(grid(QUIET)).length, 0);
});

test("findMatches : ligne horizontale de 3", () => {
  const rows = [...QUIET];
  rows[0] = "sssbcos".replace("sssb", "sssh");
  const groups = findMatches(grid(rows));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].type, "sword");
  assert.deepEqual(groups[0].cells, [0, 1, 2]);
});

test("findMatches : colonne de 4", () => {
  const g = grid(QUIET);
  for (let r = 1; r <= 4; r++) g[idx(6, r)] = makeTile("coin");
  // Neutralise les voisins qui pourraient prolonger l'alignement.
  g[idx(6, 0)] = makeTile("sword");
  g[idx(6, 5)] = makeTile("sword");
  const groups = findMatches(g).filter((x) => x.type === "coin");
  assert.equal(groups.length, 1);
  assert.equal(groups[0].cells.length, 4);
});

test("findMatches : un L fusionne en un seul groupe de 5", () => {
  const g = grid(QUIET);
  for (const c of [0, 1, 2]) g[idx(c, 5)] = makeTile("magic");
  for (const r of [3, 4]) g[idx(0, r)] = makeTile("magic");
  // Le fond neutre a déjà un 'magic' au bout de chaque branche : on les écarte.
  g[idx(3, 5)] = makeTile("coin");
  g[idx(0, 2)] = makeTile("sword");
  const groups = findMatches(g).filter((x) => x.type === "magic");
  assert.equal(groups.length, 1);
  assert.equal(groups[0].cells.length, 5);
});

test("trySwap : un échange valide renvoie le groupe et modifie la grille", () => {
  const rows = [...QUIET];
  rows[0] = "sshscos"; // le 's' en colonne 3 glisse à gauche → sss
  const g = grid(rows);
  g[idx(2, 1)] = makeTile("bow"); // évite un alignement vertical parasite
  const moved = g[3];
  const groups = trySwap(g, 2, 3);
  assert.ok(groups);
  assert.equal(groups[0].type, "sword");
  assert.equal(g[2], moved);
});

test("trySwap : un échange sans alignement laisse la grille intacte", () => {
  const g = grid(QUIET);
  const before = [...g];
  assert.equal(trySwap(g, 0, 1), null);
  assert.deepEqual(g, before);
});

test("trySwap : refuse les cases non voisines et hors grille", () => {
  const g = grid(QUIET);
  assert.equal(trySwap(g, 0, 2), null);
  assert.equal(trySwap(g, 0, COLS + 1), null);
  assert.equal(trySwap(g, 6, 7), null); // fin de ligne → début de la suivante
  assert.equal(trySwap(g, 0, -1), null);
});

test("trySwap : une tuile peut glisser dans un trou pour s'aligner", () => {
  const rows = [...QUIET];
  rows[0] = "ss.scos";
  const g = grid(rows);
  const groups = trySwap(g, 3, 2);
  assert.ok(groups);
  assert.deepEqual(groups[0].cells, [0, 1, 2]);
  assert.equal(g[3], null);
});

test("clearGroups puis collapse : la grille est de nouveau pleine", () => {
  const rows = [...QUIET];
  rows[5] = "ooohhco".replace("hh", "hs");
  const g = grid(rows);
  const groups = findMatches(g);
  assert.ok(groups.length >= 1);
  const removed = clearGroups(g, groups);
  assert.ok(removed.length >= 3);
  assert.ok(g.some((t) => t === null));
  const { moves, spawns } = collapse(g, seeded(7));
  assert.ok(g.every(Boolean));
  assert.equal(spawns.length, removed.length);
  assert.ok(moves.length > 0);
  for (const m of moves) assert.equal(g[m.to], m.tile);
  for (const s of spawns) assert.equal(g[s.to], s.tile);
});

test("collapse : les tuiles gardent leur ordre vertical dans la colonne", () => {
  const g = grid(QUIET);
  const column = [0, 1, 2, 3, 4, 5].map((r) => g[idx(0, r)]);
  g[idx(0, 2)] = null;
  g[idx(0, 4)] = null;
  const { spawns } = collapse(g, seeded(3));
  const survivors = [column[0], column[1], column[3], column[5]];
  assert.deepEqual([2, 3, 4, 5].map((r) => g[idx(0, r)]), survivors);
  assert.equal(spawns.filter((s) => s.to % COLS === 0).length, 2);
  assert.ok(spawns.every((s) => s.drop === 2));
});

test("findMove : détecte un coup, et son absence", () => {
  assert.equal(findMove(grid(QUIET)), null);
  const rows = [...QUIET];
  rows[0] = "sshscos";
  const g = grid(rows);
  const move = findMove(g);
  assert.ok(move);
  assert.ok(trySwap(g, move[0], move[1]));
});

test("shuffle : conserve les tuiles, sans alignement, avec un coup jouable", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = createBoard(seeded(seed));
    const ids = g.map((t) => t.id).sort((a, b) => a - b);
    shuffle(g, seeded(seed + 100));
    assert.deepEqual(g.map((t) => t.id).sort((a, b) => a - b), ids);
    assert.equal(findMatches(g).length, 0);
    assert.ok(findMove(g));
  }
});

test("shuffle : débloque une grille sans coup possible", () => {
  const g = grid(QUIET);
  shuffle(g, seeded(42));
  assert.equal(findMatches(g).length, 0);
  assert.ok(findMove(g));
});

test("barème : points par alignement et multiplicateur de combo", () => {
  assert.equal(groupPoints(3), 3);
  assert.equal(groupPoints(4), 6);
  assert.equal(groupPoints(5), 10);
  assert.equal(comboMultiplier(1), 1);
  assert.ok(Math.abs(comboMultiplier(3) - 1.3) < 1e-9);
});
