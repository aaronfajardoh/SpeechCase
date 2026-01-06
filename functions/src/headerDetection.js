/* eslint-disable max-len */
/**
 * Header Detection Module
 * Detects semantic headers in plain text (no formatting cues available)
 * Uses weighted scoring approach with multiple signals
 */

// Common verb stems in English and Spanish (for semantic cue)
/* eslint-disable quotes */
const VERB_STEMS = new Set([
  // English common verbs
  "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "having",
  "do", "does", "did", "doing", "done",
  "will", "would", "can", "could", "should", "may", "might",
  "get", "got", "getting", "go", "went", "going", "gone",
  "make", "made", "making", "take", "took", "taking", "taken",
  "see", "saw", "seeing", "seen", "say", "said", "saying",
  "come", "came", "coming", "know", "knew", "knowing", "known",
  "think", "thought", "thinking", "want", "wanted", "wanting",
  "use", "used", "using", "find", "found", "finding",
  "give", "gave", "giving", "given", "tell", "told", "telling",
  "work", "worked", "working", "call", "called", "calling",
  "try", "tried", "trying", "ask", "asked", "asking",
  "need", "needed", "needing", "feel", "felt", "feeling",
  "become", "became", "becoming", "leave", "left", "leaving",
  "put", "putting", "mean", "meant", "meaning", "keep", "kept", "keeping",
  "let", "letting", "begin", "began", "beginning", "begun",
  "seem", "seemed", "seeming", "help", "helped", "helping",
  "show", "showed", "showing", "shown", "hear", "heard", "hearing",
  "play", "played", "playing", "run", "ran", "running",
  "move", "moved", "moving", "live", "lived", "living",
  "believe", "believed", "believing", "bring", "brought", "bringing",
  "happen", "happened", "happening", "write", "wrote", "writing", "written",
  "sit", "sat", "sitting", "stand", "stood", "standing",
  "lose", "lost", "losing", "pay", "paid", "paying",
  "meet", "met", "meeting", "include", "included", "including",
  "continue", "continued", "continuing", "set", "setting",
  "learn", "learned", "learning", "change", "changed", "changing",
  "lead", "led", "leading", "understand", "understood", "understanding",
  "watch", "watched", "watching", "follow", "followed", "following",
  "stop", "stopped", "stopping", "create", "created", "creating",
  "speak", "spoke", "speaking", "spoken", "read", "reading",
  "spend", "spent", "spending", "grow", "grew", "growing", "grown",
  "open", "opened", "opening", "walk", "walked", "walking",
  "win", "won", "winning", "offer", "offered", "offering",
  "remember", "remembered", "remembering", "love", "loved", "loving",
  "consider", "considered", "considering", "appear", "appeared", "appearing",
  "buy", "bought", "buying", "wait", "waited", "waiting",
  "serve", "served", "serving", "die", "died", "dying",
  "send", "sent", "sending", "build", "built", "building",
  "stay", "stayed", "staying", "fall", "fell", "falling", "fallen",
  "cut", "cutting", "reach", "reached", "reaching",
  "kill", "killed", "killing", "raise", "raised", "raising",
  "pass", "passed", "passing", "sell", "sold", "selling",
  "decide", "decided", "deciding", "return", "returned", "returning",
  "explain", "explained", "explaining", "develop", "developed", "developing",
  "carry", "carried", "carrying", "break", "broke", "breaking", "broken",
  "receive", "received", "receiving", "agree", "agreed", "agreeing",
  "support", "supported", "supporting", "hit", "hitting",
  "produce", "produced", "producing", "eat", "ate", "eating", "eaten",
  "cover", "covered", "covering", "catch", "caught", "catching",
  "draw", "drew", "drawing", "drawn", "choose", "chose", "choosing", "chosen",
  // Spanish common verbs (abbreviated list - full list in original)
  "ser", "es", "son", "era", "eran", "fue", "fueron", "sido", "siendo",
  "estar", "está", "están", "estaba", "estaban", "estuvo", "estuvieron", "estado", "estando",
  "tener", "tiene", "tienen", "tenía", "tenían", "tuvo", "tuvieron", "tenido", "teniendo",
  "hacer", "hace", "hacen", "hacía", "hacían", "hizo", "hicieron", "hecho", "haciendo",
  "poder", "puede", "pueden", "podía", "podían", "pudo", "pudieron", "podido", "pudiendo",
  "decir", "dice", "dicen", "decía", "decían", "dijo", "dijeron", "dicho", "diciendo",
  "ir", "va", "van", "iba", "iban", "fue", "fueron", "ido", "yendo",
  "ver", "ve", "ven", "veía", "veían", "vio", "vieron", "visto", "viendo",
  "dar", "da", "dan", "daba", "daban", "dio", "dieron", "dado", "dando",
  "saber", "sabe", "saben", "sabía", "sabían", "sabio", "supieron", "sabido", "sabiendo",
  "querer", "quiere", "quieren", "quería", "querían", "quiso", "quisieron", "querido", "queriendo",
  "llegar", "llega", "llegan", "llegaba", "llegaban", "llegó", "llegaron", "llegado", "llegando",
  "pasar", "pasa", "pasan", "pasaba", "pasaban", "pasó", "pasaron", "pasado", "pasando",
  "deber", "debe", "deben", "debía", "debían", "debió", "debieron", "debido", "debiendo",
  "poner", "pone", "ponen", "ponía", "ponían", "puso", "pusieron", "puesto", "poniendo",
  "parecer", "parece", "parecen", "parecía", "parecían", "pareció", "parecieron", "parecido", "pareciendo",
  "quedar", "queda", "quedan", "quedaba", "quedaban", "quedó", "quedaron", "quedado", "quedando",
  "hablar", "habla", "hablan", "hablaba", "hablaban", "habló", "hablaron", "hablado", "hablando",
  "llevar", "lleva", "llevan", "llevaba", "llevaban", "llevó", "llevaron", "llevado", "llevando",
  "seguir", "sigue", "siguen", "seguía", "seguían", "siguió", "siguieron", "seguido", "siguiendo",
  "encontrar", "encuentra", "encuentran", "encontraba", "encontraban", "encontró", "encontraron", "encontrado", "encontrando",
  "llamar", "llama", "llaman", "llamaba", "llamaban", "llamó", "llamaron", "llamado", "llamando",
  "venir", "viene", "vienen", "venía", "venían", "vino", "vinieron", "venido", "viniendo",
  "pensar", "piensa", "piensan", "pensaba", "pensaban", "pensó", "pensaron", "pensado", "pensando",
  "salir", "sale", "salen", "salía", "salían", "salió", "salieron", "salido", "saliendo",
  "volver", "vuelve", "vuelven", "volvía", "volvían", "volvió", "volvieron", "vuelto", "volviendo",
  "tomar", "toma", "toman", "tomaba", "tomaban", "tomó", "tomaron", "tomado", "tomando",
  "conocer", "conoce", "conocen", "conocía", "conocían", "conoció", "conocieron", "conocido", "conociendo",
  "vivir", "vive", "viven", "vivía", "vivían", "vivió", "vivieron", "vivido", "viviendo",
  "sentir", "siente", "sienten", "sentía", "sentían", "sintió", "sintieron", "sentido", "sintiendo",
  "tratar", "trata", "tratan", "trataba", "trataban", "trató", "trataron", "tratado", "tratando",
  "mirar", "mira", "miran", "miraba", "miraban", "miró", "miraron", "mirado", "mirando",
  "contar", "cuenta", "cuentan", "contaba", "contaban", "contó", "contaron", "contado", "contando",
  "empezar", "empieza", "empiezan", "empezaba", "empezaban", "empezó", "empezaron", "empezado", "empezando",
  "esperar", "espera", "esperan", "esperaba", "esperaban", "esperó", "esperaron", "esperado", "esperando",
  "buscar", "busca", "buscan", "busca", "buscaban", "buscó", "buscaron", "buscado", "buscando",
  "existir", "existe", "existen", "existía", "existían", "existió", "existieron", "existido", "existiendo",
  "entrar", "entra", "entran", "entraba", "entraban", "entró", "entraron", "entrado", "entrando",
  "trabajar", "trabaja", "trabajan", "trabajaba", "trabajaban", "trabajó", "trabajaron", "trabajado", "trabajando",
  "escribir", "escribe", "escriben", "escribía", "escribían", "escribió", "escribieron", "escrito", "escribiendo",
  "perder", "pierde", "pierden", "perdía", "perdían", "perdió", "perdieron", "perdido", "perdiendo",
  "producir", "produce", "producen", "producía", "producían", "produjo", "produjeron", "producido", "produciendo",
  "ocurrir", "ocurre", "ocurren", "ocurría", "ocurrían", "ocurrió", "ocurrieron", "ocurrido", "ocurriendo",
  "entender", "entiende", "entienden", "entendía", "entendían", "entendió", "entendieron", "entendido", "entendiendo",
  "pedir", "pide", "piden", "pedía", "pedían", "pidió", "pidieron", "pedido", "pidiendo",
  "recibir", "recibe", "reciben", "recibía", "recibían", "recibió", "recibieron", "recibido", "recibiendo",
  "recordar", "recuerda", "recuerdan", "recordaba", "recordaban", "recordó", "recordaron", "recordado", "recordando",
  "terminar", "termina", "terminan", "terminaba", "terminaban", "terminó", "terminaron", "terminado", "terminando",
  "permitir", "permite", "permiten", "permitía", "permitían", "permitió", "permitieron", "permitido", "permitiendo",
  "aparecer", "aparece", "aparecen", "aparecía", "aparecían", "apareció", "aparecieron", "aparecido", "apareciendo",
  "conseguir", "consigue", "consiguen", "conseguía", "conseguían", "consiguió", "consiguieron", "conseguido", "consiguiendo",
  "comenzar", "comienza", "comienzan", "comenzaba", "comenzaban", "comenzó", "comenzaron", "comenzado", "comenzando",
  "servir", "sirve", "sirven", "servía", "servían", "sirvió", "sirvieron", "servido", "sirviendo",
  "sacar", "saca", "sacan", "sacaba", "sacaban", "sacó", "sacaron", "sacado", "sacando",
  "necesitar", "necesita", "necesitan", "necesitaba", "necesitaban", "necesitó", "necesitaron", "necesitado", "necesitando",
  "mantener", "mantiene", "mantienen", "mantenía", "mantenían", "mantuvo", "mantuvieron", "mantenido", "mantiendo",
  "resultar", "resulta", "resultan", "resultaba", "resultaban", "resultó", "resultaron", "resultado", "resultando",
  "leer", "lee", "leen", "leía", "leían", "leyó", "leyeron", "leído", "leyendo",
  "caer", "cae", "caen", "caía", "caían", "cayó", "cayeron", "caído", "cayendo",
  "cambiar", "cambia", "cambian", "cambiaba", "cambiaban", "cambió", "cambiaron", "cambiado", "cambiando",
  "presentar", "presenta", "presentan", "presentaba", "presentaban", "presentó", "presentaron", "presentado", "presentando",
  "crear", "crea", "crean", "creaba", "creaban", "creó", "crearon", "creado", "creando",
  "abrir", "abre", "abren", "abría", "abrían", "abrió", "abrieron", "abierto", "abriendo",
  "subir", "sube", "suben", "subía", "subían", "subió", "subieron", "subido", "subiendo",
  "cerrar", "cierra", "cierran", "cerraba", "cerraban", "cerró", "cerraron", "cerrado", "cerrando",
  "ganar", "gana", "ganan", "ganaba", "ganaban", "ganó", "ganaron", "ganado", "ganando",
  "pertenecer", "pertenece", "pertenecen", "pertenecía", "pertenecían", "perteneció", "pertenecieron", "pertenecido", "perteneciendo",
  "morir", "muere", "mueren", "moría", "morían", "murió", "murieron", "muerto", "muriendo",
  "aceptar", "acepta", "aceptan", "aceptaba", "aceptaban", "aceptó", "aceptaron", "aceptado", "aceptando",
  "realizar", "realiza", "realizan", "realizaba", "realizaban", "realizó", "realizaron", "realizado", "realizando",
  "suponer", "supone", "suponen", "suponía", "suponían", "supuso", "supusieron", "supuesto", "suponiendo",
  "comprender", "comprende", "comprenden", "comprendía", "comprendían", "comprendió", "comprendieron", "comprendido", "comprendiendo",
  "lograr", "logra", "logran", "lograba", "lograban", "logró", "lograron", "logrado", "logrando",
  "explicar", "explica", "explican", "explicaba", "explicaban", "explicó", "explicaron", "explicado", "explicando",
  "preguntar", "pregunta", "preguntan", "preguntaba", "preguntaban", "preguntó", "preguntaron", "preguntado", "preguntando",
  "tocar", "toca", "tocan", "tocaba", "tocaban", "tocó", "tocaron", "tocado", "tocando",
  "reconocer", "reconoce", "reconocen", "reconocía", "reconocían", "reconoció", "reconocieron", "reconocido", "reconociendo",
  "estudiar", "estudia", "estudian", "estudiaba", "estudiaban", "estudió", "estudiaron", "estudiado", "estudiando",
  "alcanzar", "alcanza", "alcanzan", "alcanzaba", "alcanzaban", "alcanzó", "alcanzaron", "alcanzado", "alcanzando",
  "nacer", "nace", "nacen", "nacía", "nacían", "nació", "nacieron", "nacido", "naciendo",
  "dirigir", "dirige", "dirigen", "dirigía", "dirigían", "dirigió", "dirigieron", "dirigido", "dirigiendo",
  "correr", "corre", "corren", "corría", "corrían", "corrió", "corrieron", "corrido", "corriendo",
  "utilizar", "utiliza", "utilizan", "utilizaba", "utilizaban", "utilizó", "utilizaron", "utilizado", "utilizando",
  "pagar", "paga", "pagan", "pagaba", "pagaban", "pagó", "pagaron", "pagado", "pagando",
  "ayudar", "ayuda", "ayudan", "ayudaba", "ayudaban", "ayudó", "ayudaron", "ayudado", "ayudando",
  "gustar", "gusta", "gustan", "gustaba", "gustaban", "gustó", "gustaron", "gustado", "gustando",
  "jugar", "juega", "juegan", "jugaba", "jugaban", "jugó", "jugaron", "jugado", "jugando",
  "escuchar", "escucha", "escuchan", "escuchaba", "escuchaban", "escuchó", "escucharon", "escuchado", "escuchando",
  "cumplir", "cumple", "cumplen", "cumplía", "cumplían", "cumplió", "cumplieron", "cumplido", "cumpliendo",
  "ofrecer", "ofrece", "ofrecen", "ofrecía", "ofrecían", "ofreció", "ofrecieron", "ofrecido", "ofreciendo",
  "descubrir", "descubre", "descubren", "descubría", "descubrían", "descubrió", "descubrieron", "descubierto", "descubriendo",
  "levantar", "levanta", "levantan", "levantaba", "levantaban", "levantó", "levantaron", "levantado", "levantando",
  "intentar", "intenta", "intentan", "intentaba", "intentaban", "intentó", "intentaron", "intentado", "intentando",
  "usar", "usa", "usan", "usaba", "usaban", "usó", "usaron", "usado", "usando",
  "acabar", "acaba", "acaban", "acababa", "acababan", "acabó", "acabaron", "acabado", "acabando",
]);

