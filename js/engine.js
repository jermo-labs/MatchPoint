/* Moteur match-3 — logique pure, sans DOM (testable avec `node --test`).

   La grille est un tableau à plat de COLS × ROWS cases, chacune contenant
   soit une tuile { id, type }, soit null (un trou laissé par un alignement
   pendant un combo). Invariant : au repos, la grille ne contient aucun
   alignement — tout alignement est retiré dès qu'il apparaît. */

export const COLS = 7;
export const ROWS = 6;
export const TYPES = ["sword", "bow", "magic", "shield", "heart", "coin"];

/* Fréquence relative de chaque symbole : l'attaque sort un peu plus souvent
   que le soutien, pour que les combats avancent. */
const WEIGHTS = { sword: 1, bow: 1, magic: 1, shield: 0.85, heart: 0.85, coin: 0.7 };

let nextId = 1;

export const idx = (c, r) => r * COLS + c;
export const colOf = (i) => i % COLS;
export const rowOf = (i) => Math.floor(i / COLS);

export function makeTile(type) {
  return { id: nextId++, type };
}

export function randomType(rng = Math.random, exclude = null) {
  const pool = exclude ? TYPES.filter((t) => !exclude.has(t)) : TYPES;
  let total = 0;
  for (const t of pool) total += WEIGHTS[t];
  let x = rng() * total;
  for (const t of pool) {
    x -= WEIGHTS[t];
    if (x <= 0) return t;
  }
  return pool[pool.length - 1];
}

/* Grille de départ : aucun alignement déjà formé, au moins un coup jouable. */
export function createBoard(rng = Math.random) {
  for (;;) {
    const g = new Array(COLS * ROWS).fill(null);
    for (let i = 0; i < g.length; i++) {
      const c = colOf(i);
      const r = rowOf(i);
      const exclude = new Set();
      if (c >= 2 && g[i - 1].type === g[i - 2].type) exclude.add(g[i - 1].type);
      if (r >= 2 && g[i - COLS].type === g[i - 2 * COLS].type) exclude.add(g[i - COLS].type);
      g[i] = makeTile(randomType(rng, exclude));
    }
    if (findMove(g)) return g;
  }
}

/* Renvoie les alignements de 3+ sous forme de groupes { type, cells }.
   Deux lignes qui se croisent (formes en L, T, +) fusionnent en un groupe. */
export function findMatches(g) {
  const runs = [];
  const scan = (length, count, at) => {
    for (let line = 0; line < count; line++) {
      let start = 0;
      while (start < length) {
        const tile = g[at(line, start)];
        let end = start + 1;
        if (tile) {
          while (end < length && g[at(line, end)]?.type === tile.type) end++;
          if (end - start >= 3) {
            const cells = [];
            for (let k = start; k < end; k++) cells.push(at(line, k));
            runs.push(cells);
          }
        }
        start = end;
      }
    }
  };
  scan(COLS, ROWS, (r, c) => idx(c, r)); // lignes
  scan(ROWS, COLS, (c, r) => idx(c, r)); // colonnes
  if (!runs.length) return [];

  // Union-find sur les lignes qui partagent une case.
  const parent = runs.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const owner = new Map();
  runs.forEach((cells, ri) => {
    for (const cell of cells) {
      if (owner.has(cell)) parent[find(ri)] = find(owner.get(cell));
      else owner.set(cell, ri);
    }
  });

  const groups = new Map();
  runs.forEach((cells, ri) => {
    const root = find(ri);
    if (!groups.has(root)) groups.set(root, new Set());
    for (const cell of cells) groups.get(root).add(cell);
  });
  return [...groups.values()].map((set) => {
    const cells = [...set].sort((a, b) => a - b);
    return { type: g[cells[0]].type, cells };
  });
}

export function isAdjacent(a, b) {
  return Math.abs(colOf(a) - colOf(b)) + Math.abs(rowOf(a) - rowOf(b)) === 1;
}

function swapCells(g, a, b) {
  const t = g[a];
  g[a] = g[b];
  g[b] = t;
}

/* Tente l'échange de deux cases voisines. L'une des deux peut être un trou
   (on glisse alors la tuile dans l'espace libre). Si l'échange ne crée aucun
   alignement, la grille est laissée intacte et la fonction renvoie null. */
export function trySwap(g, a, b) {
  if (a < 0 || b < 0 || a >= g.length || b >= g.length) return null;
  if (!isAdjacent(a, b)) return null;
  if (!g[a] && !g[b]) return null;
  swapCells(g, a, b);
  const groups = findMatches(g);
  if (!groups.length) {
    swapCells(g, a, b);
    return null;
  }
  return groups;
}

/* Retire les tuiles des groupes ; renvoie les tuiles retirées. */
export function clearGroups(g, groups) {
  const removed = [];
  for (const group of groups) {
    for (const cell of group.cells) {
      if (g[cell]) {
        removed.push(g[cell]);
        g[cell] = null;
      }
    }
  }
  return removed;
}

/* Gravité puis remplissage. Renvoie ce qu'il faut animer :
   moves  = tuiles existantes qui descendent  { tile, from, to }
   spawns = nouvelles tuiles                   { tile, to, drop }
   (`drop` = nombre de cases créées dans la colonne : la tuile part de
   `drop` rangées au-dessus de sa case d'arrivée.) */
export function collapse(g, rng = Math.random) {
  const moves = [];
  const spawns = [];
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      const from = idx(c, r);
      const tile = g[from];
      if (!tile) continue;
      const to = idx(c, write);
      if (to !== from) {
        g[to] = tile;
        g[from] = null;
        moves.push({ tile, from, to });
      }
      write--;
    }
    const drop = write + 1;
    for (let r = write; r >= 0; r--) {
      const tile = makeTile(randomType(rng));
      g[idx(c, r)] = tile;
      spawns.push({ tile, to: idx(c, r), drop });
    }
  }
  return { moves, spawns };
}

/* Premier échange jouable trouvé, sous la forme [a, b], ou null. */
export function findMove(g) {
  for (let i = 0; i < g.length; i++) {
    const neighbours = [];
    if (colOf(i) < COLS - 1) neighbours.push(i + 1);
    if (rowOf(i) < ROWS - 1) neighbours.push(i + COLS);
    for (const j of neighbours) {
      if (!g[i] && !g[j]) continue;
      swapCells(g, i, j);
      const ok = findMatches(g).length > 0;
      swapCells(g, i, j);
      if (ok) return [i, j];
    }
  }
  return null;
}

/* Mélange les tuiles en place (mêmes objets, donc mêmes éléments à l'écran)
   jusqu'à obtenir une grille sans alignement et avec un coup jouable. */
export function shuffle(g, rng = Math.random) {
  for (let attempt = 0; attempt < 200; attempt++) {
    for (let i = g.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      swapCells(g, i, j);
    }
    if (!findMatches(g).length && findMove(g)) return g;
  }
  // Répartition des symboles trop déséquilibrée : on retire des types neufs.
  const fresh = createBoard(rng);
  for (let i = 0; i < g.length; i++) g[i].type = fresh[i].type;
  return g;
}

/* Points rapportés par un alignement de n tuiles : les grands alignements
   valent plus que la somme de leurs tuiles. */
export function groupPoints(n) {
  if (n >= 5) return n * 2;
  if (n === 4) return 6;
  return n;
}

/* Multiplicateur appliqué à tout le tour selon le nombre d'alignements. */
export function comboMultiplier(count) {
  return 1 + 0.15 * Math.max(0, count - 1);
}
