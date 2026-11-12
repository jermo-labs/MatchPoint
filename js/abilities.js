/* Capacités des monstres. Logique pure, sans DOM : chaque fonction modifie
   l'état qu'on lui passe et renvoie ce qui s'est produit, pour l'affichage.

   Un ennemi : { hp, maxHp, atk, cd, cdMax, ability?, revived? }.
   L'équipe  : { hp, maxHp, armor, poison: null | { dmg, turns }, runCoins }. */

export const FLYING_TAKEN = 0.5;   // part des dégâts du Chevalier subie par un volant
export const SHELL_TAKEN = 0.6;    // part des dégâts subie par une cuirasse
export const RAGE_BONUS = 0.5;     // attaque en plus sous la moitié des PV
export const PACK_BONUS = 0.25;    // attaque en plus par autre ennemi en vie
export const POISON_PART = 0.3;    // part de l'attaque perdue à chaque tour de venin
export const POISON_TURNS = 2;
export const REGEN_PART = 0.08;    // part des PV max récupérée à chaque tour
export const HEAL_PART = 0.1;      // part des PV max rendue aux alliés à chaque tour
export const THORNS_PART = 0.3;    // part de l'attaque renvoyée au Chevalier
export const THIEF_PART = 0.25;    // part des pièces de la partie volée
export const UNDYING_PART = 0.3;   // part des PV max au retour à la vie
export const WEB_FACTOR = 0.75;    // durée du chrono de combo sous entrave

const pct = (x) => Math.round(x * 100);

export const ABILITIES = {
  flying:  { name: "Volant",       text: `Le Chevalier ne lui inflige que ${pct(FLYING_TAKEN)} % de ses dégâts.` },
  rage:    { name: "Rage",         text: `Attaque +${pct(RAGE_BONUS)} % quand il lui reste moins de la moitié de ses PV.` },
  poison:  { name: "Venin",        text: `S'il te blesse, tu perds des PV pendant ${POISON_TURNS} tours, malgré l'armure.` },
  pack:    { name: "Meute",        text: `Attaque +${pct(PACK_BONUS)} % par autre ennemi en vie.` },
  web:     { name: "Entrave",      text: `Tant qu'il vit, ton chrono de combo est raccourci de ${pct(1 - WEB_FACTOR)} %.` },
  leech:   { name: "Vampirisme",   text: "Se soigne des dégâts qu'il t'inflige." },
  regen:   { name: "Régénération", text: `Récupère ${pct(REGEN_PART)} % de ses PV à chaque tour.` },
  shell:   { name: "Cuirasse",     text: `Subit ${pct(1 - SHELL_TAKEN)} % de dégâts en moins.` },
  sunder:  { name: "Brise-armure", text: "Détruit toute ton armure avant de frapper." },
  undying: { name: "Immortel",     text: `Revient une fois à la vie avec ${pct(UNDYING_PART)} % de ses PV.` },
  pierce:  { name: "Spectral",     text: "Ses coups traversent ton armure." },
  thorns:  { name: "Épines",       text: "Chaque coup du Chevalier te renvoie des dégâts." },
  thief:   { name: "Voleur",       text: `S'il te blesse, il vole ${pct(THIEF_PART)} % des pièces récoltées.` },
  explode: { name: "Explosif",     text: "Disparaît en attaquant : élimine-le avant qu'il ne frappe." },
  healer:  { name: "Guérisseur",   text: `Rend ${pct(HEAL_PART)} % de leurs PV à ses alliés à chaque tour.` },
  haste:   { name: "Frénésie",     text: "Attaque plus vite après chaque coup." },
};

const alive = (enemy) => enemy.hp > 0;

export function isEnraged(enemy) {
  return enemy.ability === "rage" && alive(enemy) && enemy.hp * 2 < enemy.maxHp;
}

/* Attaque réelle d'un ennemi, selon son état et ses alliés. */
export function attackOf(enemy, enemies) {
  let atk = enemy.atk;
  if (isEnraged(enemy)) atk *= 1 + RAGE_BONUS;
  if (enemy.ability === "pack") {
    atk *= 1 + PACK_BONUS * enemies.filter((other) => other !== enemy && alive(other)).length;
  }
  return Math.round(atk);
}

/* Un héros (`heroType` : sword, bow ou magic) inflige `raw` dégâts bruts.
   → { taken : PV perdus, used : part des dégâts bruts consommée (pour la
       flèche qui transperce), revived : l'ennemi vient de revenir à la vie }. */
