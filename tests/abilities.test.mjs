import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ABILITIES, attackOf, isEnraged, hitEnemy, thornsOf, hurtTeam, upkeep, strike,
  tickPoison, comboTimeFactor, WEB_FACTOR,
} from "../js/abilities.js";

const foe = (over = {}) => ({ hp: 100, maxHp: 100, atk: 20, cd: 1, cdMax: 3, ...over });
const team = (over = {}) => ({ hp: 100, maxHp: 100, armor: 0, poison: null, runCoins: 0, ...over });

test("chaque capacité a un nom court et une description", () => {
  for (const [key, ability] of Object.entries(ABILITIES)) {
    assert.ok(ability.name.length > 0 && ability.name.length <= 12, key);
    assert.ok(ability.text.length > 10, key);
  }
});

test("sans capacité : attaque et dégâts inchangés", () => {
  const enemy = foe();
  assert.equal(attackOf(enemy, [enemy]), 20);
  assert.deepEqual(hitEnemy(enemy, "sword", 30), { taken: 30, used: 30, revived: false });
  assert.equal(enemy.hp, 70);
});

test("rage : +25 % sous la moitié des PV seulement", () => {
  const enemy = foe({ ability: "rage" });
  assert.equal(attackOf(enemy, [enemy]), 20);
  enemy.hp = 50;
  assert.equal(isEnraged(enemy), false);
  enemy.hp = 49;
  assert.equal(isEnraged(enemy), true);
  assert.equal(attackOf(enemy, [enemy]), 25);
});

test("meute : +25 % par autre ennemi en vie", () => {
  const wolf = foe({ ability: "pack" });
  const friend = foe();
  const dead = foe({ hp: 0 });
  assert.equal(attackOf(wolf, [wolf]), 20);
  assert.equal(attackOf(wolf, [wolf, friend, dead]), 25);
  assert.equal(attackOf(wolf, [wolf, friend, foe()]), 30);
});

test("volant : seul le Chevalier est réduit de moitié", () => {
  assert.equal(hitEnemy(foe({ ability: "flying" }), "sword", 40).taken, 20);
  assert.equal(hitEnemy(foe({ ability: "flying" }), "bow", 40).taken, 40);
  assert.equal(hitEnemy(foe({ ability: "flying" }), "magic", 40).taken, 40);
});

test("cuirasse : −40 % sur tous les dégâts, au moins 1", () => {
  assert.equal(hitEnemy(foe({ ability: "shell" }), "magic", 50).taken, 30);
  assert.equal(hitEnemy(foe({ ability: "shell" }), "sword", 1).taken, 1);
});

test("flèche : `used` ne compte que les dégâts bruts nécessaires pour tuer", () => {
  const weak = foe({ hp: 30 });
  assert.deepEqual(hitEnemy(weak, "bow", 100), { taken: 30, used: 30, revived: false });
  // Cuirasse : 100 bruts → 60 réels ; il en faut 30, donc la moitié des bruts.
  const armored = foe({ hp: 30, ability: "shell" });
  assert.deepEqual(hitEnemy(armored, "bow", 100), { taken: 30, used: 50, revived: false });
  // Pas assez pour tuer : tout est consommé.
  assert.equal(hitEnemy(foe({ ability: "shell" }), "bow", 100).used, 100);
});

test("immortel : revient une seule fois avec 30 % de ses PV", () => {
  const enemy = foe({ ability: "undying" });
  assert.deepEqual(hitEnemy(enemy, "sword", 500), { taken: 100, used: 100, revived: true });
  assert.equal(enemy.hp, 30);
  assert.equal(hitEnemy(enemy, "sword", 500).revived, false);
  assert.equal(enemy.hp, 0);
});

test("épines : renvoie des dégâts au Chevalier uniquement", () => {
  const cactus = foe({ ability: "thorns" });
  assert.equal(thornsOf(cactus, "sword"), 6);
  assert.equal(thornsOf(cactus, "bow"), 0);
  assert.equal(thornsOf(foe(), "sword"), 0);
});

test("hurtTeam : l'armure absorbe, `pierce` l'ignore, `lethal: false` laisse 1 PV", () => {
  const a = team({ armor: 8 });
  assert.deepEqual(hurtTeam(a, 20), { blocked: 8, dealt: 12 });
  assert.deepEqual([a.hp, a.armor], [88, 0]);

  const b = team({ armor: 8 });
  assert.deepEqual(hurtTeam(b, 20, { pierce: true }), { blocked: 0, dealt: 20 });
  assert.deepEqual([b.hp, b.armor], [80, 8]);

  const c = team({ hp: 5 });
  assert.deepEqual(hurtTeam(c, 20, { lethal: false }), { blocked: 0, dealt: 4 });
  assert.equal(c.hp, 1);
});

