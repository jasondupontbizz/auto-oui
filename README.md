# Auto-Oui ✓

**Extension Chrome qui répond « Oui » automatiquement quand un agent IA te demande une autorisation.**

Tu lances une longue tâche avec un agent, tu pars faire autre chose… et quand tu reviens, il est bloqué depuis 20 minutes sur « M’autorises-tu à continuer ? ». Auto-Oui surveille l’onglet que tu as activé, repère ces demandes d’approbation et répond **Oui** à ta place (ou clique le bouton « Approuver / Autoriser / Confirmer » de la carte d’approbation).

Par défaut, tout est 100 % local : pas de serveur, pas de clé API, pas de télémétrie, **aucun appel réseau**. Si tu veux une détection plus fine, tu peux activer le **mode Jev** (optionnel) avec ta propre clé [TypeSafe](https://docs.typesafe.ai) : Jev juge alors les formulations ambiguës que les règles intégrées ne reconnaissent pas.

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

- **Détection** : *Hybride* (par défaut : règles intégrées, puis Jev si les règles ne trouvent rien), *Jev pour chaque message*, ou *Règles intégrées uniquement*. Sans clé TypeSafe, c’est toujours *Règles intégrées uniquement*, quel que soit ce choix.
- **Seuil Jev** : probabilité minimale renvoyée par Jev pour répondre (0,90 par défaut, entre 0,5 et 1).
- **Réponse envoyée** : `Oui` par défaut (tu peux mettre `Oui, continue`, `Yes`…).
- **Délai de stabilité** : temps pendant lequel le message doit rester identique avant d’agir (1,8 s par défaut).
- **Cliquer aussi les boutons d’approbation** : active/désactive le clic automatique sur les cartes « Approve / Allow / Confirmer ».
- **Sélecteurs avancés** : pour corriger les sélecteurs CSS si l’interface du site change, sans toucher au code.

## Mode Jev (TypeSafe), optionnel

Jev est le modèle de [TypeSafe](https://docs.typesafe.ai). Pour chaque nouveau message de l’agent que les règles ne reconnaissent pas, Auto-Oui lui pose une question oui/non (« L’agent demande-t-il ta permission ? ») et ne répond « Oui » que si la probabilité dépasse le seuil (0,90 par défaut).

### Obtenir et saisir une clé

1. Crée un compte TypeSafe et récupère ta clé API dans ton tableau de bord (voir le [Quick start TypeSafe](https://docs.typesafe.ai/introduction/quickstart)). Les appels sont facturés sur **ton** compte TypeSafe, selon leurs tarifs.
2. Dans le popup d’Auto-Oui : **Réglages → Clé TypeSafe (optionnelle)**, colle ta clé puis clique **Enregistrer la clé**.
3. Chrome te demande l’accès à `api.typesafe.ai` : accepte. Cet accès n’est demandé qu’à ce moment-là, jamais si tu n’enregistres pas de clé.
4. La ligne **Jev (TypeSafe)** du popup passe à **Actif**. Les onglets déjà activés sont mis à jour automatiquement.

Pour revenir aux règles seules : **Supprimer la clé** (la clé est effacée et l’accès à l’API est retiré), ou choisis *Règles intégrées uniquement* dans **Détection**.

### Où est stockée la clé ?

- Uniquement dans `chrome.storage.local` de ton profil Chrome, sur ta machine. Pas de synchronisation, pas de fichier, rien dans le dépôt.
- Elle n’est lue que par le service worker de l’extension, au moment de l’appel à l’API, et envoyée uniquement à `https://api.typesafe.ai` (en-tête `Authorization`).
- Elle n’est jamais affichée, jamais journalisée, jamais transmise à la page du chat, et n’apparaît pas dans le diagnostic.

### Quelles données sont envoyées à TypeSafe ?

- **Sans clé : rien ne quitte ton navigateur.**
- **Avec une clé**, à chaque nouveau message de l’agent qui a besoin de Jev (en mode *Hybride* : ceux que les règles ne reconnaissent pas, donc la plupart des messages ; en mode *Jev pour chaque message* : tous) :
  - le texte du **dernier message de l’agent** (hors blocs de code et citations, 24 000 caractères maximum) ;
  - jusqu’à **3 messages précédents** de la conversation, les tiens compris, comme contexte (4 000 caractères maximum).
- Rien d’autre : pas l’adresse de la page, pas tes cookies, pas ton brouillon, pas les autres onglets. Les résultats sont gardés en mémoire 10 minutes pour éviter de renvoyer le même message.
- Ces textes sont traités par TypeSafe selon ses propres [conditions et politique de confidentialité](https://docs.typesafe.ai/legal). N’active pas Jev sur des conversations contenant des données que tu ne veux pas partager avec un tiers.

### Si l’API ne répond pas

En cas d’erreur (clé refusée, quota, réseau, délai de 14 s dépassé, réponse invalide), Auto-Oui **ne répond jamais « Oui » à cause de l’erreur** : il applique le verdict des règles intégrées. Si elles ne détectent pas de demande, rien n’est envoyé, le popup affiche **Jev indisponible**, et Jev est réinterrogé 30 secondes plus tard.

## Comment ça marche

- **Détection par règles intégrées** (`extension/core.js`), toujours active : des expressions régulières reconnaissent les demandes explicites adressées à toi, en français et en anglais : « M’autorises-tu… », « Tu confirmes… ? », « Puis-je… ? », « Acceptes-tu… ? », « J’attends ton accord », « May I… ? », « Do you want me to… ? », etc.
- Ne déclenchent **pas** de réponse : les comptes rendus (« c’est confirmé, je poursuis »), les questions de préférence (« Tu préfères Python ou JavaScript ? »), les exemples cités, le code et les citations.
- Seul le **dernier message** de la conversation est pris en compte, et seulement s’il vient de l’agent.
- Les **boutons d’approbation** (« Approve », « Allow », « Autoriser », « Confirmer »…) sont cliqués uniquement dans une vraie carte ou boîte de dialogue d’approbation, jamais dans une boîte de dialogue quelconque.
- L’extension attend que l’agent ait fini d’écrire, **ne touche jamais à un brouillon** que tu es en train de taper, vérifie juste avant l’envoi que le message est toujours le même, et ne répond **qu’une seule fois** par demande (même après un rechargement).
- Sans clé TypeSafe, les demandes formulées de façon ambiguë (« je lance, ça te va ? ») ne sont pas détectées : l’agent attend alors ta réponse, comme d’habitude. Avec le mode Jev, c’est Jev qui tranche ces cas.

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

Les tests utilisent `jsdom` pour simuler l’interface du chat (envoi unique, brouillon préservé, attente de fin de génération, cartes d’approbation, etc.), simulent l’API TypeSafe (clé présente ou absente, erreurs, la clé n’apparaît jamais dans les journaux ni le diagnostic) et vérifient le manifeste (Manifest V3, permissions minimales, aucun code distant). Aucun test n’appelle la vraie API.

### Structure

```
extension/
  manifest.json   Manifest V3
  background.js   service worker : activation par onglet, injection
  core.js         détection des demandes (règles) et réglages
  jev.js          appel optionnel à l’API TypeSafe (Jev)
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
- Accès à `api.typesafe.ai` (optionnel) : demandé uniquement quand tu enregistres une clé TypeSafe.

## Avertissement

Projet indépendant, non affilié à OpenAI, à TypeSafe ni à aucun autre éditeur. Les interfaces des sites changent souvent : l’extension peut cesser de fonctionner à tout moment. Vérifie que l’automatisation est compatible avec les conditions d’utilisation des services que tu utilises. Fourni « tel quel », sans garantie (voir [LICENSE](LICENSE)).

---

## English

**Auto-Oui** is a Chrome extension that automatically answers **“Oui” (yes)** when an AI agent asks for your permission, so long-running agent tasks don’t stall waiting for you. It also clicks explicit approval buttons (“Approve”, “Allow”, “Confirm”) inside real approval cards.

- **Runs 100% locally by default**: no server, no API key, no telemetry, no network requests.
- **Optional Jev mode**: paste your own [TypeSafe](https://docs.typesafe.ai) API key (get it from your TypeSafe dashboard) in **Réglages → Clé TypeSafe** and click **Enregistrer la clé**. Chrome then asks for access to `api.typesafe.ai` (requested only at that moment). Jev, TypeSafe’s model, then judges the wording that the built-in rules don’t recognize, and Auto-Oui answers only if the probability is at or above the threshold (0.90 by default). Modes: *Hybride* (rules first, then Jev), *Jev for every message*, *rules only*.
- **Key storage**: only in `chrome.storage.local` of your Chrome profile, read by the extension’s service worker at call time and sent only to `https://api.typesafe.ai`. Never displayed, logged, passed to the chat page or included in diagnostics. **Supprimer la clé** deletes it and revokes the API access.
- **What leaves the browser**: without a key, nothing. With a key, for each new agent message that needs Jev: the latest agent message text (code blocks and quotes removed, max 24,000 characters) and up to the 3 previous messages, yours included, as context (max 4,000 characters). Nothing else (no URL, cookies, drafts or other tabs). Calls are billed to your TypeSafe account.
- **On API errors** (bad key, quota, network, 14 s timeout, invalid answer) it never says yes because of the error: it falls back to the built-in rules, sends nothing if they find no request, shows *Jev indisponible* and retries Jev after 30 s.
- **Supported sites**: ChatGPT (`chatgpt.com`, `chat.openai.com`), including the “Work” agent view (`/dots/`). New sites can be added in `extension/sites.js` (see “Ajouter un site” above).
- **Detection**: local regex rules for explicit French and English permission requests (“M’autorises-tu… ?”, “Puis-je… ?”, “May I… ?”, “Do you want me to… ?”…). Only the latest agent message is considered; drafts are never overwritten; each request is answered once.

**Install**: download the repo, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select the `extension/` folder.
**Use**: open your agent chat, click the Auto-Oui icon, then **Activer sur cet onglet** (enable on this tab). Click **Désactiver cet onglet** to turn it off. Activation is per tab.
**Develop**: `npm install && npm test` (Node 20+).

> **⚠️ Use at your own risk.** Auto-approving lets the agent act **without your confirmation**. Keep it **off** for sensitive actions such as payments, sending emails or messages, deletions, production deployments, or anything touching your accounts and personal data. Not affiliated with OpenAI or TypeSafe. Check that automation complies with the terms of service of the sites you use.

License: [MIT](LICENSE) © 2026 Jason Dupont
