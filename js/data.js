/* Données de jeu : héros (un par symbole), bestiaire et génération des niveaux.
   Logique pure, sans DOM. */

/* Un héros par symbole. `base` = effet par point d'alignement au niveau 1. */
export const HEROES = {
  sword:  { name: "Chevalier", effect: "Frappe l'ennemi ciblé",                 base: 6 },
  bow:    { name: "Archère",   effect: "Transperce jusqu'à l'ennemi suivant",   base: 4 },
  magic:  { name: "Mage",      effect: "Touche tous les ennemis",               base: 3 },
  shield: { name: "Gardien",   effect: "Armure, réduite de moitié à chaque tour", base: 2 },
  heart:  { name: "Soigneuse", effect: "Rend des points de vie",                base: 4 },
  coin:   { name: "Trésorier", effect: "Récolte des pièces",                    base: 1 },
};

/* +20 % d'effet par niveau de héros. */
export function heroPower(type, level) {
  return HEROES[type].base * (1 + 0.2 * (level - 1));
}

/* Prix pour passer du niveau `level` au suivant (25, 75, 145, 230, 330…) :
   la récompense du niveau 1 suffit pour une première amélioration. */
export function upgradeCost(level) {
  return Math.round((25 * Math.pow(level, 1.6)) / 5) * 5;
}

/* PV de l'équipe : 100, +10 par niveau de héros gagné. */
export function teamMaxHp(heroLevels) {
  let extra = 0;
  for (const type of Object.keys(HEROES)) extra += (heroLevels[type] ?? 1) - 1;
  return 100 + 10 * extra;
}

/* Le monde est découpé en zones de 5 niveaux, chacune avec sa faune et son boss
   (au 5e niveau). Après la dernière zone, on repart de la première : seule
   l'échelle des PV et de l'attaque continue de monter.

   `cd` = nombre de tours entre deux attaques. Dans chaque zone, les monstres
   vont du plus simple au plus dangereux ; les valeurs de base restent dans la
   même fourchette d'une zone à l'autre, la difficulté venant du niveau.
   Profils : harceleur (cd 1, frappe à chaque tour), équilibré (cd 2-3),
   brute (cd 4-5, gros coups). Le dernier champ est la capacité du monstre,
   décrite et appliquée dans abilities.js. */
const m = (id, icon, name, hp, atk, cd, ability) => ({ id, icon, name, hp, atk, cd, ability });
const b = (id, icon, name, hp, atk, cd, ability) => ({ id, icon, name, hp, atk, cd, ability, boss: true });

export const ZONE_LEVELS = 5;

