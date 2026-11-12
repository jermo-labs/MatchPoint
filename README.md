# MatchPoint

Jeu de match-3 à combos et combats, pensé pour l'iPhone. Application web sans
dépendance ni étape de build : HTML, CSS et JavaScript (modules ES).

## Règles

- Fais glisser une tuile (ou touche deux cases voisines) pour aligner 3 symboles
  identiques ou plus.
- Le premier alignement lance un chrono. Les tuiles alignées ne disparaissent
  pas : elles restent en place, verrouillées (elles ne bougent plus). Tu
  enchaînes les combinaisons en créant d'autres alignements ou en prolongeant
  un alignement verrouillé — y poser un 4e symbole est un mouvement valide.
  Chaque combinaison relance le chrono, un peu plus court.
- Le combo se termine à la fin du chrono, quand tu touches le chrono, ou au
  premier mouvement qui n'aligne rien. Ce dernier mouvement reste joué : les
  tuiles gardent leur nouvelle place. Seul un mouvement raté hors combo (le
  premier du tour) est annulé.
- Tous les alignements sont alors résolus d'un coup : les tuiles verrouillées
  disparaissent, la grille retombe (les cascades comptent), puis chaque symbole
  aligné fait agir son héros. Chaque combinaison supplémentaire ajoute +50 % à
  tous les effets du tour (×1, ×1,5, ×2, ×2,5…) :

  | Symbole  | Héros     | Effet                                   |
  |----------|-----------|-----------------------------------------|
  | Épée     | Chevalier | Frappe l'ennemi ciblé                   |
  | Flèche   | Archère   | Transperce jusqu'à l'ennemi suivant     |
  | Étoile   | Mage      | Touche tous les ennemis                 |
  | Bouclier | Gardien   | Armure, réduite de moitié à chaque tour |
  | Cœur     | Soigneuse | Rend des points de vie                  |
  | Pièce    | Trésorier | Pièces pour améliorer les héros         |

- Option « Mouvements en diagonale » (Paramètres, désactivée par défaut) : une
  tuile peut aussi être échangée avec une voisine en coin. Les alignements
  restent en ligne ou en colonne.
- Touche un ennemi pour le cibler. Son compteur indique dans combien de tours il
  attaque. Chaque niveau enchaîne plusieurs vagues.
- Le monde compte 8 zones de 5 niveaux (Forêt, Marais, Crypte, Désert, Rivage,
  Montagne, Volcan, Citadelle), chacune avec ses 5 monstres et son boss au
  5e niveau. Après la Citadelle, on repart de la Forêt avec des ennemis plus
  forts.
- Chaque monstre a une capacité, affichée sous son nom ; le toucher hors combo
  en rappelle l'effet :

  | Capacité     | Effet                                                        |
  |--------------|--------------------------------------------------------------|
  | Volant       | Le Chevalier ne lui inflige que 50 % de ses dégâts           |
  | Cuirasse     | Subit 40 % de dégâts en moins                                |
  | Immortel     | Revient une fois à la vie avec 30 % de ses PV                |
  | Régénération | Récupère 8 % de ses PV à chaque tour                         |
  | Guérisseur   | Rend 10 % de leurs PV à ses alliés à chaque tour             |
  | Rage         | Attaque +50 % sous la moitié de ses PV                       |
  | Meute        | Attaque +25 % par autre ennemi en vie                        |
  | Frénésie     | Attaque plus vite après chaque coup                          |
  | Spectral     | Ses coups traversent l'armure                                |
  | Brise-armure | Détruit toute l'armure avant de frapper                      |
  | Venin        | S'il blesse : perte de PV pendant 2 tours, malgré l'armure   |
  | Vampirisme   | Se soigne des dégâts qu'il inflige                           |
  | Voleur       | S'il blesse : vole 25 % des pièces récoltées dans la partie  |
  | Épines       | Chaque coup du Chevalier renvoie des dégâts à l'équipe       |
  | Explosif     | Disparaît en attaquant                                       |
  | Entrave      | Tant qu'il vit, le chrono de combo est raccourci de 25 %     |

- Les pièces gagnées servent à améliorer les héros depuis l'accueil.
- Les niveaux sont sans fin. Les ennemis gagnent +12 % de PV et +7 % d'attaque
  par niveau, en croissance composée : tôt ou tard il faut améliorer ses héros,
  quitte à rejouer d'anciens niveaux.

La progression est enregistrée sur l'appareil (`localStorage`).

## Lancer en local

```bash
npm start
```

puis ouvrir <http://localhost:5173>. Node 20+ suffit, aucune installation.

Pour essayer sur un iPhone branché au même Wi-Fi :

```bash
npm run start:lan
```

et ouvrir dans Safari l'adresse « réseau local » affichée dans le terminal.

## Installer sur l'iPhone

Le jeu est publié sur <https://jermo-labs.github.io/MatchPoint/>. Ouvrir cette
adresse dans Safari, puis Partager → « Sur l'écran d'accueil ». Le jeu se lance
alors en plein écran et fonctionne hors-ligne.

Après une mise à jour publiée, la nouvelle version s'affiche au deuxième
lancement (le premier la télécharge en arrière-plan).

## Publication

Chaque push sur `main` déclenche le workflow
[`.github/workflows/pages.yml`](.github/workflows/pages.yml) : il lance les tests
du moteur, puis publie sur GitHub Pages uniquement les fichiers du jeu
(`index.html`, `css/`, `js/`, `icons/`, manifeste et service worker). Si les
tests échouent, rien n'est publié.

Réglage requis sur le dépôt : Settings → Pages → Source : « GitHub Actions ».

## Tests

```bash
npm test
```

Les tests couvrent le moteur de grille (`js/engine.js`), la génération des
niveaux (`js/data.js`) et les capacités des monstres (`js/abilities.js`).

## Organisation

| Fichier                | Rôle                                                        |
|------------------------|-------------------------------------------------------------|
| `index.html`           | Page unique : accueil, partie, fenêtres                     |
| `css/style.css`        | Mise en page et animations                                  |
| `js/engine.js`         | Moteur match-3 pur (alignements, échanges, chute, mélange)  |
| `js/data.js`           | Héros, zones, bestiaire, génération des niveaux             |
| `js/abilities.js`      | Capacités des monstres (logique pure)                       |
| `js/main.js`           | Interface, saisie tactile, déroulement des combats, sons    |
| `sw.js`                | Service worker (mode hors-ligne)                            |
| `tools/serve.mjs`      | Serveur statique de développement                           |
| `tools/make-icons.mjs` | Génère les icônes PNG (`npm run icons`)                     |
