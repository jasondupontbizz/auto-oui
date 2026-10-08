# Auto-Oui ✓

**Extension Chrome qui répond « Oui » automatiquement quand un agent IA te demande une autorisation.**

Tu lances une longue tâche avec un agent, tu pars faire autre chose… et quand tu reviens, il est bloqué depuis 20 minutes sur « M’autorises-tu à continuer ? ». Auto-Oui surveille l’onglet que tu as activé, repère ces demandes d’approbation et répond **Oui** à ta place (ou clique le bouton « Approuver / Autoriser / Confirmer » de la carte d’approbation).

100 % local : pas de serveur, pas de clé API, pas de télémétrie. L’extension ne fait **aucun appel réseau**.

> [!WARNING]
> **Utilisation à tes risques et périls.** Auto-approuver signifie que l’agent peut agir **sans ta confirmation** : exécuter des commandes, modifier ou supprimer des fichiers, envoyer des messages, dépenser des crédits… Ces demandes d’approbation existent pour une raison.
> **Garde Auto-Oui désactivé pour toute action sensible** : paiements et achats, envoi d’e-mails ou de messages, suppressions, déploiements en production, accès à des comptes ou données personnelles. Ne l’active que sur des tâches dont tu acceptes toutes les conséquences, et surveille ce que fait l’agent.

## Sites pris en charge

| Site | Détails |
|------|---------|
| ChatGPT (`chatgpt.com`, `chat.openai.com`) | Interface de chat classique et vue agent « Work » (`/dots/`) |

