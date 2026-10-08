// Logique pure (sans DOM) : détection des demandes d'approbation et validation des réglages.
(function (root) {
  const DEFAULTS = {
    reply: 'Oui', settleMs: 1800, clickApprovals: true,
    assistantSelector: '', userSelector: '', inputSelector: '', sendSelector: '', stopSelector: ''
  };
  const SELECTOR_FIELDS = ['assistantSelector', 'userSelector', 'inputSelector', 'sendSelector', 'stopSelector'];
  function normalize(text) {
    return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  }
  // Ignore code blocks and quoted lines: they are not addressed to the human.
  function prose(text) {
    return String(text || '').replace(/```[\s\S]*?```/g, '')
      .split('\n').filter(line => !/^\s*>/.test(line)).join('\n');
  }
  const PATTERNS = [
    // FR : « M'autorises-tu… », « Autorisez-vous… »
    /\b(?:(?:m'|me |nous )?autorises?[- ]tu|autorisez[- ]vous)\b/,
    // FR : « Tu confirmes … ? », « Vous m'autorisez … ? »
    /\b(?:tu |vous )(?:(?:me |nous )?autorise[sz]|confirmes?|confirmez)\b[^.!?]{0,100}\?/,
    // FR : « Confirmes-tu… »
    /\bconfirme[sz]?[- ](?:tu|vous)\b/,
    // FR : « Acceptes-tu… », « Approuves-tu… »
    /\b(?:acceptes?[- ]tu|acceptez[- ]vous|approuves?[- ]tu|approuvez[- ]vous)\b[^.!?]{0,240}\?/,
    // FR : « Peux-tu confirmer / autoriser / approuver… »
    /\b(?:peux[- ]tu|pouvez[- ]vous)\s+(?:me\s+)?(?:confirmer|autoriser|approuver|valider|donner (?:ton|votre) (?:accord|feu vert))\b/,
    // FR : « Puis-je… ? », « Est-ce que je peux… ? »
    /\b(?:puis-je|pouvons-nous|est-ce que je peux)\b[^.!?]{0,240}\?/,
    // FR : « Es-tu d'accord pour… ? », « Tu es d'accord… ? »
    /\b(?:es-tu|etes-vous|tu es|vous etes) d'accord\b[^.!?]{0,200}\?/,
    // FR : « J'ai besoin de ton accord », « J'attends ta confirmation »
    /\b(?:j'ai besoin|il (?:me )?faut|j'attends|je suis en attente)\b[^.!?]{0,100}\b(?:ton|ta|votre|de ton|de ta|de votre) (?:accord|autorisation|approbation|confirmation|feu vert|validation)\b/,
    // EN
    /\b(?:do (?:you|i) have (?:your )?permission|may i|shall i|can i proceed|can i go ahead|should i (?:continue|proceed|go ahead)|would you like me to|do you want me to|do you approve|is it ok(?:ay)? (?:if i|to)|ok(?:ay)? to proceed)\b[^.!?]{0,200}\?/,
    /\b(?:please (?:approve|authorize|confirm)|awaiting your (?:approval|permission|confirmation)|i need your (?:approval|permission|go-ahead))\b/
  ];
  // Explanations or quotations *about* approval requests are not requests.
  const META = /\b(?:par exemple|exemple de|la phrase|le message|il (?:me |te )?demande|comment demander|example of|the phrase)\b/;
  function localApproval(text) {
    const t = normalize(prose(text));
    if (META.test(t)) return false;
    return PATTERNS.some(pattern => pattern.test(t));
  }
  function approvalLabel(label) {
    return /^(?:oui|yes|approve|approve once|approve and continue|allow|allow once|always allow|allow always|confirm|confirm custom rule|approuver|approuver et continuer|autoriser|autoriser une fois|toujours autoriser|confirmer|confirmer la regle|accepter)$/.test(normalize(label));
  }
  function validateSettings(input) {
    const settings = {};
    const source = { ...DEFAULTS, ...input };
    settings.settleMs = Number(source.settleMs);
    if (!Number.isFinite(settings.settleMs) || settings.settleMs < 500 || settings.settleMs > 15000) throw new Error('Délai : entre 500 et 15000 ms.');
    settings.reply = String(source.reply || '').trim();
    if (!settings.reply || settings.reply.length > 500) throw new Error('Réponse : 1 à 500 caractères.');
    settings.clickApprovals = Boolean(source.clickApprovals);
    for (const name of SELECTOR_FIELDS) settings[name] = String(source[name] || '').trim();
    return settings;
  }
  root.AutoOuiCore = { DEFAULTS, SELECTOR_FIELDS, normalize, prose, localApproval, approvalLabel, validateSettings };
})(globalThis);
