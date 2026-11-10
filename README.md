# Scan stock

Mini app web pour téléphone : on scanne les numéros de série (codes-barres, QR codes, DataMatrix) et on récupère la liste dans un fichier Excel.

## Utilisation

1. **Scanner un code** ouvre la caméra. Chaque code lu est ajouté à la liste, avec un bip.
   - Si l'étiquette porte plusieurs codes (n° de série, référence, adresse MAC…), l'app demande lequel est le numéro de série. Les autres sont ignorés pour la suite du scan.
   - Un code déjà dans la liste n'est pas ajouté deux fois.
2. **Lire depuis une photo** fait la même chose à partir d'une photo, quand le scan en direct n'est pas disponible.
3. **Saisir le numéro de série** à la main reste possible pour les étiquettes illisibles.
4. **Télécharger l'Excel** crée un fichier `.xlsx` avec trois colonnes : code, type de code, date et heure. **Partager** (si le téléphone le permet) l'envoie par mail, Teams, OneDrive, etc.

La liste est gardée sur le téléphone tant qu'on ne la vide pas, même si on ferme la page. Rien n'est envoyé sur Internet : il n'y a ni serveur ni service externe.

## Mise en ligne

Ce sont des fichiers statiques, sans installation ni compilation : il suffit de copier le dossier sur n'importe quel serveur web.

Le scan en direct exige une adresse en **https** (les navigateurs n'autorisent la caméra que dans ce cas). En http, « Lire depuis une photo » et la saisie fonctionnent quand même.

Pour essayer sur un PC :

```bash
python3 -m http.server 8000
```

puis ouvrir `http://localhost:8000`.

## Fichiers

- `index.html`, `styles.css`, `app.js` : l'application.
- `vendor/` : lecteur de codes et générateur Excel, embarqués (voir `vendor/README.md`).
- `icons/`, `manifest.webmanifest` : pour ajouter l'app à l'écran d'accueil.
