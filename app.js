(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const storage = {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    },
    remove(key) { localStorage.removeItem(key); }
  };

  const todayKey = () => new Date().toISOString().slice(0, 10);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function hashString(input) {
    let h = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seededRandom(seed) {
    let state = hashString(seed || `${Date.now()}-${Math.random()}`) || 1;
    return () => {
      state += 0x6D2B79F5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomInt(rng, max) {
    return Math.floor(rng() * max);
  }

  function shuffle(array, rng = Math.random) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  const defaultProfile = {
    xp: 0,
    sound: true,
    unlockedSkins: ['apple'],
    mines: {
      played: 0,
      wins: 0,
      losses: 0,
      moves: 0,
      dailyWins: 0,
      best: {}
    },
    battle: {
      played: 0,
      wins: 0,
      losses: 0,
      shots: 0,
      hits: 0,
      dailyWins: 0
    }
  };

  const ranks = [
    { title: 'Новичок', xp: 0, icon: '✦', unlock: 'Apple', skin: 'apple' },
    { title: 'Матрос', xp: 120, icon: '⚓', unlock: 'Ocean', skin: 'ocean' },
    { title: 'Капитан', xp: 300, icon: '◆', unlock: 'Graphite', skin: 'graphite' },
    { title: 'Адмирал', xp: 620, icon: '✹', unlock: 'Sunset', skin: 'sunset' }
  ];

  const skins = [
    { id: 'apple', label: 'Apple', minXp: 0 },
    { id: 'ocean', label: 'Ocean', minXp: 120 },
    { id: 'graphite', label: 'Graphite', minXp: 300 },
    { id: 'sunset', label: 'Sunset', minXp: 620 }
  ];

  function mergeProfile(saved) {
    return {
      ...defaultProfile,
      ...saved,
      mines: { ...defaultProfile.mines, ...(saved?.mines || {}), best: { ...(saved?.mines?.best || {}) } },
      battle: { ...defaultProfile.battle, ...(saved?.battle || {}) },
      unlockedSkins: Array.isArray(saved?.unlockedSkins) ? saved.unlockedSkins : ['apple']
    };
  }

  let profile = mergeProfile(storage.get('apple-games.profile', defaultProfile));

  function saveProfile() {
    profile.unlockedSkins = skins.filter((skin) => profile.xp >= skin.minXp).map((skin) => skin.id);
    storage.set('apple-games.profile', profile);
    renderProfile();
    renderSkinOptions();
  }

  function currentRank() {
    let rank = ranks[0];
    for (const item of ranks) {
      if (profile.xp >= item.xp) rank = item;
    }
    return rank;
  }

  function nextRank() {
    return ranks.find((item) => item.xp > profile.xp) || null;
  }

  function addXp(amount, reason) {
    const before = currentRank().title;
    profile.xp += amount;
    saveProfile();
    const after = currentRank().title;
    toast(`+${amount} XP · ${reason}`);
    if (after !== before) {
      toast(`Новое звание: ${after}`);
      sound('rank');
    }
  }

  function toast(text) {
    const layer = $('#toastLayer');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    layer.appendChild(el);
    window.setTimeout(() => {
      el.classList.add('out');
      window.setTimeout(() => el.remove(), 260);
    }, 2600);
  }

  let audioCtx = null;
  const sounds = {
    click: [520, 0.035, 'sine', 0.045],
    flag: [380, 0.045, 'triangle', 0.035],
    open: [620, 0.035, 'sine', 0.035],
    hit: [120, 0.09, 'sawtooth', 0.055],
    miss: [260, 0.055, 'sine', 0.03],
    win: [760, 0.11, 'triangle', 0.06],
    lose: [140, 0.16, 'sawtooth', 0.05],
    rank: [920, 0.13, 'sine', 0.06]
  };

  function sound(type) {
    if (!profile.sound) return;
    const config = sounds[type] || sounds.click;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const [freq, duration, wave, gainValue] = config;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.start(now);
      osc.stop(now + duration + 0.015);
    } catch {
      // Safari can block audio until first gesture. Quiet fallback.
    }
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  const themeSelect = $('#themeSelect');
  const skinSelect = $('#skinSelect');
  const soundToggle = $('#soundToggle');
  const savedTheme = storage.get('apple-games.theme', 'system');
  const savedSkin = storage.get('apple-games.skin', 'apple');

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeSelect.value = theme;
    const effectiveDark = theme === 'dark' || (theme === 'system' && prefersDark.matches);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', effectiveDark ? '#07080b' : '#f5f7fb');
  }

  function applySkin(skin) {
    const allowed = skins.find((item) => item.id === skin && profile.xp >= item.minXp) ? skin : 'apple';
    document.documentElement.dataset.skin = allowed;
    storage.set('apple-games.skin', allowed);
    if (skinSelect.value !== allowed) skinSelect.value = allowed;
  }

  function renderSkinOptions() {
    const selected = storage.get('apple-games.skin', 'apple');
    skinSelect.innerHTML = '';
    skins.forEach((skin) => {
      const option = document.createElement('option');
      option.value = skin.id;
      option.textContent = profile.xp >= skin.minXp ? skin.label : `${skin.label} · ${skin.minXp} XP`;
      option.disabled = profile.xp < skin.minXp;
      skinSelect.appendChild(option);
    });
    applySkin(selected);
  }

  function updateSoundButton() {
    soundToggle.textContent = profile.sound ? '🔊' : '🔇';
    soundToggle.setAttribute('aria-pressed', profile.sound ? 'true' : 'false');
  }

  themeSelect.addEventListener('change', (event) => {
    storage.set('apple-games.theme', event.target.value);
    applyTheme(event.target.value);
  });
  prefersDark.addEventListener?.('change', () => applyTheme(themeSelect.value));
  skinSelect.addEventListener('change', (event) => applySkin(event.target.value));
  soundToggle.addEventListener('click', () => {
    profile.sound = !profile.sound;
    saveProfile();
    updateSoundButton();
    sound('click');
  });

  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((item) => item.classList.toggle('active', item === tab));
      $$('.screen').forEach((screen) => screen.classList.toggle('active', screen.id === `screen-${tab.dataset.screen}`));
      sound('click');
    });
  });

  // Minesweeper
  const mineConfig = {
    easy: { rows: 9, cols: 9, mines: 10, label: 'лёгкая', xp: 40 },
    medium: { rows: 16, cols: 16, mines: 40, label: 'средняя', xp: 75 },
    hard: { rows: 16, cols: 22, mines: 70, label: 'сложная', xp: 120 },
    expert: { rows: 18, cols: 28, mines: 99, label: 'эксперт', xp: 170 }
  };

  const mineState = {
    difficulty: storage.get('apple-games.mineDifficulty', 'easy'),
    rows: 9,
    cols: 9,
    mines: 10,
    cells: [],
    started: false,
    over: false,
    revealed: 0,
    flags: 0,
    moves: 0,
    flagMode: false,
    seconds: 0,
    timerId: null,
    daily: false,
    seed: ''
  };

  const mineBoard = $('#mineBoard');
  const mineDifficulty = $('#mineDifficulty');
  const mineLeft = $('#mineLeft');
  const mineTimer = $('#mineTimer');
  const mineBest = $('#mineBest');
  const mineMoves = $('#mineMoves');
  const mineStatus = $('#mineStatus');
  const flagModeButton = $('#flagMode');
  const mineBoardTitle = $('#mineBoardTitle');
  const mineSeedBadge = $('#mineSeedBadge');

  function mineBestKey() {
    return mineState.daily ? `daily-${todayKey()}-${mineState.difficulty}` : mineState.difficulty;
  }

  function setMineStatus(text, tone = 'neutral') {
    mineStatus.textContent = text;
    mineStatus.className = `status ${tone}`;
  }

  function resetMineTimer() {
    clearInterval(mineState.timerId);
    mineState.timerId = null;
    mineState.seconds = 0;
    mineTimer.textContent = '0с';
  }

  function startMineTimer() {
    if (mineState.timerId) return;
    mineState.timerId = window.setInterval(() => {
      mineState.seconds += 1;
      mineTimer.textContent = `${mineState.seconds}с`;
    }, 1000);
  }

  function updateMinePanel() {
    mineLeft.textContent = Math.max(0, mineState.mines - mineState.flags);
    mineMoves.textContent = mineState.moves;
    const best = profile.mines.best[mineBestKey()];
    mineBest.textContent = best ? `${best.time}с` : '—';
    mineBoardTitle.textContent = mineState.daily ? `Испытание дня · ${todayKey()}` : 'Обычная партия';
    mineSeedBadge.textContent = mineState.daily ? 'daily' : 'random';
  }

  function newMineGame({ daily = false } = {}) {
    const cfg = mineConfig[mineState.difficulty];
    Object.assign(mineState, {
      rows: cfg.rows,
      cols: cfg.cols,
      mines: cfg.mines,
      cells: [],
      started: false,
      over: false,
      revealed: 0,
      flags: 0,
      moves: 0,
      daily,
      seed: daily ? `mine-${todayKey()}-${mineState.difficulty}` : `mine-${Date.now()}-${Math.random()}`
    });
    resetMineTimer();
    mineBoard.style.setProperty('--rows', mineState.rows);
    mineBoard.style.setProperty('--cols', mineState.cols);
    mineBoard.innerHTML = '';
    for (let y = 0; y < mineState.rows; y += 1) {
      for (let x = 0; x < mineState.cols; x += 1) {
        const cell = { x, y, mine: false, open: false, flagged: false, count: 0, el: null };
        mineState.cells.push(cell);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mine-cell';
        button.setAttribute('aria-label', `Клетка ${x + 1}:${y + 1}`);
        button.addEventListener('click', () => handleMinePress(cell));
        button.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          toggleMineFlag(cell);
        });
        cell.el = button;
        mineBoard.appendChild(button);
      }
    }
    setMineStatus(daily ? 'Испытание дня готово. Первый ход безопасный.' : 'Выбери клетку, чтобы начать.', 'neutral');
    updateMinePanel();
  }

  function mineIndex(x, y) {
    return y * mineState.cols + x;
  }

  function mineCell(x, y) {
    if (x < 0 || y < 0 || x >= mineState.cols || y >= mineState.rows) return null;
    return mineState.cells[mineIndex(x, y)];
  }

  function mineNeighbors(cell) {
    const result = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const item = mineCell(cell.x + dx, cell.y + dy);
        if (item) result.push(item);
      }
    }
    return result;
  }

  function placeMines(firstCell) {
    const rng = seededRandom(`${mineState.seed}-${firstCell.x}-${firstCell.y}`);
    const safe = new Set([mineIndex(firstCell.x, firstCell.y)]);
    mineNeighbors(firstCell).forEach((cell) => safe.add(mineIndex(cell.x, cell.y)));
    const candidates = mineState.cells.filter((cell) => !safe.has(mineIndex(cell.x, cell.y)));
    shuffle(candidates, rng).slice(0, mineState.mines).forEach((cell) => { cell.mine = true; });
    mineState.cells.forEach((cell) => {
      cell.count = mineNeighbors(cell).filter((item) => item.mine).length;
    });
  }

  function drawMineCell(cell) {
    const el = cell.el;
    el.className = 'mine-cell';
    el.textContent = '';
    if (cell.open) {
      el.classList.add('open');
      if (cell.mine) {
        el.classList.add('mine');
        el.textContent = '✹';
      } else if (cell.count) {
        el.textContent = cell.count;
        el.classList.add(`n${cell.count}`);
      }
    } else if (cell.flagged) {
      el.classList.add('flagged');
      el.textContent = '🚩';
    }
  }

  function toggleMineFlag(cell) {
    if (mineState.over || cell.open) return;
    cell.flagged = !cell.flagged;
    mineState.flags += cell.flagged ? 1 : -1;
    mineState.moves += 1;
    drawMineCell(cell);
    updateMinePanel();
    sound('flag');
  }

  function handleMinePress(cell) {
    if (mineState.over) return;
    if (mineState.flagMode) {
      toggleMineFlag(cell);
      return;
    }
    revealMineCell(cell);
  }

  function revealMineCell(cell) {
    if (cell.open || cell.flagged || mineState.over) return;
    if (!mineState.started) {
      mineState.started = true;
      profile.mines.played += 1;
      saveProfile();
      placeMines(cell);
      startMineTimer();
    }
    mineState.moves += 1;
    if (cell.mine) {
      cell.open = true;
      cell.el.classList.add('exploded');
      mineState.over = true;
      clearInterval(mineState.timerId);
      mineState.cells.forEach((item) => {
        if (item.mine) item.open = true;
        drawMineCell(item);
      });
      profile.mines.losses += 1;
      profile.mines.moves += mineState.moves;
      saveProfile();
      addXp(5, 'партия сапёра');
      setMineStatus('Мина. Партия проиграна.', 'danger');
      updateMinePanel();
      sound('lose');
      return;
    }

    const queue = [cell];
    let opened = 0;
    while (queue.length) {
      const current = queue.shift();
      if (!current || current.open || current.flagged) continue;
      current.open = true;
      opened += 1;
      mineState.revealed += 1;
      if (current.count === 0) {
        mineNeighbors(current).forEach((item) => {
          if (!item.open && !item.flagged && !item.mine) queue.push(item);
        });
      }
    }
    mineState.cells.forEach(drawMineCell);
    if (opened > 0) sound('open');
    checkMineWin();
    updateMinePanel();
  }

  function checkMineWin() {
    const safeCells = mineState.rows * mineState.cols - mineState.mines;
    if (mineState.revealed < safeCells || mineState.over) return;
    mineState.over = true;
    clearInterval(mineState.timerId);
    mineState.cells.forEach((cell) => {
      if (cell.mine && !cell.flagged) {
        cell.flagged = true;
        mineState.flags += 1;
      }
      drawMineCell(cell);
    });
    const key = mineBestKey();
    const currentBest = profile.mines.best[key];
    if (!currentBest || mineState.seconds < currentBest.time) {
      profile.mines.best[key] = { time: mineState.seconds, moves: mineState.moves, date: todayKey() };
    }
    profile.mines.wins += 1;
    profile.mines.moves += mineState.moves;
    if (mineState.daily) profile.mines.dailyWins += 1;
    saveProfile();
    const cfg = mineConfig[mineState.difficulty];
    addXp(cfg.xp + (mineState.daily ? 35 : 0), mineState.daily ? 'испытание дня сапёра' : `сапёр · ${cfg.label}`);
    setMineStatus(`Победа за ${mineState.seconds}с. Все безопасные клетки открыты.`, 'success');
    updateMinePanel();
    sound('win');
  }

  mineDifficulty.value = mineState.difficulty;
  mineDifficulty.addEventListener('change', (event) => {
    mineState.difficulty = event.target.value;
    storage.set('apple-games.mineDifficulty', mineState.difficulty);
    newMineGame();
  });
  $('#newMineGame').addEventListener('click', () => newMineGame());
  $('#dailyMineGame').addEventListener('click', () => newMineGame({ daily: true }));
  flagModeButton.addEventListener('click', () => {
    mineState.flagMode = !mineState.flagMode;
    flagModeButton.setAttribute('aria-pressed', mineState.flagMode ? 'true' : 'false');
    sound('click');
  });

  // Battleship
  const fleet = [
    { id: 'carrier', name: 'Авианосец', size: 5 },
    { id: 'battleship', name: 'Линкор', size: 4 },
    { id: 'cruiser', name: 'Крейсер', size: 3 },
    { id: 'submarine', name: 'Подлодка', size: 3 },
    { id: 'destroyer', name: 'Эсминец', size: 2 }
  ];

  const battleXp = { easy: 55, normal: 85, hard: 125, expert: 180 };

  const battleState = {
    difficulty: storage.get('apple-games.battleDifficulty', 'easy'),
    phase: 'placing',
    daily: false,
    seed: '',
    orientation: 'h',
    selectedShip: 'carrier',
    player: null,
    ai: null,
    turn: 'player',
    aiMemory: [],
    aiShotCount: 0
  };

  const battleDifficulty = $('#battleDifficulty');
  const playerBoard = $('#playerBoard');
  const aiBoard = $('#aiBoard');
  const shipTray = $('#shipTray');
  const battleStatus = $('#battleStatus');
  const orientationBadge = $('#orientationBadge');
  const playerShipsLeft = $('#playerShipsLeft');
  const aiShipsLeft = $('#aiShipsLeft');
  const battleWins = $('#battleWins');
  const battleLosses = $('#battleLosses');
  const battleSeedBadge = $('#battleSeedBadge');
  const rotateShip = $('#rotateShip');

  function emptySea() {
    return Array.from({ length: 100 }, () => ({ shipId: null, hit: false, miss: false, el: null }));
  }

  function shipMap() {
    const map = {};
    fleet.forEach((ship) => {
      map[ship.id] = { ...ship, cells: [], sunk: false };
    });
    return map;
  }

  function newFleetState() {
    return { grid: emptySea(), ships: shipMap(), placed: new Set() };
  }

  function seaIndex(x, y) { return y * 10 + x; }
  function seaCoords(index) { return { x: index % 10, y: Math.floor(index / 10) }; }
  function inSea(x, y) { return x >= 0 && y >= 0 && x < 10 && y < 10; }

  function setBattleStatus(text, tone = 'neutral') {
    battleStatus.textContent = text;
    battleStatus.className = `status ${tone}`;
  }

  function initBattle({ daily = false, autoPlayer = false, start = false } = {}) {
    battleState.phase = 'placing';
    battleState.turn = 'player';
    battleState.daily = daily;
    battleState.seed = daily ? `battle-${todayKey()}-${battleState.difficulty}` : `battle-${Date.now()}-${Math.random()}`;
    battleState.player = newFleetState();
    battleState.ai = newFleetState();
    battleState.aiMemory = [];
    battleState.aiShotCount = 0;
    battleState.selectedShip = fleet[0].id;
    if (autoPlayer || daily) placeFleetRandom(battleState.player, seededRandom(`${battleState.seed}-player`));
    placeFleetRandom(battleState.ai, seededRandom(`${battleState.seed}-ai`));
    renderShipTray();
    renderSeaBoards();
    updateBattlePanel();
    setBattleStatus(daily ? 'Бой дня создан. Можно сразу начинать.' : 'Расставь флот вручную или нажми «Автофлот».', 'neutral');
    if (start) startBattle();
  }

  function isPlacementValid(side, shipId, x, y, orientation) {
    const ship = side.ships[shipId];
    if (!ship || side.placed.has(shipId)) return false;
    const cells = [];
    for (let i = 0; i < ship.size; i += 1) {
      const cx = x + (orientation === 'h' ? i : 0);
      const cy = y + (orientation === 'v' ? i : 0);
      if (!inSea(cx, cy)) return false;
      const index = seaIndex(cx, cy);
      if (side.grid[index].shipId) return false;
      cells.push(index);
    }
    return cells;
  }

  function placeShip(side, shipId, x, y, orientation) {
    const cells = isPlacementValid(side, shipId, x, y, orientation);
    if (!cells) return false;
    cells.forEach((index) => { side.grid[index].shipId = shipId; });
    side.ships[shipId].cells = cells;
    side.placed.add(shipId);
    return true;
  }

  function placeFleetRandom(side, rng = Math.random) {
    side.grid = emptySea();
    side.ships = shipMap();
    side.placed = new Set();
    for (const ship of fleet) {
      let placed = false;
      for (let attempt = 0; attempt < 300 && !placed; attempt += 1) {
        const orientation = rng() > 0.5 ? 'h' : 'v';
        const x = randomInt(rng, 10);
        const y = randomInt(rng, 10);
        placed = placeShip(side, ship.id, x, y, orientation);
      }
      if (!placed) return placeFleetRandom(side, rng);
    }
    return side;
  }

  function clearPlayerFleet() {
    if (battleState.phase === 'playing') return;
    if (battleState.phase === 'over') { initBattle(); return; }
    battleState.player = newFleetState();
    battleState.selectedShip = fleet[0].id;
    renderShipTray();
    renderSeaBoards();
    updateBattlePanel();
    setBattleStatus('Поле очищено. Выбери корабль и поставь его на поле.', 'neutral');
    sound('click');
  }

  function renderShipTray() {
    shipTray.innerHTML = '';
    fleet.forEach((ship) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ship-token';
      if (battleState.selectedShip === ship.id) button.classList.add('active');
      if (battleState.player?.placed.has(ship.id)) button.classList.add('placed');
      button.disabled = battleState.phase === 'playing';
      button.title = ship.name;
      button.innerHTML = `${Array.from({ length: ship.size }, () => '<span class="ship-dot"></span>').join('')}<span>${ship.size}</span>`;
      button.addEventListener('click', () => {
        if (battleState.phase === 'playing') return;
        battleState.selectedShip = ship.id;
        renderShipTray();
        sound('click');
      });
      shipTray.appendChild(button);
    });
  }

  function updateBattlePanel() {
    const playerLeft = Object.values(battleState.player.ships).filter((ship) => ship.cells.length && !ship.sunk).length;
    const aiLeft = Object.values(battleState.ai.ships).filter((ship) => ship.cells.length && !ship.sunk).length;
    playerShipsLeft.textContent = playerLeft;
    aiShipsLeft.textContent = aiLeft;
    battleWins.textContent = profile.battle.wins;
    battleLosses.textContent = profile.battle.losses;
    battleSeedBadge.textContent = battleState.daily ? 'daily' : 'random';
    orientationBadge.textContent = battleState.orientation === 'h' ? 'горизонтально' : 'вертикально';
    rotateShip.textContent = battleState.orientation === 'h' ? '↻ Горизонтально' : '↻ Вертикально';
    rotateShip.setAttribute('aria-pressed', battleState.orientation === 'v' ? 'true' : 'false');
  }

  function renderSeaBoards() {
    renderSeaBoard(playerBoard, battleState.player, false);
    renderSeaBoard(aiBoard, battleState.ai, true);
    renderShipTray();
    updateBattlePanel();
  }

  function renderSeaBoard(container, side, enemy) {
    container.innerHTML = '';
    side.grid.forEach((cell, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sea-cell';
      button.dataset.index = index;
      const { x, y } = seaCoords(index);
      button.setAttribute('aria-label', `${enemy ? 'Поле ИИ' : 'Ваше поле'} ${x + 1}:${y + 1}`);
      if (cell.shipId && (!enemy || cell.hit)) button.classList.add('ship');
      if (cell.hit) button.classList.add('hit');
      if (cell.miss) button.classList.add('miss');
      if (enemy) {
        button.addEventListener('click', () => playerShoot(index));
      } else {
        button.addEventListener('click', () => placeSelectedShipAt(index));
        button.addEventListener('pointerenter', () => previewPlacement(index));
        button.addEventListener('pointerleave', clearPlacementPreview);
      }
      cell.el = button;
      container.appendChild(button);
    });
  }

  function previewPlacement(index) {
    if (battleState.phase === 'playing') return;
    clearPlacementPreview();
    const shipId = battleState.selectedShip;
    if (!shipId || battleState.player.placed.has(shipId)) return;
    const { x, y } = seaCoords(index);
    const cells = isPlacementValid(battleState.player, shipId, x, y, battleState.orientation);
    const ship = battleState.player.ships[shipId];
    const preview = [];
    for (let i = 0; i < ship.size; i += 1) {
      const cx = x + (battleState.orientation === 'h' ? i : 0);
      const cy = y + (battleState.orientation === 'v' ? i : 0);
      if (inSea(cx, cy)) preview.push(seaIndex(cx, cy));
    }
    preview.forEach((cellIndex) => {
      const el = battleState.player.grid[cellIndex]?.el;
      if (el) el.classList.add(cells ? 'preview-ok' : 'preview-bad');
    });
  }

  function clearPlacementPreview() {
    $$('.sea-cell', playerBoard).forEach((cell) => cell.classList.remove('preview-ok', 'preview-bad'));
  }

  function selectNextUnplacedShip() {
    const next = fleet.find((ship) => !battleState.player.placed.has(ship.id));
    battleState.selectedShip = next ? next.id : '';
  }

  function placeSelectedShipAt(index) {
    if (battleState.phase === 'playing') return;
    const shipId = battleState.selectedShip;
    if (!shipId) return;
    const { x, y } = seaCoords(index);
    if (!placeShip(battleState.player, shipId, x, y, battleState.orientation)) {
      setBattleStatus('Сюда корабль не помещается. Поверни его или выбери другую клетку.', 'warning');
      sound('miss');
      return;
    }
    selectNextUnplacedShip();
    renderSeaBoards();
    const placedCount = battleState.player.placed.size;
    setBattleStatus(placedCount === fleet.length ? 'Флот готов. Нажми «Начать бой».' : `Поставлено кораблей: ${placedCount}/${fleet.length}.`, 'neutral');
    sound('click');
  }

  function startBattle() {
    if (battleState.phase === 'playing') return;
    if (battleState.phase === 'over') {
      initBattle({ autoPlayer: true });
    }
    if (battleState.player.placed.size !== fleet.length) {
      setBattleStatus('Сначала расставь все 5 кораблей или нажми «Автофлот».', 'warning');
      sound('miss');
      return;
    }
    battleState.phase = 'playing';
    battleState.turn = 'player';
    profile.battle.played += 1;
    saveProfile();
    renderSeaBoards();
    setBattleStatus('Бой начался. Стреляй по правому полю.', 'neutral');
    sound('click');
  }

  function shipIsSunk(side, shipId) {
    const ship = side.ships[shipId];
    if (!ship || !ship.cells.length) return false;
    const sunk = ship.cells.every((index) => side.grid[index].hit);
    ship.sunk = sunk;
    return sunk;
  }

  function remainingShips(side) {
    return Object.values(side.ships).filter((ship) => ship.cells.length && !ship.sunk).length;
  }

  function markShotAnimation(side, index) {
    const el = side.grid[index].el;
    if (!el) return;
    el.classList.add('shot-ring');
    window.setTimeout(() => el.classList.remove('shot-ring'), 460);
  }

  function applyShot(side, index) {
    const cell = side.grid[index];
    if (cell.hit || cell.miss) return { valid: false };
    markShotAnimation(side, index);
    if (cell.shipId) {
      cell.hit = true;
      const sunk = shipIsSunk(side, cell.shipId);
      return { valid: true, hit: true, sunk, shipId: cell.shipId };
    }
    cell.miss = true;
    return { valid: true, hit: false, sunk: false, shipId: null };
  }

  async function playerShoot(index) {
    if (battleState.phase !== 'playing' || battleState.turn !== 'player') return;
    const cell = battleState.ai.grid[index];
    if (cell.hit || cell.miss) return;
    profile.battle.shots += 1;
    const result = applyShot(battleState.ai, index);
    if (!result.valid) return;
    if (result.hit) profile.battle.hits += 1;
    saveProfile();
    renderSeaBoards();
    if (result.hit) {
      sound('hit');
      if (result.sunk) {
        const name = battleState.ai.ships[result.shipId].name;
        setBattleStatus(`Попадание. ${name} ИИ уничтожен. Стреляй ещё.`, 'success');
      } else {
        setBattleStatus('Попадание. Дополнительный ход.', 'success');
      }
      if (remainingShips(battleState.ai) === 0) {
        finishBattle('player');
      }
      return;
    }
    sound('miss');
    battleState.turn = 'ai';
    setBattleStatus('Промах. Ход ИИ.', 'neutral');
    await delay(520);
    aiTurn();
  }

  async function aiTurn() {
    if (battleState.phase !== 'playing') return;
    let keepShooting = true;
    while (keepShooting && battleState.phase === 'playing') {
      battleState.aiShotCount += 1;
      const index = chooseAiShot();
      const result = applyShot(battleState.player, index);
      if (!result.valid) continue;
      battleState.aiMemory.push({ index, hit: result.hit, sunk: result.sunk, shipId: result.shipId });
      renderSeaBoards();
      if (result.hit) {
        sound('hit');
        if (result.sunk) {
          const name = battleState.player.ships[result.shipId].name;
          setBattleStatus(`ИИ уничтожил ваш ${name}. Он стреляет снова.`, 'danger');
          battleState.aiMemory = battleState.aiMemory.filter((shot) => shot.shipId !== result.shipId);
        } else {
          setBattleStatus('ИИ попал и получает ещё один ход.', 'danger');
        }
        if (remainingShips(battleState.player) === 0) {
          finishBattle('ai');
          return;
        }
        await delay(clamp(780 - difficultyScore() * 110, 420, 780));
      } else {
        sound('miss');
        setBattleStatus('ИИ промахнулся. Ваш ход.', 'neutral');
        battleState.turn = 'player';
        keepShooting = false;
      }
    }
  }

  function difficultyScore() {
    return { easy: 0, normal: 1, hard: 2, expert: 3 }[battleState.difficulty] || 0;
  }

  function unshotPlayerCells() {
    return battleState.player.grid
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => !cell.hit && !cell.miss)
      .map(({ index }) => index);
  }

  function adjacentIndexes(index) {
    const { x, y } = seaCoords(index);
    return [
      [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
    ].filter(([cx, cy]) => inSea(cx, cy)).map(([cx, cy]) => seaIndex(cx, cy));
  }

  function chooseAiShot() {
    const available = unshotPlayerCells();
    const rng = seededRandom(`${battleState.seed}-ai-shot-${battleState.aiShotCount}-${battleState.aiMemory.length}`);
    const liveHits = battleState.aiMemory.filter((shot) => shot.hit && !shot.sunk);

    if (battleState.difficulty !== 'easy' && liveHits.length) {
      const targeted = chooseTargetFromHits(liveHits, available, battleState.difficulty, rng);
      if (targeted !== null) return targeted;
    }

    if (battleState.difficulty === 'hard' || battleState.difficulty === 'expert') {
      const parity = available.filter((index) => {
        const { x, y } = seaCoords(index);
        return (x + y) % 2 === 0;
      });
      if (parity.length) return parity[randomInt(rng, parity.length)];
    }

    return available[randomInt(rng, available.length)];
  }

  function chooseTargetFromHits(hits, available, difficulty, rng) {
    const availableSet = new Set(available);
    const hitIndexes = hits.map((shot) => shot.index);
    if (difficulty === 'expert' && hitIndexes.length >= 2) {
      const groupedByRow = new Map();
      const groupedByCol = new Map();
      hitIndexes.forEach((index) => {
        const { x, y } = seaCoords(index);
        groupedByRow.set(y, [...(groupedByRow.get(y) || []), x]);
        groupedByCol.set(x, [...(groupedByCol.get(x) || []), y]);
      });
      for (const [y, xs] of groupedByRow.entries()) {
        if (xs.length >= 2) {
          const min = Math.min(...xs);
          const max = Math.max(...xs);
          const candidates = [[min - 1, y], [max + 1, y]].filter(([x]) => inSea(x, y)).map(([x, cy]) => seaIndex(x, cy)).filter((idx) => availableSet.has(idx));
          if (candidates.length) return candidates[randomInt(rng, candidates.length)];
        }
      }
      for (const [x, ys] of groupedByCol.entries()) {
        if (ys.length >= 2) {
          const min = Math.min(...ys);
          const max = Math.max(...ys);
          const candidates = [[x, min - 1], [x, max + 1]].filter(([, y]) => inSea(x, y)).map(([cx, y]) => seaIndex(cx, y)).filter((idx) => availableSet.has(idx));
          if (candidates.length) return candidates[randomInt(rng, candidates.length)];
        }
      }
    }

    const orderedHits = shuffle(hitIndexes, rng);
    for (const index of orderedHits) {
      const candidates = shuffle(adjacentIndexes(index).filter((idx) => availableSet.has(idx)), rng);
      if (candidates.length) return candidates[0];
    }
    return null;
  }

  function finishBattle(winner) {
    battleState.phase = 'over';
    renderSeaBoards();
    if (winner === 'player') {
      profile.battle.wins += 1;
      if (battleState.daily) profile.battle.dailyWins += 1;
      saveProfile();
      addXp((battleXp[battleState.difficulty] || 55) + (battleState.daily ? 45 : 0), battleState.daily ? 'бой дня' : `морской бой · ${battleState.difficulty}`);
      setBattleStatus('Победа. Флот ИИ уничтожен.', 'success');
      sound('win');
    } else {
      profile.battle.losses += 1;
      saveProfile();
      addXp(6, 'участие в морском бою');
      setBattleStatus('Поражение. ИИ уничтожил ваш флот.', 'danger');
      sound('lose');
    }
    updateBattlePanel();
  }

  rotateShip.addEventListener('click', () => {
    battleState.orientation = battleState.orientation === 'h' ? 'v' : 'h';
    updateBattlePanel();
    sound('click');
  });
  $('#autoFleet').addEventListener('click', () => {
    if (battleState.phase === 'playing') return;
    if (battleState.phase === 'over') initBattle();
    placeFleetRandom(battleState.player, seededRandom(`${battleState.seed}-player-auto-${Date.now()}`));
    renderSeaBoards();
    setBattleStatus('Флот расставлен автоматически. Можно начинать.', 'success');
    sound('click');
  });
  $('#clearFleet').addEventListener('click', clearPlayerFleet);
  $('#startBattle').addEventListener('click', startBattle);
  $('#dailyBattle').addEventListener('click', () => initBattle({ daily: true, autoPlayer: true, start: true }));
  battleDifficulty.value = battleState.difficulty;
  battleDifficulty.addEventListener('change', (event) => {
    battleState.difficulty = event.target.value;
    storage.set('apple-games.battleDifficulty', battleState.difficulty);
    initBattle();
  });

  // Profile and campaign UI
  function renderProfile() {
    const rank = currentRank();
    const next = nextRank();
    $('#profileRankTitle').textContent = rank.title;
    const xpLabel = next ? `${profile.xp} / ${next.xp} XP` : `${profile.xp} XP · максимум`;
    $('#profileXpLabel').textContent = xpLabel;
    $('#unlockHint').textContent = next ? `Следующее: ${next.title} · ${next.unlock}` : 'Все стили открыты';
    const rankBase = rank.xp;
    const rankTarget = next ? next.xp : Math.max(profile.xp, rank.xp + 1);
    const progress = next ? ((profile.xp - rankBase) / (rankTarget - rankBase)) * 100 : 100;
    $('#xpFill').style.width = `${clamp(progress, 0, 100)}%`;

    const badges = $('#rankBadges');
    badges.innerHTML = '';
    ranks.forEach((item) => {
      const span = document.createElement('span');
      span.className = `rank-badge${profile.xp >= item.xp ? '' : ' locked'}`;
      span.textContent = `${item.icon} ${item.title}`;
      badges.appendChild(span);
    });

    const profileStats = $('#profileStats');
    const hitRate = profile.battle.shots ? Math.round((profile.battle.hits / profile.battle.shots) * 100) : 0;
    const mineWinRate = profile.mines.played ? Math.round((profile.mines.wins / profile.mines.played) * 100) : 0;
    const battleWinRate = profile.battle.played ? Math.round((profile.battle.wins / profile.battle.played) * 100) : 0;
    const cards = [
      ['XP', profile.xp],
      ['Звание', rank.title],
      ['Сапёр · победы', profile.mines.wins],
      ['Сапёр · винрейт', `${mineWinRate}%`],
      ['Бой · победы', profile.battle.wins],
      ['Бой · винрейт', `${battleWinRate}%`],
      ['Точность в бою', `${hitRate}%`],
      ['Испытания дня', profile.mines.dailyWins + profile.battle.dailyWins],
      ['Звуки', profile.sound ? 'вкл' : 'выкл']
    ];
    profileStats.innerHTML = cards.map(([label, value]) => `<div class="profile-card"><span>${label}</span><strong>${value}</strong></div>`).join('');

    const rankList = $('#rankList');
    rankList.innerHTML = ranks.map((item) => {
      const unlocked = profile.xp >= item.xp;
      return `<div class="rank-row">
        <div class="medal">${item.icon}</div>
        <div><strong>${item.title}</strong><span>${item.xp} XP · стиль ${item.unlock}</span></div>
        <span class="badge">${unlocked ? 'открыто' : 'закрыто'}</span>
      </div>`;
    }).join('');
    updateSoundButton();
  }

  $('#exportProfile').addEventListener('click', async () => {
    const data = JSON.stringify(profile, null, 2);
    try {
      await navigator.clipboard.writeText(data);
      toast('Профиль скопирован в буфер обмена');
    } catch {
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `apple-games-profile-${todayKey()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
  });

  $('#resetProfile').addEventListener('click', () => {
    const confirmed = window.confirm('Сбросить весь локальный прогресс, рекорды и статистику?');
    if (!confirmed) return;
    profile = mergeProfile(defaultProfile);
    storage.set('apple-games.profile', profile);
    storage.set('apple-games.skin', 'apple');
    renderProfile();
    renderSkinOptions();
    updateMinePanel();
    updateBattlePanel();
    toast('Прогресс сброшен');
  });

  function bootstrap() {
    applyTheme(savedTheme);
    renderProfile();
    renderSkinOptions();
    applySkin(savedSkin);
    updateSoundButton();
    newMineGame();
    initBattle();
    window.setTimeout(() => $('#splash')?.classList.add('done'), 480);
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      });
    }
  }

  bootstrap();
})();
