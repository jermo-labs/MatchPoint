import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BESTIARY, BOSSES, ZONES, ZONE_LEVELS, zoneOf, zoneName,
  buildLevel, enemyHpScale, enemyAtkScale, ARMOR_KEEP,
} from "../js/data.js";
import { ABILITIES } from "../js/abilities.js";

const templates = new Map([...BESTIARY, ...BOSSES].map((e) => [e.id, e]));

test("un même niveau donne toujours les mêmes vagues", () => {
  assert.deepEqual(buildLevel(12), buildLevel(12));
});

test("le niveau 1 garde les valeurs de base et commence par un seul ennemi", () => {
  const { waves } = buildLevel(1);
  assert.equal(waves.length, 2);
  assert.equal(waves[0].length, 1);
  for (const enemy of waves.flat()) {
    assert.equal(enemy.hp, templates.get(enemy.id).hp);
    assert.equal(enemy.atk, templates.get(enemy.id).atk);
  }
});

test("la croissance des ennemis est composée", () => {
  assert.equal(enemyHpScale(1), 1);
  assert.equal(enemyAtkScale(1), 1);
  assert.ok(Math.abs(enemyHpScale(10) - 2.773) < 0.001);
  assert.ok(Math.abs(enemyHpScale(35) - 47.14) < 0.01);
  assert.ok(Math.abs(enemyAtkScale(35) - 9.978) < 0.001);
  // Chaque niveau multiplie par le même facteur.
  assert.ok(Math.abs(enemyHpScale(21) / enemyHpScale(20) - enemyHpScale(2)) < 1e-9);
});

test("les ennemis d'un niveau suivent l'échelle et attaquent sans tour de répit", () => {
  for (const n of [1, 7, 20, 35]) {
    for (const enemy of buildLevel(n).waves.flat()) {
      const base = templates.get(enemy.id);
      assert.equal(enemy.hp, Math.round(base.hp * enemyHpScale(n)));
      assert.equal(enemy.atk, Math.round(base.atk * enemyAtkScale(n)));
      assert.equal(enemy.first, base.cd);
    }
  }
});

test("vagues : 2, 3 puis 4, jamais plus de 3 ennemis, boss tous les 5 niveaux", () => {
  for (let n = 1; n <= 40; n++) {
    const { waves, boss, reward } = buildLevel(n);
    assert.equal(waves.length, n < 3 ? 2 : n < 8 ? 3 : 4);
    assert.ok(waves.every((wave) => wave.length >= 1 && wave.length <= 3));
    assert.equal(boss, n % 5 === 0);
    assert.equal(waves.at(-1).some((e) => e.boss), n % 5 === 0);
    assert.equal(reward, 20 + 5 * n);
  }
});

test("bestiaire : identifiants, noms et pictogrammes uniques, valeurs cohérentes", () => {
  const all = [...BESTIARY, ...BOSSES];
  for (const key of ["id", "name", "icon"]) {
    assert.equal(new Set(all.map((e) => e[key])).size, all.length, `doublon de ${key}`);
  }
  for (const enemy of all) {
    assert.ok(enemy.hp > 0 && enemy.atk > 0 && enemy.cd >= 1, enemy.id);
    assert.ok(ABILITIES[enemy.ability], `capacité inconnue pour ${enemy.id}`);
  }
  // Toutes les capacités servent, et une zone n'en répète aucune.
  assert.deepEqual(
    [...new Set(all.map((e) => e.ability))].sort(),
    Object.keys(ABILITIES).sort(),
  );
  for (const zone of ZONES) {
    const used = zone.monsters.map((e) => e.ability);
    assert.equal(new Set(used).size, used.length, zone.name);
  }
  for (const zone of ZONES) {
    assert.equal(zone.monsters.length, 5, zone.name);
    assert.equal(zone.boss.boss, true, zone.name);
  }
});

test("zones : 5 niveaux chacune, puis le monde reboucle", () => {
  const world = ZONES.length * ZONE_LEVELS;
  assert.equal(zoneOf(1).zone, ZONES[0]);
  assert.equal(zoneOf(5).zone, ZONES[0]);
  assert.equal(zoneOf(6).zone, ZONES[1]);
  assert.deepEqual(zoneOf(world), { zone: ZONES.at(-1), step: 4, cycle: 0 });
  assert.deepEqual(zoneOf(world + 1), { zone: ZONES[0], step: 0, cycle: 1 });
  assert.equal(zoneName(1), "Forêt");
  assert.equal(zoneName(world + 1), "Forêt 2");
  assert.equal(buildLevel(7).zone, "Marais");
});

test("chaque niveau ne pioche que dans sa zone, qui se dévoile peu à peu", () => {
  for (let n = 1; n <= 2 * ZONES.length * ZONE_LEVELS; n++) {
    const { zone, step } = zoneOf(n);
    const allowed = new Set(zone.monsters.slice(0, 3 + step).map((e) => e.id));
    const { waves } = buildLevel(n);
    for (const enemy of waves.flat()) {
      if (enemy.boss) assert.equal(enemy.id, zone.boss.id, `niveau ${n}`);
      else assert.ok(allowed.has(enemy.id), `niveau ${n} : ${enemy.id}`);
    }
  }
});

test("l'armure conservée est une fraction stricte", () => {
  assert.ok(ARMOR_KEEP > 0 && ARMOR_KEEP < 1);
});