D’autres sites (Claude, Gemini, etc.) peuvent être ajoutés facilement : voir [Ajouter un site](#ajouter-un-site). Les contributions sont les bienvenues.

## Installation (mode développeur, 1 minute)

1. Télécharge ce dépôt (bouton **Code → Download ZIP** sur GitHub) et dézippe-le.
2. Dans Chrome, ouvre `chrome://extensions` et active le **Mode développeur** (en haut à droite).
3. Clique **Charger l’extension non empaquetée** (*Load unpacked*) et sélectionne le dossier **`extension/`** du dépôt.
4. Épingle **Auto-Oui** dans le menu des extensions (icône puzzle) pour l’avoir sous la main.

Fonctionne aussi sur les navigateurs basés sur Chromium (Edge, Brave, Arc…). Aucun `npm install` n’est nécessaire pour utiliser l’extension.

## Utilisation : activer / désactiver

1. Ouvre ta conversation avec l’agent (par ex. sur `chatgpt.com`).
2. Clique l’icône **Auto-Oui**, puis **Activer sur cet onglet**. La première fois, Chrome te demande l’accès au site : accepte.
3. Le badge **OUI** apparaît sur l’icône : l’onglet est surveillé. Le popup affiche l’état en direct (en attente, réponse envoyée, brouillon présent…).
4. Pour arrêter : rouvre le popup et clique **Désactiver cet onglet**.

L’activation est **par onglet** : les autres onglets ne sont jamais touchés. Elle survit à un rechargement de la page et aux changements de conversation sur le même site, et disparaît quand tu fermes l’onglet, quittes le site ou redémarres Chrome.

### Réglages (dans le popup)

- **Réponse envoyée** : `Oui` par défaut (tu peux mettre `Oui, continue`, `Yes`…).
- **Délai de stabilité** : temps pendant lequel le message doit rester identique avant d’agir (1,8 s par défaut).
- **Cliquer aussi les boutons d’approbation** : active/désactive le clic automatique sur les cartes « Approve / Allow / Confirmer ».
- **Sélecteurs avancés** : pour corriger les sélecteurs CSS si l’interface du site change, sans toucher au code.

## Comment ça marche

- **Détection par règles locales** (`extension/core.js`) : des expressions régulières reconnaissent les demandes explicites adressées à toi, en français et en anglais : « M’autorises-tu… », « Tu confirmes… ? », « Puis-je… ? », « Acceptes-tu… ? », « J’attends ton accord », « May I… ? », « Do you want me to… ? », etc.
- Ne déclenchent **pas** de réponse : les comptes rendus (« c’est confirmé, je poursuis »), les questions de préférence (« Tu préfères Python ou JavaScript ? »), les exemples cités, le code et les citations.
- Seul le **dernier message** de la conversation est pris en compte, et seulement s’il vient de l’agent.
- Les **boutons d’approbation** (« Approve », « Allow », « Autoriser », « Confirmer »…) sont cliqués uniquement dans une vraie carte ou boîte de dialogue d’approbation, jamais dans une boîte de dialogue quelconque.
- L’extension attend que l’agent ait fini d’écrire, **ne touche jamais à un brouillon** que tu es en train de taper, vérifie juste avant l’envoi que le message est toujours le même, et ne répond **qu’une seule fois** par demande (même après un rechargement).
- Les demandes formulées de façon ambiguë ne sont pas détectées : l’agent attend alors ta réponse, comme d’habitude.

## Ajouter un site

1. Dans `extension/sites.js`, ajoute une entrée au tableau `SITES` :

   ```js
   {
     id: 'monsite',
     name: 'Mon Site',
     origins: ['https://chat.exemple.com'],
     selectors: {
       assistant: '…',  // messages de l’agent
       user: '…',       // tes messages
       input: '…',      // champ de saisie (textarea ou contenteditable)
       send: '…',       // bouton Envoyer
       stop: '…',       // bouton Arrêter (visible pendant la génération)
       streaming: '…',  // optionnel : message en cours d’écriture
       turn: '…'        // optionnel : conteneur d’un tour de conversation
     }
   }
   ```

2. Ajoute la même origine dans `optional_host_permissions` de `extension/manifest.json` (ex. `"https://chat.exemple.com/*"`).
3. Recharge l’extension dans `chrome://extensions` (flèche circulaire sur la fiche Auto-Oui), recharge l’onglet du site et active Auto-Oui.
4. Si rien ne se passe, clique **Copier le diagnostic de cet onglet** dans le popup : il liste les sélecteurs trouvés, les boutons visibles et la structure des derniers textes, pour t’aider à écrire les bons sélecteurs. ⚠️ Il contient quelques extraits de ta conversation : relis-le avant de le partager (dans une issue par exemple).
5. Lance `npm test` : un test vérifie que `sites.js` et `manifest.json` sont synchronisés.

Pour ajouter des formulations de demande, modifie `PATTERNS` dans `extension/core.js` et ajoute des exemples dans `tests/fixtures.json`.

## Développement et tests

Prérequis : Node.js 20+.

```bash
npm install
npm test
```

Les tests utilisent `jsdom` pour simuler l’interface du chat (envoi unique, brouillon préservé, attente de fin de génération, cartes d’approbation, etc.) et vérifient le manifeste (Manifest V3, permissions minimales, aucun code distant).

### Structure

```
extension/
  manifest.json   Manifest V3
  background.js   service worker : activation par onglet, injection
  core.js         détection des demandes (règles) et réglages
  sites.js        registre des sites et de leurs sélecteurs
  adapters.js     lecture du DOM, remplissage du champ, clics
  content.js      boucle de surveillance injectée dans l’onglet activé
  popup.*         interface du bouton de l’extension
  icons/
tests/            tests node:test + exemples synthétiques
```

### Permissions demandées

- `storage` : mémoriser tes réglages et les onglets activés.
- `activeTab` + `scripting` : injecter le script dans l’onglet où tu cliques **Activer**.
- Accès au site (optionnel, demandé au premier clic) : uniquement les sites listés dans `sites.js`.

## Avertissement

Projet indépendant, non affilié à OpenAI ni à aucun autre éditeur. Les interfaces des sites changent souvent : l’extension peut cesser de fonctionner à tout moment. Vérifie que l’automatisation est compatible avec les conditions d’utilisation des services que tu utilises. Fourni « tel quel », sans garantie (voir [LICENSE](LICENSE)).

---

## English

**Auto-Oui** is a Chrome extension that automatically answers **“Oui” (yes)** when an AI agent asks for your permission, so long-running agent tasks don’t stall waiting for you. It also clicks explicit approval buttons (“Approve”, “Allow”, “Confirm”) inside real approval cards.

- **Runs 100% locally**: no server, no API key, no telemetry, no network requests.
- **Supported sites**: ChatGPT (`chatgpt.com`, `chat.openai.com`), including the “Work” agent view (`/dots/`). New sites can be added in `extension/sites.js` (see “Ajouter un site” above).
- **Detection**: local regex rules for explicit French and English permission requests (“M’autorises-tu… ?”, “Puis-je… ?”, “May I… ?”, “Do you want me to… ?”…). Only the latest agent message is considered; drafts are never overwritten; each request is answered once.

**Install**: download the repo, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select the `extension/` folder.
**Use**: open your agent chat, click the Auto-Oui icon, then **Activer sur cet onglet** (enable on this tab). Click **Désactiver cet onglet** to turn it off. Activation is per tab.
**Develop**: `npm install && npm test` (Node 20+).

> **⚠️ Use at your own risk.** Auto-approving lets the agent act **without your confirmation**. Keep it **off** for sensitive actions such as payments, sending emails or messages, deletions, production deployments, or anything touching your accounts and personal data. Not affiliated with OpenAI. Check that automation complies with the terms of service of the sites you use.

License: [MIT](LICENSE) © 2026 Jason Dupont