// Functional words (articles, prepositions, conjunctions) - common in headers
const FUNCTIONAL_WORDS = new Set([
  // English
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with", "by", "from", "as", "is", "was", "are", "were",
  // Spanish
  "el", "la", "los", "las", "un", "una", "unos", "unas", "y", "o", "pero", "de", "del", "a", "al", "en", "con", "por", "para", "desde", "hasta", "sobre", "entre", "sin", "según", "durante", "mediante", "contra", "hacia", "tras", "ante", "bajo", "cabe", "so", "es", "son", "era", "eran", "fue", "fueron",
]);
/* eslint-enable quotes */

/**
 * Check if a word is likely a verb
 * @param {string} word - Word to check
 * @return {boolean}
 */
function isVerb(word) {
  const lower = word.toLowerCase().trim();
  // Check exact match
  if (VERB_STEMS.has(lower)) return true;

  // Check if word starts with a verb stem (for conjugated forms)
  for (const stem of VERB_STEMS) {
    if (lower.startsWith(stem) && lower.length > stem.length) {
      // Additional check: common verb endings
      const ending = lower.slice(stem.length);
      // eslint-disable-next-line max-len
      if (/^(s|ed|ing|er|est|ly|tion|sion|ment|ance|ence|able|ible|ive|ous|ful|less|ness|ity|al|ic|ical|ize|ise|ify|ate)$/i.test(ending)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a word is a functional word
 * @param {string} word - Word to check
 * @return {boolean}
 */
function isFunctionalWord(word) {
  return FUNCTIONAL_WORDS.has(word.toLowerCase().trim());
}

/**
 * Count capitalized words in a text segment
 * @param {string} text - Text segment
 * @return {number} Count of capitalized words
 */
function countCapitalizedWords(text) {
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
  let count = 0;
  for (const word of words) {
    // Remove punctuation for checking
    const cleanWord = word.replace(/[^\w]/g, "");
    if (cleanWord.length > 0 && /^[A-Z]/.test(cleanWord)) {
      count++;
    }
  }
  return count;
}

/**
 * Count total words in a text segment
 * @param {string} text - Text segment
 * @return {number} Word count
 */
function countWords(text) {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Detect if a text segment is likely a header
 * @param {string} text - Text segment to analyze
 * @param {string} followingText - Optional: text that follows this segment (for context)
 * @return {Object} { isHeader: boolean, confidence: number, signals: Object }
 */
function detectHeader(text, followingText = "") {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return {isHeader: false, confidence: 0, signals: {}};
  }

  const trimmed = text.trim();
  const signals = {};
  let confidence = 0;

  // Signal A: Title-Case Cluster Detection
  const wordCount = countWords(trimmed);
  const capitalizedCount = countCapitalizedWords(trimmed);
  const capitalizedRatio = wordCount > 0 ? capitalizedCount / wordCount : 0;

  signals.titleCaseRatio = capitalizedRatio;
  signals.capitalizedWords = capitalizedCount;
  signals.totalWords = wordCount;

  // Bonus for high ratio of capitalized words
  if (capitalizedRatio >= 0.5 && wordCount > 1) {
    confidence += 0.25;
  } else if (capitalizedRatio >= 0.3 && wordCount > 1) {
    confidence += 0.15;
  }

  // Extra bonus if most words are capitalized and no ending punctuation
  if (capitalizedRatio >= 0.6 && !/[.!?]$/.test(trimmed)) {
    confidence += 0.1;
  }

  // Signal B: Punctuation Signal
  const lastChar = trimmed[trimmed.length - 1];
  const hasEndingPunctuation = /[.!?,]/.test(lastChar);
  const endsWithColon = lastChar === ":";

  signals.endingPunctuation = lastChar;
  signals.endsWithColon = endsWithColon;

  if (!hasEndingPunctuation) {
    // No ending punctuation is a strong header signal
    confidence += 0.2;
  } else if (endsWithColon) {
    // Colon can indicate a title/header
    confidence += 0.15;
  } else {
    // Period, comma, or question mark penalize
    confidence -= 0.2;
  }

  // Signal C: Length Signal
  signals.length = trimmed.length;

  if (wordCount >= 2 && wordCount <= 15) {
    // Ideal header length
    confidence += 0.15;
  } else if (wordCount === 1) {
    // Single word headers are possible but less confident
    confidence += 0.05;
  } else if (wordCount > 15) {
    // Too long, likely not a header
    confidence -= 0.15;
  }

  // Check for functional words (common in headers)
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  const functionalWordCount = words.filter((w) => isFunctionalWord(w)).length;
  const functionalRatio = wordCount > 0 ? functionalWordCount / wordCount : 0;

  signals.functionalWords = functionalWordCount;
  signals.functionalRatio = functionalRatio;

  // Some functional words are OK in headers, but too many suggests it's a sentence
  if (functionalRatio > 0.5) {
    confidence -= 0.1;
  } else if (functionalRatio > 0 && functionalRatio <= 0.3) {
    // Some functional words are normal in headers
    confidence += 0.05;
  }

  // Signal D: Following-Text Signal
  if (followingText && followingText.trim().length > 0) {
    const firstWord = followingText.trim().split(/\s+/)[0];
    const firstWordCapitalized = firstWord && /^[A-Z]/.test(firstWord.replace(/[^\w]/g, ""));

    signals.followingTextStartsCapital = firstWordCapitalized;

    if (firstWordCapitalized) {
      // Next text starts with capital - positive signal for header
      confidence += 0.15;
    }
  }

  // Signal E: Semantic Cue (absence of verbs)
  const verbCount = words.filter((w) => isVerb(w)).length;
  const verbRatio = wordCount > 0 ? verbCount / wordCount : 0;

  signals.verbCount = verbCount;
  signals.verbRatio = verbRatio;

  if (verbCount === 0 && wordCount > 1) {
    // No verbs - strong header signal
    confidence += 0.2;
  } else if (verbRatio < 0.2) {
    // Very few verbs
    confidence += 0.1;
  } else if (verbRatio >= 0.3) {
    // Many verbs - likely a sentence
    confidence -= 0.2;
  }

  // Signal F: High ratio of title words (nouns, proper nouns, adjectives)
  // This is approximated by checking for words that are capitalized and not verbs
  let titleWordCount = 0;
  for (const word of words) {
    const cleanWord = word.replace(/[^\w]/g, "");
    if (cleanWord.length > 0 && /^[A-Z]/.test(cleanWord) && !isVerb(cleanWord)) {
      titleWordCount++;
    }
  }

  const titleWordRatio = wordCount > 0 ? titleWordCount / wordCount : 0;
  signals.titleWords = titleWordCount;
  signals.titleWordRatio = titleWordRatio;

  if (titleWordRatio >= 0.5) {
    confidence += 0.15;
  } else if (titleWordRatio >= 0.3) {
    confidence += 0.08;
  }

  // Normalize confidence to 0-1 range
  confidence = Math.max(0, Math.min(1, confidence));

  // Determine if it's a header (threshold: 0.4)
  const isHeader = confidence >= 0.4;

  return {
    isHeader,
    confidence,
    signals,
  };
}

module.exports = {detectHeader};

