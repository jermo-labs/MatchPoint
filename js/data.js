/* Données de jeu : héros (un par symbole), bestiaire et génération des niveaux.
   Logique pure, sans DOM. */

/* Un héros par symbole. `base` = effet par point d'alignement au niveau 1. */
export const HEROES = {
  sword:  { name: "Chevalier", effect: "Frappe l'ennemi ciblé",                 base: 6 },
  bow:    { name: "Archère",   effect: "Transperce jusqu'à l'ennemi suivant",   base: 4 },
  magic:  { name: "Mage",      effect: "Touche tous les ennemis",               base: 3 },
  shield: { name: "Gardien",   effect: "Ajoute de l'armure à l'équipe",         base: 2 },
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

/* `cd` = nombre de tours entre deux attaques. */
export const BESTIARY = [
  { id: "bat",      icon: "🦇", name: "Chauve-souris", hp: 36,  atk: 5,  cd: 2 },
  { id: "boar",     icon: "🐗", name: "Sanglier",      hp: 55,  atk: 8,  cd: 3 },
  { id: "snake",    icon: "🐍", name: "Serpent",       hp: 44,  atk: 9,  cd: 2 },
  { id: "wolf",     icon: "🐺", name: "Loup",          hp: 62,  atk: 10, cd: 3 },
  { id: "spider",   icon: "🕷️", name: "Araignée",      hp: 50,  atk: 8,  cd: 2 },
  { id: "skeleton", icon: "💀", name: "Squelette",     hp: 75,  atk: 12, cd: 3 },
  { id: "ghost",    icon: "👻", name: "Fantôme",       hp: 66,  atk: 14, cd: 3 },
  { id: "zombie",   icon: "🧟", name: "Zombie",        hp: 100, atk: 13, cd: 4 },
  { id: "ogre",     icon: "👹", name: "Ogre",          hp: 140, atk: 18, cd: 4 },
];

export const BOSSES = [
  { id: "dragon", icon: "🐉", name: "Dragon", hp: 280, atk: 22, cd: 3, boss: true },
  { id: "kraken", icon: "🦑", name: "Kraken", hp: 320, atk: 26, cd: 4, boss: true },
  { id: "tyrant", icon: "🦖", name: "Tyran",  hp: 360, atk: 30, cd: 4, boss: true },
];

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

function scaled(template, n, rng) {
  const hp = Math.round(template.hp * (1 + 0.14 * (n - 1)));
  const atk = Math.round(template.atk * (1 + 0.09 * (n - 1)));
  // `first` décale la première attaque pour que les ennemis ne frappent pas tous ensemble.
  return { ...template, hp, atk, first: template.cd + Math.floor(rng() * 2) };
}

/* Niveau n (à partir de 1) → { waves: [[ennemi…]…], reward, boss }.
   Un boss clôt chaque niveau multiple de 5. */
export function buildLevel(n) {
  const rng = mulberry32(n * 7919);
  const isBoss = n % 5 === 0;
  const waveCount = n < 3 ? 2 : n < 8 ? 3 : 4;
  const pool = BESTIARY.slice(0, Math.min(BESTIARY.length, 2 + Math.ceil(n / 2)));
  const waves = [];

  for (let w = 0; w < waveCount; w++) {
    if (isBoss && w === waveCount - 1) {
      const boss = BOSSES[(n / 5 - 1) % BOSSES.length];
      const wave = [scaled(boss, n, rng)];
      if (n >= 10) wave.unshift(scaled(pool[Math.floor(rng() * pool.length)], n, rng));
      waves.push(wave);
      continue;
    }
    let count = 1;
    if (n > 1 || w > 0) count += rng() < 0.45 + 0.2 * w ? 1 : 0;
    if (n >= 6 && rng() < 0.3) count += 1;
    const wave = [];
    for (let k = 0; k < Math.min(3, count); k++) {
      wave.push(scaled(pool[Math.floor(rng() * pool.length)], n, rng));
    }
    waves.push(wave);
  }

  return { waves, reward: 20 + 5 * n, boss: isBoss };
}