export function hitEnemy(enemy, heroType, raw) {
  let factor = 1;
  if (enemy.ability === "shell") factor *= SHELL_TAKEN;
  if (enemy.ability === "flying" && heroType === "sword") factor *= FLYING_TAKEN;
  const full = Math.max(1, Math.round(raw * factor));
  const taken = Math.min(enemy.hp, full);
  const used = full <= enemy.hp ? raw : Math.max(1, Math.ceil((raw * enemy.hp) / full));
  enemy.hp -= taken;

  let revived = false;
  if (enemy.hp === 0 && enemy.ability === "undying" && !enemy.revived) {
    enemy.revived = true;
    enemy.hp = Math.max(1, Math.round(enemy.maxHp * UNDYING_PART));
    revived = true;
  }
  return { taken, used, revived };
}

/* Dégâts renvoyés à l'équipe quand ce héros frappe cet ennemi. */
export function thornsOf(enemy, heroType) {
  if (enemy.ability !== "thorns" || heroType !== "sword") return 0;
  return Math.max(1, Math.round(enemy.atk * THORNS_PART));
}

/* L'équipe encaisse `amount`. `pierce` ignore l'armure ; `lethal: false`
   laisse au moins 1 PV. → { blocked, dealt } */
export function hurtTeam(team, amount, { pierce = false, lethal = true } = {}) {
  const blocked = pierce ? 0 : Math.min(team.armor, amount);
  let dealt = amount - blocked;
  if (!lethal) dealt = Math.min(dealt, Math.max(0, team.hp - 1));
  team.armor -= blocked;
  team.hp = Math.max(0, team.hp - dealt);
  return { blocked, dealt };
}

/* Début de la phase ennemie : régénérations et soins entre alliés.
   → [{ enemy, healed }] pour chaque ennemi réellement soigné. */
export function upkeep(enemies) {
  const gains = new Map();
  const heal = (enemy, part) => {
    const amount = Math.max(1, Math.round(enemy.maxHp * part));
    gains.set(enemy, (gains.get(enemy) ?? 0) + amount);
  };
  for (const enemy of enemies) {
    if (!alive(enemy)) continue;
    if (enemy.ability === "regen") heal(enemy, REGEN_PART);
    if (enemy.ability === "healer") {
      for (const other of enemies) if (other !== enemy && alive(other)) heal(other, HEAL_PART);
    }
  }
  const events = [];
  for (const [enemy, amount] of gains) {
    const healed = Math.min(enemy.maxHp - enemy.hp, amount);
    if (healed <= 0) continue;
    enemy.hp += healed;
    events.push({ enemy, healed });
  }
  return events;
}

/* Un ennemi frappe l'équipe, puis son compteur repart.
   → { atk, sundered, blocked, dealt, poisoned, leeched, stolen, exploded } */
export function strike(enemy, enemies, team) {
  const atk = attackOf(enemy, enemies);

  let sundered = 0;
  if (enemy.ability === "sunder") {
    sundered = team.armor;
    team.armor = 0;
  }

  const { blocked, dealt } = hurtTeam(team, atk, { pierce: enemy.ability === "pierce" });

  let poisoned = false;
  let leeched = 0;
  let stolen = 0;
  if (dealt > 0) {
    if (enemy.ability === "poison") {
      const dmg = Math.max(1, Math.round(atk * POISON_PART));
      team.poison = { dmg: Math.max(dmg, team.poison?.dmg ?? 0), turns: POISON_TURNS };
      poisoned = true;
    }
    if (enemy.ability === "leech") {
      leeched = Math.min(enemy.maxHp - enemy.hp, dealt);
      enemy.hp += leeched;
    }
    if (enemy.ability === "thief") {
      stolen = Math.ceil(team.runCoins * THIEF_PART);
      team.runCoins -= stolen;
    }
  }

  let exploded = false;
  if (enemy.ability === "explode") {
    enemy.hp = 0;
    exploded = true;
  }
  if (enemy.ability === "haste") enemy.cdMax = Math.max(1, enemy.cdMax - 1);
  enemy.cd = enemy.cdMax;

  return { atk, sundered, blocked, dealt, poisoned, leeched, stolen, exploded };
}

/* Le venin agit : l'équipe perd des PV sans que l'armure compte.
   → PV perdus (0 si l'équipe n'est pas empoisonnée). */
export function tickPoison(team) {
  if (!team.poison) return 0;
  const lost = Math.min(team.hp, team.poison.dmg);
  team.hp -= lost;
  team.poison.turns--;
  if (team.poison.turns <= 0) team.poison = null;
  return lost;
}

/* Facteur appliqué au chrono de combo. */
export function comboTimeFactor(enemies) {
  return enemies.some((enemy) => alive(enemy) && enemy.ability === "web") ? WEB_FACTOR : 1;
}
