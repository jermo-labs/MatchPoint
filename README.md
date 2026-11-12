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
  | Bouclier | Gardien   | Armure qui absorbe les coups            |
  | Cœur     | Soigneuse | Rend des points de vie                  |
  | Pièce    | Trésorier | Pièces pour améliorer les héros         |

- Touche un ennemi pour le cibler. Son compteur indique dans combien de tours il
  attaque. Chaque niveau enchaîne plusieurs vagues ; un boss tous les 5 niveaux.
- Les pièces gagnées servent à améliorer les héros depuis l'accueil.

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

Les tests couvrent le moteur de grille (`js/engine.js`).

## Organisation

| Fichier                | Rôle                                                        |
|------------------------|-------------------------------------------------------------|
| `index.html`           | Page unique : accueil, partie, fenêtres                     |
| `css/style.css`        | Mise en page et animations                                  |
| `js/engine.js`         | Moteur match-3 pur (alignements, échanges, chute, mélange)  |
| `js/data.js`           | Héros, bestiaire, génération des niveaux                    |
| `js/main.js`           | Interface, saisie tactile, déroulement des combats, sons    |
| `sw.js`                | Service worker (mode hors-ligne)                            |
| `tools/serve.mjs`      | Serveur statique de développement                           |
| `tools/make-icons.mjs` | Génère les icônes PNG (`npm run icons`)                     |
