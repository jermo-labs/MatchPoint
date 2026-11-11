# MatchPoint

Jeu de match-3 à combos et combats, pensé pour l'iPhone. Application web sans
dépendance ni étape de build : HTML, CSS et JavaScript (modules ES).

## Règles

- Fais glisser une tuile (ou touche deux cases voisines) pour aligner 3 symboles
  identiques ou plus.
- Le premier alignement lance un chrono : enchaîne les alignements avant qu'il ne
  s'épuise. Pendant le combo les tuiles ne retombent pas, et une tuile peut
  glisser dans un trou. Toucher le chrono termine le combo tout de suite.
- À la fin du combo, la grille retombe (les cascades comptent) puis chaque
  symbole aligné fait agir son héros, avec un bonus de +15 % par alignement
  supplémentaire :

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

Une fois le dossier publié sur un hébergement **HTTPS** (GitHub Pages, Netlify,
Cloudflare Pages… — le dossier se dépose tel quel) : ouvrir l'adresse dans
Safari, puis Partager → « Sur l'écran d'accueil ». Le jeu se lance alors en plein
écran et fonctionne hors-ligne.

Après une mise à jour publiée, la nouvelle version s'affiche au deuxième
lancement (le premier la télécharge en arrière-plan).

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
