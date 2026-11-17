# Jeudi Sherboy

L'app des jeudis de la gang : présences, idées de sorties, roue, défis, carnet, tournées, souvenirs et rappels sur le téléphone.

- **L'app** est hébergée gratuitement par GitHub Pages.
- **Les données** (présences, votes, photos) sont dans Firebase, gratuit pour un groupe comme le nôtre.
- **Les rappels** du jeudi partent tout seuls grâce à GitHub Actions.

Sans Firebase, l'app tourne en « mode essai » : tout marche, mais chaque téléphone garde ses propres réponses.

---

## Mise en ligne, étape par étape

Compte environ 30 minutes. Tu as besoin d'un compte GitHub et d'un compte Google.

### 1. Créer le projet Firebase

1. Va sur <https://console.firebase.google.com> et connecte-toi avec ton compte Google.
2. **Créer un projet** → nom : `jeudi-sherboy` → tu peux désactiver Google Analytics → **Créer**.
3. Menu de gauche **Créer › Firestore Database** → **Créer une base de données** → emplacement `northamerica-northeast1 (Montréal)` → **Démarrer en mode production** → **Créer**.
4. Dans Firestore, onglet **Règles** : efface tout, colle le contenu du fichier `firestore.rules`, puis **Publier**.
5. Menu de gauche **Créer › Authentication** → **Commencer** → onglet **Sign-in method** → **Anonyme** → active-le → **Enregistrer**.
6. En haut à gauche, la roue dentée → **Paramètres du projet** → section **Vos applications** → bouton **</>** (Web) → surnom `jeudi-sherboy` → **Enregistrer l'application**.
   Firebase affiche un bloc `firebaseConfig`. Copie les six valeurs dans `config.js`, section `firebase`.
7. Toujours dans **Paramètres du projet**, onglet **Cloud Messaging** → section **Certificats Web Push** → **Générer une paire de clés**. Copie la clé dans `config.js`, ligne `vapidKey`.
8. Onglet **Comptes de service** → **Générer une nouvelle clé privée** → un fichier `.json` se télécharge.
   **Ne mets jamais ce fichier sur GitHub.** Il sert seulement à l'étape 4.

### 2. Créer le dépôt GitHub

1. Va sur <https://github.com/new>.
2. Nom du dépôt : `jeudi-sherboy`. Laisse-le **Public**, parce que GitHub Pages gratuit demande un dépôt public.
3. **Create repository**.
4. Sur la page du dépôt, clique **uploading an existing file**. Glisse **tout le contenu** du dossier Jeudi Sherboy : `index.html`, `app.js`, `config.js`, `data.js`, `styles.css`, `manifest.webmanifest`, `firebase-messaging-sw.js`, `firestore.rules`, `README.md`, et les dossiers `icons` et `rappels`. Clique **Commit changes**.
5. Le dossier `.github` est caché sur Mac, alors on le crée à la main :
   **Add file › Create new file** → dans le nom, tape `.github/workflows/rappels.yml` → colle le contenu du fichier du même nom → **Commit changes**.
   Pour voir le fichier caché dans le Finder : `Cmd + Maj + .` dans le dossier.

### 3. Mettre l'app en ligne

1. Dans le dépôt : **Settings › Pages**.
2. **Source** : `Deploy from a branch` → branche `main`, dossier `/ (root)` → **Save**.
3. Après une minute, l'adresse apparaît en haut, par exemple `https://tonnom.github.io/jeudi-sherboy/`.
4. Mets cette adresse dans `config.js`, ligne `siteUrl` (sur GitHub : ouvre `config.js` → crayon ✏️ → modifie → **Commit changes**).
5. Dans Firebase : **Authentication › Paramètres › Domaines autorisés** → **Ajouter un domaine** → `tonnom.github.io`.

### 4. Brancher les rappels automatiques

1. Dans le dépôt : **Settings › Secrets and variables › Actions** → **New repository secret**.
2. Nom : `FIREBASE_SERVICE_ACCOUNT`. Valeur : ouvre le fichier `.json` de l'étape 1.8 avec TextEdit et colle **tout** son contenu. **Add secret**.
3. Pour tester : onglet **Actions** → **Rappels du jeudi** → **Run workflow** → laisse `test` → **Run workflow**.
   Chaque téléphone qui a activé les notifications reçoit « Test Jeudi Sherboy ».

### 5. Partager avec la gang

Colle l'adresse de l'app dans le groupe Messenger, avec un message comme :

> Les gars, voici l'app des jeudis Sherboy. Ouvrez le lien dans Safari (iPhone) ou Chrome (Android), ajoutez-la à votre écran d'accueil, choisissez votre nom et activez les notifications. Tout est expliqué dans l'onglet Rappels.

---

## Les rappels

| Quand (heure de Sherbrooke) | Rappel | Par défaut |
|---|---|---|
| Jeudi 9 h | Confirme ta présence (seulement ceux qui n'ont pas répondu) | activé |
| Dès que 4 gars sont confirmés | ÇA LÈVE! | activé |
| Jeudi 16 h | Vote pour l'endroit | activé |
| Jeudi 18 h | Qui a besoin d'un lift (seulement si quelqu'un offre un lift) | désactivé |
| Jeudi 19 h | On va où ce soir, avec le défi | activé |

Chacun choisit ses rappels dans l'onglet Rappels. GitHub peut prendre jusqu'à une demi-heure de retard sur l'heure prévue.

Sur un dépôt public, GitHub met en pause les tâches automatiques après 60 jours sans aucun changement au dépôt. Si les rappels arrêtent, va dans **Actions › Rappels du jeudi** et clique **Enable workflow**, ou modifie n'importe quel fichier.

## Changer des choses

- **La gang ou le nombre pour que ça lève** : `config.js`.
- **Les boutons, les défis, les places suggérées, les heures des rappels** : `data.js`.
- Les noms dans `config.js` sont visibles par tout le monde sur GitHub. On n'y met que les prénoms.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `styles.css`, `app.js` | L'app |
| `config.js` | Les réglages Firebase et la gang |
| `data.js` | Les listes : boutons, défis, places, rappels |
| `manifest.webmanifest`, `icons/` | L'icône et l'installation sur l'écran d'accueil |
| `firebase-messaging-sw.js` | Les notifications et l'ouverture hors ligne |
| `firestore.rules` | Qui peut lire et écrire dans la base de données |
| `rappels/`, `.github/workflows/rappels.yml` | L'envoi automatique des rappels |