export const ZONES = [
  {
    name: "Forêt",
    monsters: [
      m("bat",      "🦇", "Chauve-souris", 36,  5,  2, "flying"),
      m("boar",     "🐗", "Sanglier",      55,  8,  3, "rage"),
      m("snake",    "🐍", "Serpent",       44,  9,  2, "poison"),
      m("wolf",     "🐺", "Loup",          62,  10, 3, "pack"),
      m("spider",   "🕷️", "Araignée",      50,  8,  2, "web"),
    ],
    boss: b("bear", "🐻", "Grand ours", 280, 22, 3, "rage"),
  },
  {
    name: "Marais",
    monsters: [
      m("mosquito", "🦟", "Moustique",     30,  4,  1, "leech"),
      m("toad",     "🐸", "Crapaud",       58,  9,  3, "poison"),
      m("lizard",   "🦎", "Lézard",        48,  10, 2, "regen"),
      m("turtle",   "🐢", "Tortue",        120, 9,  4, "shell"),
      m("croc",     "🐊", "Crocodile",     105, 17, 4, "sunder"),
    ],
    boss: b("hydra", "🐲", "Hydre", 320, 26, 4, "regen"),
  },
  {
    name: "Crypte",
    monsters: [
      m("rat",      "🐀", "Rat",           34,  4,  1, "pack"),
      m("skeleton", "💀", "Squelette",     75,  12, 3, "undying"),
      m("ghost",    "👻", "Fantôme",       66,  14, 3, "pierce"),
      m("zombie",   "🧟", "Zombie",        100, 13, 4, "regen"),
      m("vampire",  "🧛", "Vampire",       80,  15, 3, "leech"),
    ],
    boss: b("lich", "☠️", "Liche", 340, 28, 4, "undying"),
  },
  {
    name: "Désert",
    monsters: [
      m("ant",      "🐜", "Fourmi",        32,  4,  1, "pack"),
      m("scorpion", "🦂", "Scorpion",      52,  11, 2, "poison"),
      m("vulture",  "🦅", "Vautour",       60,  12, 3, "flying"),
      m("cactus",   "🌵", "Cactus",        95,  9,  4, "thorns"),
      m("rhino",    "🦏", "Rhinocéros",    125, 19, 4, "rage"),
    ],
    boss: b("djinn", "🧞", "Djinn", 300, 24, 3, "pierce"),
  },
  {
    name: "Rivage",
    monsters: [
      m("piranha",  "🐟", "Piranha",       34,  5,  1, "pack"),
      m("puffer",   "🐡", "Poisson-globe", 46,  10, 2, "thorns"),
      m("crab",     "🦀", "Crabe",         72,  9,  3, "shell"),
      m("octopus",  "🐙", "Pieuvre",       85,  13, 3, "web"),
      m("shark",    "🦈", "Requin",        110, 18, 4, "sunder"),
    ],
    boss: b("kraken", "🦑", "Kraken", 360, 30, 4, "web"),
  },
  {
    name: "Montagne",
    monsters: [
      m("hornet",   "🐝", "Frelon",        30,  4,  1, "flying"),
      m("goblin",   "👺", "Gobelin",       46,  9,  2, "thief"),
      m("ram",      "🐏", "Bélier",        78,  12, 3, "sunder"),
      m("gorilla",  "🦍", "Gorille",       105, 15, 4, "pack"),
      m("ogre",     "👹", "Ogre",          140, 18, 4, "rage"),
    ],
    boss: b("mammoth", "🦣", "Mammouth", 380, 28, 4, "shell"),
  },
  {
    name: "Volcan",
    monsters: [
      m("wisp",     "🔥", "Feu follet",    32,  5,  1, "pierce"),
      m("imp",      "👿", "Diablotin",     50,  11, 2, "thief"),
      m("minotaur", "🐂", "Minotaure",     88,  14, 3, "rage"),
      m("bomb",     "💣", "Bombe",         38,  22, 4, "explode"),
      m("golem",    "🗿", "Golem",         135, 16, 5, "shell"),
    ],
    boss: b("dragon", "🐉", "Dragon", 360, 30, 3, "haste"),
  },
  {
    name: "Citadelle",
    monsters: [
      m("eye",       "👁️", "Œil maudit",   34,  5,  1, "pierce"),
      m("scarecrow", "🎃", "Épouvantail",  52,  10, 2, "web"),
      m("warlock",   "🧙", "Sorcier",      62,  14, 3, "healer"),
      m("automaton", "🤖", "Automate",     100, 13, 4, "shell"),
      m("chimera",   "👾", "Chimère",      120, 19, 4, "poison"),
    ],
    boss: b("demon", "😈", "Démon", 400, 32, 3, "leech"),
  },
];

export const BESTIARY = ZONES.flatMap((zone) => zone.monsters);
export const BOSSES = ZONES.map((zone) => zone.boss);

/* Niveau n → sa zone, son rang dans la zone (0 à 4) et le nombre de tours du
   monde déjà bouclés. */
export function zoneOf(n) {
  const index = Math.floor((n - 1) / ZONE_LEVELS);
  return {
    zone: ZONES[index % ZONES.length],
    step: (n - 1) % ZONE_LEVELS,
    cycle: Math.floor(index / ZONES.length),
  };
}

