// Registre des sites pris en charge par Auto-Oui.
// Pour ajouter un site : ajoute une entrée ici ET son origine dans
// "optional_host_permissions" de manifest.json (le test tests/manifest.test.js vérifie les deux).
(function (root) {
  const SITES = [
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      origins: ['https://chatgpt.com', 'https://chat.openai.com'],
      selectors: {
        // Messages de l'agent : ChatGPT classique + bulles de la vue agent Work (/dots/).
        assistant: '[data-message-author-role="assistant"], article.message-row:not(.self) .message-bubble',
        // Messages de l'utilisateur (les lignes .self de la vue Work sont les tiens).
        user: '[data-message-author-role="user"], article.message-row.self .message-bubble',
        // Champ de saisie : textarea classique ou éditeur ProseMirror.
        input: '#prompt-textarea, textarea[data-testid="prompt-textarea"], textarea[placeholder], [contenteditable="true"][role="textbox"]',
        send: '[data-testid="send-button"], #composer-submit-button, button[aria-label="Send"], button[aria-label="Send prompt"], button[aria-label="Send message"], button[aria-label="Envoyer le message"], button[aria-label="Envoyer"]',
        // Bouton visible pendant que l'agent écrit encore.
        stop: '[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Arrêter la génération"], button[aria-label="Stop streaming"]',
        // Message en cours de génération (optionnel).
        streaming: '[data-message-author-role="assistant"][data-is-streaming="true"]',
        // Conteneur d'un tour de conversation, où chercher les cartes d'approbation (optionnel).
        turn: '[data-testid^="conversation-turn"], article[data-turn]'
      }
    }
  ];
  function siteForUrl(url) {
    let origin;
    try { origin = new URL(url).origin; } catch { return null; }
    return SITES.find(site => site.origins.includes(origin)) || null;
  }
  function allOrigins() { return SITES.flatMap(site => site.origins); }
  root.AutoOuiSites = { SITES, siteForUrl, allOrigins };
})(globalThis);
