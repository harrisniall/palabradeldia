(function() {
  'use strict';

  const LEVELS = ['easy', 'medium', 'hard'];
  const LEVEL_NAMES = { easy: 'Fácil', medium: 'Medio', hard: 'Difícil' };
  const POS_NAMES = {
    n: 'sustantivo', v: 'verbo', adj: 'adjetivo', adv: 'adverbio',
    prep: 'preposición', conj: 'conjunción', pron: 'pronombre',
    int: 'interjección', art: 'artículo', det: 'determinante',
    expr: 'expresión'
  };

  const EPOCH = new Date(2026, 0, 1); // Jan 1, 2026
  // Fixed seeds per level for deterministic shuffles
  const LEVEL_SEEDS = { easy: 314159, medium: 271828, hard: 161803 };

  // --- Seeded PRNG (Mulberry32) ---
  function mulberry32(seed) {
    return function() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // --- Fisher-Yates shuffle with seeded PRNG ---
  function seededShuffle(arr, seed) {
    const rng = mulberry32(seed);
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // Pre-shuffle each pool once (deterministic, same every load)
  const SHUFFLED_POOLS = {
    easy: seededShuffle(WORDS_EASY, LEVEL_SEEDS.easy),
    medium: seededShuffle(WORDS_MEDIUM, LEVEL_SEEDS.medium),
    hard: seededShuffle(WORDS_HARD, LEVEL_SEEDS.hard),
  };

  // --- Day number since epoch ---
  function dayNumber(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const e = new Date(EPOCH.getFullYear(), EPOCH.getMonth(), EPOCH.getDate());
    return Math.floor((d - e) / (24 * 60 * 60 * 1000));
  }

  // --- Get words for a specific date (no repeats until pool exhausted) ---
  function getWordsForDate(date) {
    const dayIdx = dayNumber(date);
    const words = [];
    for (const level of LEVELS) {
      const pool = SHUFFLED_POOLS[level];
      const idx = dayIdx % pool.length;
      words.push({ ...pool[idx], level });
    }
    return words;
  }

  // --- Levenshtein distance ---
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(
          dp[i-1][j] + 1,
          dp[i][j-1] + 1,
          dp[i-1][j-1] + (a[i-1] !== b[j-1] ? 1 : 0)
        );
      }
    }
    return dp[m][n];
  }

  // --- Normalize for comparison (remove accents, lowercase) ---
  function normalize(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  // --- Generate hint string ---
  function generateHint(word) {
    if (word.length <= 3) return word[0] + '_'.repeat(word.length - 1);
    if (word.length <= 5) {
      return word.slice(0, 1) + ' '.repeat(0) +
        '_'.repeat(word.length - 2).split('').join(' ') +
        ' ' + word.slice(-1);
    }
    const show = Math.min(2, Math.floor(word.length / 3));
    const hidden = word.length - show * 2;
    return word.slice(0, show) + ' ' +
      '_ '.repeat(hidden).trim() +
      ' ' + word.slice(-show);
  }

  // --- Storage helpers ---
  function getStorage() {
    try {
      return JSON.parse(localStorage.getItem('palabradeldia') || '{}');
    } catch { return {}; }
  }

  function setStorage(data) {
    localStorage.setItem('palabradeldia', JSON.stringify(data));
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  function toISODate(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  function isToday(date) {
    const now = new Date();
    return date.getFullYear() === now.getFullYear() &&
           date.getMonth() === now.getMonth() &&
           date.getDate() === now.getDate();
  }

  function isFuture(date) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return d > today;
  }

  function isAtMin(date) {
    return date.getFullYear() === EPOCH.getFullYear() &&
           date.getMonth() === EPOCH.getMonth() &&
           date.getDate() === EPOCH.getDate();
  }

  // --- App State ---
  let selectedDate = new Date();
  let currentWords = [];
  let currentIndex = 0;
  let attempts = 0;
  let results = [];
  let hintUsed = false;
  let activeTab = 'daily';

  // --- Practice State ---
  let practiceQueue = [];
  let practiceIndex = 0;
  let practiceAttempts = 0;
  let practiceHintUsed = false;
  let practiceResults = [];

  // --- DOM refs ---
  const $ = id => document.getElementById(id);
  const dateEl = $('today-date');
  const dateBtn = $('date-btn');
  const datePicker = $('date-picker');
  const prevDayBtn = $('prev-day');
  const nextDayBtn = $('next-day');
  const todayLink = $('today-link');
  const levelBadge = $('level-badge');
  const emojiDisplay = $('emoji-display');
  const englishText = $('english-text');
  const posTag = $('pos-tag');
  const englishWord = $('english-word');
  const hintTooltip = $('hint-tooltip');
  const hintNote = $('hint-note');
  const guessForm = $('guess-form');
  const guessInput = $('guess-input');
  const feedback = $('feedback');
  const actions = $('actions');
  const revealBtn = $('reveal-btn');
  const result = $('result');
  const resultWord = $('result-word');
  const resultContext = $('result-context');
  const nextBtn = $('next-btn');
  const wordCard = $('word-card');
  const summary = $('summary');
  const summaryWords = $('summary-words');
  const streakCount = $('streak-count');

  // --- Practice DOM refs ---
  const practiceArea = $('practice-area');
  const gameArea = $('game-area');
  const pSetup = $('practice-setup');
  const pGame = $('practice-game');
  const pSummaryEl = $('practice-summary');
  const pProgressFill = $('practice-progress-fill');
  const pProgressText = $('practice-progress-text');
  const pLevelBadge = $('p-level-badge');
  const pEmojiDisplay = $('p-emoji-display');
  const pEnglishText = $('p-english-text');
  const pPosTag = $('p-pos-tag');
  const pEnglishWord = $('p-english-word');
  const pHintTooltip = $('p-hint-tooltip');
  const pHintNote = $('p-hint-note');
  const pGuessForm = $('p-guess-form');
  const pGuessInput = $('p-guess-input');
  const pFeedback = $('p-feedback');
  const pActions = $('p-actions');
  const pRevealBtn = $('p-reveal-btn');
  const pResult = $('p-result');
  const pResultWord = $('p-result-word');
  const pResultContext = $('p-result-context');
  const pNextBtn = $('p-next-btn');
  const pWordCard = $('practice-word-card');
  const pHistory = $('practice-history');
  const pLastScore = $('practice-last-score');
  const pScoreText = $('practice-score-text');
  const pSummaryWords = $('practice-summary-words');
  const toggleError = $('toggle-error');
  const startPracticeBtn = $('start-practice-btn');
  const practiceAgainBtn = $('practice-again-btn');
  const practiceBackBtn = $('practice-back-btn');

  // --- Format date ---
  function formatDate(date) {
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const str = date.toLocaleDateString('es-ES', opts);
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // --- Update date display and nav buttons ---
  function updateDateUI() {
    dateEl.textContent = formatDate(selectedDate);
    datePicker.value = toISODate(selectedDate);
    datePicker.max = toISODate(new Date());

    // Disable prev if at epoch, disable next if at today
    prevDayBtn.disabled = isAtMin(selectedDate);
    const tomorrow = new Date(selectedDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    nextDayBtn.disabled = isFuture(tomorrow);

    // Show/hide "return to today" link
    if (isToday(selectedDate)) {
      todayLink.classList.add('hidden');
    } else {
      todayLink.classList.remove('hidden');
    }
  }

  // --- Update progress bar ---
  function updateProgress() {
    const steps = document.querySelectorAll('.step');
    const connectors = document.querySelectorAll('.connector');

    steps.forEach((step, i) => {
      step.classList.remove('active', 'done');
      if (i < currentIndex) step.classList.add('done');
      else if (i === currentIndex) step.classList.add('active');
    });

    connectors.forEach((conn, i) => {
      conn.classList.toggle('done', i < currentIndex);
    });
  }

  // --- Show current word ---
  function showWord() {
    const word = currentWords[currentIndex];
    attempts = 0;
    hintUsed = false;

    levelBadge.textContent = LEVEL_NAMES[word.level];
    levelBadge.className = 'level-badge ' + word.level;
    emojiDisplay.textContent = word.emoji;
    englishText.textContent = word.en;
    posTag.textContent = POS_NAMES[word.pos] || word.pos;
    hintTooltip.textContent = generateHint(word.es);

    englishWord.classList.remove('show-hint');
    hintNote.classList.remove('used');
    hintNote.textContent = '💡 Click the word above for a hint';

    guessInput.value = '';
    guessInput.disabled = false;
    feedback.className = 'feedback hidden';
    feedback.textContent = '';
    actions.classList.add('hidden');
    result.classList.add('hidden');
    guessForm.classList.remove('hidden');

    updateProgress();

    setTimeout(() => guessInput.focus(), 100);
  }

  // --- Check guess ---
  function checkGuess(guess) {
    const word = currentWords[currentIndex];
    const normalizedGuess = normalize(guess);
    const normalizedAnswer = normalize(word.es);

    if (normalizedGuess === normalizedAnswer) {
      const isAccentPerfect = guess.toLowerCase().trim() === word.es.toLowerCase();
      showCorrect(word, true, isAccentPerfect);
      return;
    }

    const dist = levenshtein(normalizedGuess, normalizedAnswer);
    attempts++;

    if (dist === 1) {
      showFeedback('close', '🤏 ¡Casi! Solo una letra de diferencia. Inténtalo de nuevo.');
    } else if (dist === 2) {
      showFeedback('close', '🔤 ¡Cerca! Revisa la ortografía — estás a dos letras.');
    } else if (normalizedAnswer.includes(normalizedGuess) || normalizedGuess.includes(normalizedAnswer)) {
      showFeedback('close', '📏 Vas por buen camino, pero la longitud no es correcta.');
    } else {
      showFeedback('wrong', '❌ No es correcto. ¡Sigue intentando!');
    }

    actions.classList.remove('hidden');

    guessInput.classList.add('shake');
    setTimeout(() => guessInput.classList.remove('shake'), 300);
  }

  function showFeedback(type, message) {
    feedback.className = `feedback ${type}`;
    feedback.textContent = message;
  }

  function showCorrect(word, guessed, accentPerfect) {
    guessInput.disabled = true;
    guessForm.classList.add('hidden');
    feedback.className = 'feedback hidden';
    actions.classList.add('hidden');

    result.classList.remove('hidden');
    resultWord.textContent = word.es;
    resultWord.className = 'result-word';

    let context = '';
    if (guessed) {
      if (!accentPerfect && word.es.toLowerCase().trim() !== normalize(word.es)) {
        context += `✅ ¡Correcto! Nota: la ortografía exacta es "${word.es}" (con tildes).\n`;
      } else {
        context += '✅ ¡Perfecto!\n';
      }
    } else {
      context += '📝 Para recordar:\n';
      resultWord.classList.add('revealed');
    }

    context += `${word.emoji} ${word.en} → ${word.es} (${POS_NAMES[word.pos] || word.pos})`;

    if (word.ctx) {
      context += `\n💬 "${word.ctx}"`;
    }

    resultContext.textContent = context;

    results.push({
      word,
      guessed,
      attempts,
      hintUsed
    });

    emojiDisplay.classList.add('pop');
    setTimeout(() => emojiDisplay.classList.remove('pop'), 300);
  }

  // --- Reveal answer ---
  function revealAnswer() {
    const word = currentWords[currentIndex];
    showCorrect(word, false, false);
  }

  // --- Next word ---
  function nextWord() {
    currentIndex++;
    if (currentIndex >= currentWords.length) {
      showSummary();
    } else {
      showWord();
    }
  }

  // --- Show summary ---
  function showSummary() {
    wordCard.classList.add('hidden');
    document.getElementById('progress-bar').classList.add('hidden');
    summary.classList.remove('hidden');

    summaryWords.innerHTML = '';
    results.forEach(r => {
      const div = document.createElement('div');
      div.className = 'summary-item';
      div.innerHTML = `
        <span class="s-emoji">${r.word.emoji}</span>
        <div class="s-words">
          <div class="s-spanish">${r.word.es}</div>
          <div class="s-english">${r.word.en} · ${POS_NAMES[r.word.pos] || r.word.pos}</div>
        </div>
        <span class="s-result">${r.guessed ? '✅' : '📝'}</span>
      `;
      summaryWords.appendChild(div);
    });

    // Save results for this date
    const storage = getStorage();
    const key = dateKey(selectedDate);
    storage[key] = { completed: true, results: results.map(r => ({
      es: r.word.es, en: r.word.en, guessed: r.guessed, attempts: r.attempts
    }))};

    // Calculate streak from today backwards
    let streak = 0;
    const d = new Date();
    while (true) {
      const k = dateKey(d);
      if (storage[k] && storage[k].completed) {
        streak++;
        d.setDate(d.getDate() - 1);
        // Don't count before epoch
        if (d < EPOCH) break;
      } else {
        break;
      }
    }

    storage.streak = streak;
    setStorage(storage);
    streakCount.textContent = streak;
  }

  // --- Check if selected date already completed ---
  function checkCompleted() {
    const storage = getStorage();
    const key = dateKey(selectedDate);
    if (storage[key] && storage[key].completed) {
      const dayWords = getWordsForDate(selectedDate);
      results = (storage[key].results || []).map((r, i) => ({
        word: dayWords[i] || { es: r.es, en: r.en, pos: 'n', emoji: '📖' },
        guessed: r.guessed,
        attempts: r.attempts,
        hintUsed: false
      }));
      currentIndex = currentWords.length;
      showSummary();
      return true;
    }
    return false;
  }

  // --- Load a specific day ---
  function loadDay(date) {
    // Don't allow future dates
    if (isFuture(date)) return;

    selectedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    currentWords = getWordsForDate(selectedDate);
    currentIndex = 0;
    attempts = 0;
    results = [];
    hintUsed = false;

    // Reset UI
    wordCard.classList.remove('hidden');
    document.getElementById('progress-bar').classList.remove('hidden');
    summary.classList.add('hidden');

    updateDateUI();

    if (checkCompleted()) return;

    showWord();
  }

  // =============================================
  // PRACTICE MODE
  // =============================================

  // --- Shuffle array in-place (non-seeded) ---
  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // --- Get all previously seen words ---
  function getSeenWords() {
    const storage = getStorage();
    const seen = new Set();
    for (const key in storage) {
      if (key === 'streak' || key === 'practice') continue;
      if (storage[key] && storage[key].results) {
        storage[key].results.forEach(r => seen.add(r.es));
      }
    }
    if (storage.practice) {
      for (const dk in storage.practice) {
        storage.practice[dk].forEach(s => {
          if (s.words) s.words.forEach(w => seen.add(w));
        });
      }
    }
    return seen;
  }

  // --- Build practice session: 7 unique words → 15-question queue ---
  function buildPracticeSession(levels) {
    const TOTAL = 15;
    const UNIQUE_TARGET = 7;
    const NEW_TARGET = 3;

    const seenSet = getSeenWords();
    const pools = { easy: WORDS_EASY, medium: WORDS_MEDIUM, hard: WORDS_HARD };

    let seenCandidates = [];
    let unseenCandidates = [];

    for (const level of levels) {
      for (const word of pools[level]) {
        const entry = { ...word, level };
        if (seenSet.has(word.es)) {
          seenCandidates.push(entry);
        } else {
          unseenCandidates.push(entry);
        }
      }
    }

    shuffleArray(seenCandidates);
    shuffleArray(unseenCandidates);

    // Pick unique words: prefer seen, add some unseen
    const newCount = Math.min(NEW_TARGET, unseenCandidates.length);
    const seenCount = Math.min(UNIQUE_TARGET - newCount, seenCandidates.length);

    let unique = [];
    unique.push(...seenCandidates.slice(0, seenCount));
    unique.push(...unseenCandidates.slice(0, newCount));

    // Fill remaining if needed
    if (unique.length < UNIQUE_TARGET) {
      const extra = [
        ...seenCandidates.slice(seenCount),
        ...unseenCandidates.slice(newCount)
      ];
      shuffleArray(extra);
      unique.push(...extra.slice(0, UNIQUE_TARGET - unique.length));
    }

    if (unique.length === 0) return [];

    // Build queue: each word at least 2x, extras to reach 15
    let queue = [];
    unique.forEach(w => { queue.push(w); queue.push(w); });
    let remaining = TOTAL - queue.length;
    for (let i = 0; remaining > 0; i++, remaining--) {
      queue.push(unique[i % unique.length]);
    }

    // Shuffle avoiding adjacent duplicates
    for (let a = 0; a < 100; a++) {
      shuffleArray(queue);
      let ok = true;
      for (let i = 1; i < queue.length; i++) {
        if (queue[i].es === queue[i - 1].es) { ok = false; break; }
      }
      if (ok) return queue;
    }

    // Fallback: fix remaining adjacent duplicates
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].es === queue[i - 1].es) {
        for (let j = i + 1; j < queue.length; j++) {
          if (queue[j].es !== queue[i - 1].es) {
            [queue[i], queue[j]] = [queue[j], queue[i]];
            break;
          }
        }
      }
    }

    return queue;
  }

  // --- Tab switching ---
  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });

    const dateRow = document.querySelector('.date-row');

    if (tab === 'daily') {
      gameArea.classList.remove('hidden');
      practiceArea.classList.add('hidden');
      dateRow.classList.remove('hidden');
      todayLink.classList.toggle('hidden', isToday(selectedDate));
    } else {
      gameArea.classList.add('hidden');
      practiceArea.classList.remove('hidden');
      dateRow.classList.add('hidden');
      todayLink.classList.add('hidden');
      showPracticeSetup();
    }
  }

  // --- Show practice setup screen ---
  function showPracticeSetup() {
    pSetup.classList.remove('hidden');
    pGame.classList.add('hidden');
    pSummaryEl.classList.add('hidden');
    toggleError.classList.add('hidden');

    // Show today's practice history if exists
    const storage = getStorage();
    const key = dateKey(new Date());
    if (storage.practice && storage.practice[key] && storage.practice[key].length > 0) {
      const last = storage.practice[key][storage.practice[key].length - 1];
      pLastScore.textContent = `${last.score}/${last.total} correctas`;
      pHistory.classList.remove('hidden');
    } else {
      pHistory.classList.add('hidden');
    }
  }

  // --- Start practice ---
  function startPractice() {
    const levels = [];
    if ($('toggle-easy').checked) levels.push('easy');
    if ($('toggle-medium').checked) levels.push('medium');
    if ($('toggle-hard').checked) levels.push('hard');

    if (levels.length === 0) {
      toggleError.classList.remove('hidden');
      return;
    }
    toggleError.classList.add('hidden');

    practiceQueue = buildPracticeSession(levels);
    practiceIndex = 0;
    practiceResults = [];

    pSetup.classList.add('hidden');
    pGame.classList.remove('hidden');
    pSummaryEl.classList.add('hidden');

    showPracticeWord();
  }

  // --- Update practice progress bar ---
  function updatePracticeProgress() {
    const pct = (practiceIndex / practiceQueue.length) * 100;
    pProgressFill.style.width = pct + '%';
    pProgressText.textContent = `${practiceIndex + 1} / ${practiceQueue.length}`;
  }

  // --- Show current practice word ---
  function showPracticeWord() {
    const word = practiceQueue[practiceIndex];
    practiceAttempts = 0;
    practiceHintUsed = false;

    pLevelBadge.textContent = LEVEL_NAMES[word.level];
    pLevelBadge.className = 'level-badge ' + word.level;
    pEmojiDisplay.textContent = word.emoji;
    pEnglishText.textContent = word.en;
    pPosTag.textContent = POS_NAMES[word.pos] || word.pos;
    pHintTooltip.textContent = generateHint(word.es);

    pEnglishWord.classList.remove('show-hint');
    pHintNote.classList.remove('used');
    pHintNote.textContent = '💡 Click the word above for a hint';

    pGuessInput.value = '';
    pGuessInput.disabled = false;
    pFeedback.className = 'feedback hidden';
    pFeedback.textContent = '';
    pActions.classList.add('hidden');
    pResult.classList.add('hidden');
    pGuessForm.classList.remove('hidden');
    pWordCard.classList.remove('hidden');

    updatePracticeProgress();

    setTimeout(() => pGuessInput.focus(), 100);
  }

  // --- Check practice guess ---
  function checkPracticeGuess(guess) {
    const word = practiceQueue[practiceIndex];
    const ng = normalize(guess);
    const na = normalize(word.es);

    if (ng === na) {
      const perfect = guess.toLowerCase().trim() === word.es.toLowerCase();
      showPracticeCorrect(word, true, perfect);
      return;
    }

    const dist = levenshtein(ng, na);
    practiceAttempts++;

    if (dist === 1) {
      pFeedback.className = 'feedback close';
      pFeedback.textContent = '🤏 ¡Casi! Solo una letra de diferencia.';
    } else if (dist === 2) {
      pFeedback.className = 'feedback close';
      pFeedback.textContent = '🔤 ¡Cerca! Revisa la ortografía.';
    } else if (na.includes(ng) || ng.includes(na)) {
      pFeedback.className = 'feedback close';
      pFeedback.textContent = '📏 Vas por buen camino, longitud incorrecta.';
    } else {
      pFeedback.className = 'feedback wrong';
      pFeedback.textContent = '❌ No es correcto. ¡Sigue intentando!';
    }

    pActions.classList.remove('hidden');
    pGuessInput.classList.add('shake');
    setTimeout(() => pGuessInput.classList.remove('shake'), 300);
  }

  // --- Show practice correct/revealed ---
  function showPracticeCorrect(word, guessed, accentPerfect) {
    pGuessInput.disabled = true;
    pGuessForm.classList.add('hidden');
    pFeedback.className = 'feedback hidden';
    pActions.classList.add('hidden');
    pResult.classList.remove('hidden');

    pResultWord.textContent = word.es;
    pResultWord.className = 'result-word';

    let ctx = '';
    if (guessed) {
      if (!accentPerfect && word.es.toLowerCase().trim() !== normalize(word.es)) {
        ctx += `✅ ¡Correcto! Nota: "${word.es}" (con tildes).\n`;
      } else {
        ctx += '✅ ¡Perfecto!\n';
      }
    } else {
      ctx += '📝 Para recordar:\n';
      pResultWord.classList.add('revealed');
    }

    ctx += `${word.emoji} ${word.en} → ${word.es} (${POS_NAMES[word.pos] || word.pos})`;
    if (word.ctx) ctx += `\n💬 "${word.ctx}"`;

    pResultContext.textContent = ctx;

    practiceResults.push({ word, guessed, attempts: practiceAttempts });

    pEmojiDisplay.classList.add('pop');
    setTimeout(() => pEmojiDisplay.classList.remove('pop'), 300);
  }

  // --- Reveal practice answer ---
  function revealPracticeAnswer() {
    showPracticeCorrect(practiceQueue[practiceIndex], false, false);
  }

  // --- Next practice word ---
  function nextPracticeWord() {
    practiceIndex++;
    if (practiceIndex >= practiceQueue.length) {
      showPracticeSummary();
    } else {
      showPracticeWord();
    }
  }

  // --- Show practice summary ---
  function showPracticeSummary() {
    pGame.classList.add('hidden');
    pSummaryEl.classList.remove('hidden');

    // Aggregate results by unique word
    const stats = {};
    const order = [];
    practiceResults.forEach(r => {
      if (!stats[r.word.es]) {
        stats[r.word.es] = { word: r.word, correct: 0, total: 0 };
        order.push(r.word.es);
      }
      stats[r.word.es].total++;
      if (r.guessed) stats[r.word.es].correct++;
    });

    const totalCorrect = practiceResults.filter(r => r.guessed).length;
    pScoreText.textContent = `${totalCorrect} de ${practiceResults.length} correctas`;

    pSummaryWords.innerHTML = '';
    order.forEach(es => {
      const s = stats[es];
      const div = document.createElement('div');
      div.className = 'summary-item';
      const icon = s.correct === s.total ? '✅' : s.correct > 0 ? '⚠️' : '❌';
      div.innerHTML = `
        <span class="s-emoji">${s.word.emoji}</span>
        <div class="s-words">
          <div class="s-spanish">${s.word.es}</div>
          <div class="s-english">${s.word.en} · ${POS_NAMES[s.word.pos] || s.word.pos}</div>
        </div>
        <span class="s-result">${s.correct}/${s.total} ${icon}</span>
      `;
      pSummaryWords.appendChild(div);
    });

    // Save practice result
    const storage = getStorage();
    if (!storage.practice) storage.practice = {};
    const key = dateKey(new Date());
    if (!storage.practice[key]) storage.practice[key] = [];
    storage.practice[key].push({
      score: totalCorrect,
      total: practiceResults.length,
      words: [...new Set(practiceResults.map(r => r.word.es))]
    });
    setStorage(storage);
  }

  // --- Init ---
  function init() {
    // Set up date picker constraints
    datePicker.min = '2026-01-01';
    datePicker.max = toISODate(new Date());

    loadDay(new Date());

    // Event: hint toggle
    englishWord.addEventListener('click', () => {
      englishWord.classList.toggle('show-hint');
      if (!hintUsed) {
        hintUsed = true;
        hintNote.textContent = '💡 Hint shown';
        hintNote.classList.add('used');
      }
    });

    // Event: submit guess
    guessForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const guess = guessInput.value.trim();
      if (!guess) return;
      checkGuess(guess);
    });

    // Event: reveal
    revealBtn.addEventListener('click', revealAnswer);

    // Event: next
    nextBtn.addEventListener('click', nextWord);

    // Event: date button opens native date picker
    dateBtn.addEventListener('click', () => {
      datePicker.showPicker();
    });

    // Event: date picker change
    datePicker.addEventListener('change', (e) => {
      const parts = e.target.value.split('-');
      const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      loadDay(d);
    });

    // Event: "return to today" link
    todayLink.addEventListener('click', () => {
      loadDay(new Date());
    });

    // Event: prev/next day buttons
    prevDayBtn.addEventListener('click', () => {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 1);
      if (d >= EPOCH) loadDay(d);
    });

    nextDayBtn.addEventListener('click', () => {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + 1);
      if (!isFuture(d)) loadDay(d);
    });

    // Keyboard shortcut: Enter on result to go next
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !result.classList.contains('hidden')) {
        nextWord();
      }
      if (e.key === 'Enter' && !pResult.classList.contains('hidden')) {
        nextPracticeWord();
      }
    });

    // --- Practice event listeners ---

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Start practice
    startPracticeBtn.addEventListener('click', startPractice);

    // Toggle validation: hide error when a checkbox is checked
    ['toggle-easy', 'toggle-medium', 'toggle-hard'].forEach(id => {
      $(id).addEventListener('change', () => toggleError.classList.add('hidden'));
    });

    // Practice hint toggle
    pEnglishWord.addEventListener('click', () => {
      pEnglishWord.classList.toggle('show-hint');
      if (!practiceHintUsed) {
        practiceHintUsed = true;
        pHintNote.textContent = '💡 Hint shown';
        pHintNote.classList.add('used');
      }
    });

    // Practice guess submit
    pGuessForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const guess = pGuessInput.value.trim();
      if (!guess) return;
      checkPracticeGuess(guess);
    });

    // Practice reveal
    pRevealBtn.addEventListener('click', revealPracticeAnswer);

    // Practice next
    pNextBtn.addEventListener('click', nextPracticeWord);

    // Practice again
    practiceAgainBtn.addEventListener('click', showPracticeSetup);

    // Practice back to daily
    practiceBackBtn.addEventListener('click', () => switchTab('daily'));
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