test("coup simple : dégâts, puis le compteur repart", () => {
  const enemy = foe();
  const t = team({ armor: 5 });
  const result = strike(enemy, [enemy], t);
  assert.deepEqual(result, {
    atk: 20, sundered: 0, blocked: 5, dealt: 15,
    poisoned: false, leeched: 0, stolen: 0, exploded: false,
  });
  assert.equal(t.hp, 85);
  assert.equal(enemy.cd, 3);
});

test("spectral : traverse l'armure ; brise-armure : la détruit d'abord", () => {
  const ghost = foe({ ability: "pierce" });
  const t1 = team({ armor: 30 });
  assert.equal(strike(ghost, [ghost], t1).dealt, 20);
  assert.equal(t1.armor, 30);

  const croc = foe({ ability: "sunder" });
  const t2 = team({ armor: 30 });
  const result = strike(croc, [croc], t2);
  assert.deepEqual([result.sundered, result.blocked, result.dealt], [30, 0, 20]);
  assert.equal(t2.armor, 0);
});

test("venin : seulement si le coup blesse, 2 tours malgré l'armure", () => {
  const snake = foe({ ability: "poison" });
  const safe = team({ armor: 50 });
  assert.equal(strike(snake, [snake], safe).poisoned, false);
  assert.equal(safe.poison, null);

  const t = team();
  assert.equal(strike(snake, [snake], t).poisoned, true);
  assert.deepEqual(t.poison, { dmg: 6, turns: 2 });
  t.armor = 40;
  assert.equal(tickPoison(t), 6);
  assert.equal(tickPoison(t), 6);
  assert.equal(t.poison, null);
  assert.equal(tickPoison(t), 0);
  assert.deepEqual([t.hp, t.armor], [68, 40]);
});

test("venin : un nouveau coup relance la durée et garde la dose la plus forte", () => {
  const t = team({ poison: { dmg: 10, turns: 1 } });
  const snake = foe({ ability: "poison" });
  strike(snake, [snake], t);
  assert.deepEqual(t.poison, { dmg: 10, turns: 2 });
});

test("vampirisme : se soigne des dégâts infligés, sans dépasser ses PV max", () => {
  const bat = foe({ ability: "leech", hp: 50 });
  assert.equal(strike(bat, [bat], team({ armor: 5 })).leeched, 15);
  assert.equal(bat.hp, 65);
  const full = foe({ ability: "leech", hp: 95 });
  assert.equal(strike(full, [full], team()).leeched, 5);
});

test("voleur : prend un quart des pièces si le coup blesse", () => {
  const goblin = foe({ ability: "thief" });
  const t = team({ runCoins: 41 });
  assert.equal(strike(goblin, [goblin], t).stolen, 11);
  assert.equal(t.runCoins, 30);
  const guarded = team({ runCoins: 41, armor: 99 });
  assert.equal(strike(goblin, [goblin], guarded).stolen, 0);
});

test("explosif : frappe puis disparaît ; frénésie : délai réduit jusqu'à 1", () => {
  const bomb = foe({ ability: "explode" });
  const result = strike(bomb, [bomb], team());
  assert.deepEqual([result.dealt, result.exploded, bomb.hp], [20, true, 0]);

  const dragon = foe({ ability: "haste", cdMax: 3 });
  strike(dragon, [dragon], team());
  assert.deepEqual([dragon.cdMax, dragon.cd], [2, 2]);
  strike(dragon, [dragon], team());
  strike(dragon, [dragon], team());
  assert.deepEqual([dragon.cdMax, dragon.cd], [1, 1]);
});

test("entretien : régénération et soin des alliés, plafonnés aux PV max", () => {
  const troll = foe({ ability: "regen", hp: 50 });
  const healer = foe({ ability: "healer", hp: 40 });
  const hurt = foe({ hp: 95 });
  const dead = foe({ hp: 0 });
  const events = upkeep([troll, healer, hurt, dead]);
  // Le troll se régénère (8) et reçoit le soin (10) ; le guérisseur ne se soigne pas.
  assert.deepEqual(events, [{ enemy: troll, healed: 18 }, { enemy: hurt, healed: 5 }]);
  assert.deepEqual([troll.hp, healer.hp, hurt.hp, dead.hp], [68, 40, 100, 0]);
  assert.deepEqual(upkeep([foe({ ability: "regen" })]), []);
});

test("entrave : chrono raccourci tant qu'un ennemi entravant est en vie", () => {
  assert.equal(comboTimeFactor([foe()]), 1);
  assert.equal(comboTimeFactor([foe(), foe({ ability: "web" })]), WEB_FACTOR);
  assert.equal(comboTimeFactor([foe({ ability: "web" }), foe({ ability: "web" })]), WEB_FACTOR);
  assert.equal(comboTimeFactor([foe({ ability: "web", hp: 0 })]), 1);
});