/* « Forêt », puis « Forêt 2 » au deuxième passage, etc. */
export function zoneName(n) {
  const { zone, cycle } = zoneOf(n);
  return cycle ? `${zone.name} ${cycle + 1}` : zone.name;
}

/* Générateur déterministe : un même niveau donne toujours les mêmes vagues. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Croissance composée : elle finit toujours par dépasser les améliorations des
   héros (linéaires), si bien que chaque joueur trouve son palier.
   PV +9 % par niveau (×2,2 au niveau 10, ×5,1 au 20) ; attaque +7 % (×1,8, ×3,6).
   Les PV montent à peine plus vite que l'attaque : au-delà, les combats
   s'éternisent sans devenir plus dangereux. */
export const HP_GROWTH = 1.09;
export const ATK_GROWTH = 1.07;
export const enemyHpScale = (n) => Math.pow(HP_GROWTH, n - 1);
export const enemyAtkScale = (n) => Math.pow(ATK_GROWTH, n - 1);

/* Part de l'armure conservée d'un tour au suivant. */
export const ARMOR_KEEP = 0.5;

/* Niveaux de difficulté : un multiplicateur appliqué aux PV et à l'attaque des
   ennemis. « Normal » ne change rien ; « Difficile » revient à affronter des
   ennemis venus de 4 à 5 niveaux plus loin, « Facile » de 4 à 5 niveaux plus
   tôt. Les vagues et les récompenses sont les mêmes. */
export const DIFFICULTIES = {
  easy:   { name: "Facile",    scale: 0.7, hint: "Ennemis à 70 % de leurs PV et de leur attaque." },
  normal: { name: "Normal",    scale: 1,   hint: "La difficulté de référence." },
  hard:   { name: "Difficile", scale: 1.4, hint: "Ennemis à 140 % de leurs PV et de leur attaque." },
};
export const DEFAULT_DIFFICULTY = "normal";

function scaled(template, n, scale) {
  const hp = Math.max(1, Math.round(template.hp * enemyHpScale(n) * scale));
  const atk = Math.max(1, Math.round(template.atk * enemyAtkScale(n) * scale));
  // Pas de tour de répit : la première attaque tombe après le délai normal.
  return { ...template, hp, atk, first: template.cd };
}

/* Niveau n (à partir de 1) → { waves: [[ennemi…]…], reward, boss, zone },
   pour une difficulté donnée (clé de DIFFICULTIES).
   Le boss de la zone clôt son 5e niveau. Les monstres d'une zone se dévoilent
   peu à peu : 3 au premier niveau, 4 au deuxième, tous ensuite. */
export function buildLevel(n, difficulty = DEFAULT_DIFFICULTY) {
  const { scale } = DIFFICULTIES[difficulty] ?? DIFFICULTIES[DEFAULT_DIFFICULTY];
  const rng = mulberry32(n * 7919);
  const { zone, step } = zoneOf(n);
  const isBoss = step === ZONE_LEVELS - 1;
  const waveCount = n < 3 ? 2 : n < 8 ? 3 : 4;
  const pool = zone.monsters.slice(0, Math.min(zone.monsters.length, 3 + step));
  const waves = [];

  for (let w = 0; w < waveCount; w++) {
    if (isBoss && w === waveCount - 1) {
      const boss = zone.boss;
      const wave = [scaled(boss, n, scale)];
      if (n >= 10) wave.unshift(scaled(pool[Math.floor(rng() * pool.length)], n, scale));
      waves.push(wave);
      continue;
    }
    let count = 1;
    if (n > 1 || w > 0) count += rng() < 0.45 + 0.2 * w ? 1 : 0;
    if (n >= 6 && rng() < 0.3) count += 1;
    const wave = [];
    for (let k = 0; k < Math.min(3, count); k++) {
      wave.push(scaled(pool[Math.floor(rng() * pool.length)], n, scale));
    }
    waves.push(wave);
  }

  return { waves, reward: 20 + 5 * n, boss: isBoss, zone: zoneName(n) };
}
