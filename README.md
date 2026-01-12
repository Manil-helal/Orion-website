🌌 Projet Web - Orion Bot

Ce dossier contient le site web complet et dynamique pour le bot Discord Orion.

📂 Structure des fichiers

server.js : Le "moteur" du site (Back-end Node.js). C'est lui qui se connecte au bot.

index.html : La page d'accueil avec les stats en temps réel.

features.html : La présentation des fonctionnalités.

docs.html : La documentation utilisateur.

premium.html : La boutique.

tos.html / privacy.html : Les pages légales obligatoires.

🛠️ Installation (Première fois)

Installer Node.js : Assurez-vous d'avoir Node.js installé sur votre ordinateur.

Ouvrir le terminal : Faites un clic droit dans ce dossier > "Ouvrir dans le terminal".

Installer les outils : Tapez la commande suivante et validez :

npm install


(Cela va créer un dossier node_modules, c'est normal).

⚙️ Configuration

Ouvrez le fichier server.js avec un éditeur de texte (Bloc-note, VS Code).

Cherchez la ligne const BOT_TOKEN = "...".

Remplacez le texte par votre VRAI Token de bot (disponible sur le Portail Développeur Discord).

⚠️ Important : Ne partagez jamais ce fichier une fois le token ajouté.

🚀 Lancer le site

Pour allumer le site, tapez cette commande dans le terminal :

node server.js


Si tout va bien, vous verrez :

✅ BOT CONNECTÉ
🌍 SITE EN LIGNE : http://localhost:3000

Ouvrez votre navigateur à l'adresse http://localhost:3000 pour voir le résultat !

🛑 Arrêter le site

Dans le terminal, appuyez sur CTRL + C pour stopper le serveur.