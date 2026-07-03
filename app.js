(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const storage = {
    get(key, fallback = null) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  };

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  const themeSelect = $('#themeSelect');
  const savedTheme = storage.get('apple-games.theme', 'system');

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeSelect.value = theme;
    const effectiveDark = theme === 'dark' || (theme === 'system' && prefersDark.matches);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', effectiveDark ? '#07080b' : '#f5f7fb');
  }

  applyTheme(savedTheme);
  themeSelect.addEventListener('change', (event) => {
    const theme = event.target.value;
    storage.set('apple-games.theme', theme);
    applyTheme(theme);
  });
  prefersDark.addEventListener?.('change', () => applyTheme(themeSelect.value));

  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((item) => item.classList.toggle('active', item === tab));
      $$('.screen').forEach((screen) => screen.classList.toggle('active', screen.id === `screen-${tab.dataset.screen}`));
    });
  });

  const mineConfig = {
    easy: { rows: 9, cols: 9, mines: 10, label: 'лёгкая' },
    medium: { rows: 16, cols: 16, mines: 40, label: 'средняя' },
    hard: { rows: 16, cols: 22, mines: 70, label: 'сложная' }
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
    flagMode: false,
    seconds: 0,
    timerId: null
  };

  const mineBoard = $('#mineBoard');
  const mineDifficulty = $('#mineDifficulty');
  const mineLeft = $('#mineLeft');
  const mineTimer = $('#mineTimer');
  const mineBest = $('#mineBest');
  const mineStatus = $('#mineStatus');
  const flagModeButton = $('#flagMode');

  function mineKey() {
    return `apple-games.mineBest.${mineState.difficulty}`;
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
    mineState.timerId = setInterval(() => {
      mineState.seconds += 1;
      mineTimer.textContent = `${mineState.seconds}с`;
    }, 1000);
  }

  function newMineGame() {
    const cfg = mineConfig[mineState.difficulty];
    Object.assign(mineState, {
      rows: cfg.rows,
      cols: cfg.cols,
      mines: cfg.mines,
      cells: [],
      started: false,
      over: false,
      revealed: 0,
      flags: 0
    });
    resetMineTimer();
    for (let r = 0; r < cfg.rows; r += 1) {
      for (let c = 0; c < cfg.cols; c += 1) {
        mineState.cells.push({ r, c, mine: false, n: 0, revealed: false, flagged: false });
      }
    }
    mineBoard.style.setProperty('--cols', cfg.cols);
    setMineStatus('Выбери клетку, чтобы начать.', 'neutral');
    updateMineStats();
    renderMines();
  }

  function cellAt(r, c) {
    if (r < 0 || c < 0 || r >= mineState.rows || c >= mineState.cols) return null;
    return mineState.cells[r * mineState.cols + c];
  }

  function neighbors(cell) {
    const list = [];
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const next = cellAt(cell.r + dr, cell.c + dc);
        if (next) list.push(next);
      }
    }
    return list;
  }

  function placeMines(firstCell) {
    const forbidden = new Set([firstCell, ...neighbors(firstCell)].map((cell) => `${cell.r}:${cell.c}`));
    const pool = mineState.cells.filter((cell) => !forbidden.has(`${cell.r}:${cell.c}`));
    shuffle(pool).slice(0, mineState.mines).forEach((cell) => { cell.mine = true; });
    mineState.cells.forEach((cell) => {
      cell.n = neighbors(cell).filter((next) => next.mine).length;
    });
    mineState.started = true;
    startMineTimer();
  }

  function revealCell(cell) {
    if (mineState.over || cell.revealed || cell.flagged) return;
    if (!mineState.started) placeMines(cell);
    cell.revealed = true;
    mineState.revealed += 1;

    if (cell.mine) {
      loseMines();
      return;
    }

    if (cell.n === 0) {
      neighbors(cell).forEach((next) => {
        if (!next.revealed && !next.flagged && !next.mine) revealCell(next);
      });
    }
    checkMineWin();
  }

  function toggleFlag(cell) {
    if (mineState.over || cell.revealed) return;
    if (!cell.flagged && mineState.flags >= mineState.mines) return;
    cell.flagged = !cell.flagged;
    mineState.flags += cell.flagged ? 1 : -1;
    updateMineStats();
    renderMines();
  }

  function handleMineAction(index) {
    const cell = mineState.cells[index];
    if (!cell || mineState.over) return;
    if (mineState.flagMode) toggleFlag(cell);
    else {
      revealCell(cell);
      updateMineStats();
      renderMines();
    }
  }

  function loseMines() {
    mineState.over = true;
    clearInterval(mineState.timerId);
    mineState.cells.forEach((cell) => { if (cell.mine) cell.revealed = true; });
    setMineStatus('Бум. Игра окончена — попробуй ещё раз.', 'danger');
  }

  function checkMineWin() {
    const safeCells = mineState.rows * mineState.cols - mineState.mines;
    if (mineState.revealed !== safeCells || mineState.over) return;
    mineState.over = true;
    clearInterval(mineState.timerId);
    mineState.cells.forEach((cell) => { if (cell.mine) cell.flagged = true; });
    const previous = storage.get(mineKey(), null);
    if (previous === null || mineState.seconds < previous) storage.set(mineKey(), mineState.seconds);
    setMineStatus(`Победа за ${mineState.seconds}с. Все безопасные клетки открыты.`, 'success');
    updateMineStats();
  }

  function updateMineStats() {
    mineLeft.textContent = Math.max(0, mineState.mines - mineState.flags);
    const best = storage.get(mineKey(), null);
    mineBest.textContent = best === null ? '—' : `${best}с`;
  }

  function renderMines() {
    const fragment = document.createDocumentFragment();
    mineState.cells.forEach((cell, index) => {
      const button = document.createElement('button');
      button.className = 'mine-cell';
      button.type = 'button';
      button.setAttribute('aria-label', `Клетка ${cell.r + 1}:${cell.c + 1}`);
      if (cell.revealed) button.classList.add('revealed', 'pop');
      if (cell.flagged) button.classList.add('flagged');
      if (cell.revealed && cell.mine) button.classList.add('mine');
      if (cell.revealed && !cell.mine && cell.n) button.classList.add(`n${cell.n}`);

      button.textContent = cell.revealed
        ? (cell.mine ? '✦' : (cell.n || ''))
        : (cell.flagged ? '🚩' : '');

      button.addEventListener('click', () => handleMineAction(index));
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        toggleFlag(cell);
      });
      fragment.appendChild(button);
    });
    mineBoard.replaceChildren(fragment);
  }

  mineDifficulty.value = mineState.difficulty;
  mineDifficulty.addEventListener('change', (event) => {
    mineState.difficulty = event.target.value;
    storage.set('apple-games.mineDifficulty', mineState.difficulty);
    newMineGame();
  });
  $('#newMineGame').addEventListener('click', newMineGame);
  flagModeButton.addEventListener('click', () => {
    mineState.flagMode = !mineState.flagMode;
    flagModeButton.classList.toggle('active', mineState.flagMode);
    flagModeButton.setAttribute('aria-pressed', String(mineState.flagMode));
  });

  const size = 10;
  const shipBlueprints = [
    { name: 'Авианосец', size: 5 },
    { name: 'Линкор', size: 4 },
    { name: 'Крейсер', size: 3 },
    { name: 'Подлодка', size: 3 },
    { name: 'Эсминец', size: 2 }
  ];

  const battleState = {
    difficulty: storage.get('apple-games.battleDifficulty', 'easy'),
    player: [],
    enemy: [],
    playerShips: [],
    enemyShips: [],
    active: false,
    turn: 'player',
    ai: { targets: [], shots: new Set() }
  };

  const playerBoard = $('#playerBoard');
  const enemyBoard = $('#enemyBoard');
  const battleDifficulty = $('#battleDifficulty');
  const battleStatus = $('#battleStatus');
  const playerShipsLeft = $('#playerShipsLeft');
  const enemyShipsLeft = $('#enemyShipsLeft');
  const battleWins = $('#battleWins');
  const battleLosses = $('#battleLosses');

  function statKey(type) {
    return `apple-games.battle.${battleState.difficulty}.${type}`;
  }

  function setBattleStatus(text, tone = 'neutral') {
    battleStatus.textContent = text;
    battleStatus.className = `status ${tone}`;
  }

  function createSeaBoard() {
    return Array.from({ length: size * size }, (_, index) => ({
      r: Math.floor(index / size),
      c: index % size,
      ship: null,
      hit: false,
      miss: false
    }));
  }

  function seaCell(board, r, c) {
    if (r < 0 || c < 0 || r >= size || c >= size) return null;
    return board[r * size + c];
  }

  function canPlace(board, r, c, length, vertical) {
    for (let i = 0; i < length; i += 1) {
      const rr = r + (vertical ? i : 0);
      const cc = c + (vertical ? 0 : i);
      if (!seaCell(board, rr, cc)) return false;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          const neighbor = seaCell(board, rr + dr, cc + dc);
          if (neighbor?.ship !== null) return false;
        }
      }
    }
    return true;
  }

  function placeFleet(board) {
    const ships = [];
    shipBlueprints.forEach((blueprint, id) => {
      let placed = false;
      let guard = 0;
      while (!placed && guard < 3000) {
        guard += 1;
        const vertical = Math.random() > 0.5;
        const r = Math.floor(Math.random() * size);
        const c = Math.floor(Math.random() * size);
        if (!canPlace(board, r, c, blueprint.size, vertical)) continue;
        const cells = [];
        for (let i = 0; i < blueprint.size; i += 1) {
          const cell = seaCell(board, r + (vertical ? i : 0), c + (vertical ? 0 : i));
          cell.ship = id;
          cells.push([cell.r, cell.c]);
        }
        ships[id] = { ...blueprint, id, hits: 0, sunk: false, cells };
        placed = true;
      }
      if (!placed) throw new Error('Не удалось расставить корабли');
    });
    return ships;
  }

  function resetBattle(keepStatus = false) {
    battleState.player = createSeaBoard();
    battleState.enemy = createSeaBoard();
    battleState.playerShips = placeFleet(battleState.player);
    battleState.enemyShips = placeFleet(battleState.enemy);
    battleState.active = false;
    battleState.turn = 'player';
    battleState.ai = { targets: [], shots: new Set() };
    if (!keepStatus) setBattleStatus('Флот расставлен. Можно начинать бой.', 'neutral');
    updateBattleStats();
    renderSeaBoards();
  }

  function startBattle() {
    resetBattle(true);
    battleState.active = true;
    setBattleStatus('Бой начался. Стреляй по полю ИИ.', 'warning');
    renderSeaBoards();
  }

  function attack(board, ships, r, c) {
    const cell = seaCell(board, r, c);
    if (!cell || cell.hit || cell.miss) return { result: 'repeat' };
    if (cell.ship !== null) {
      cell.hit = true;
      const ship = ships[cell.ship];
      ship.hits += 1;
      if (ship.hits >= ship.size) {
        ship.sunk = true;
        return { result: 'sunk', ship };
      }
      return { result: 'hit', ship };
    }
    cell.miss = true;
    return { result: 'miss' };
  }

  function addAiTargets(r, c) {
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
      const rr = r + dr;
      const cc = c + dc;
      const cell = seaCell(battleState.player, rr, cc);
      const key = `${rr}:${cc}`;
      if (cell && !cell.hit && !cell.miss && !battleState.ai.shots.has(key) && !battleState.ai.targets.some((item) => item[0] === rr && item[1] === cc)) {
        battleState.ai.targets.push([rr, cc]);
      }
    });
  }

  function chooseAiShot() {
    const unknown = battleState.player.filter((cell) => !cell.hit && !cell.miss);
    if (!unknown.length) return null;

    if (battleState.difficulty !== 'easy') {
      while (battleState.ai.targets.length) {
        const target = battleState.ai.targets.shift();
        const cell = seaCell(battleState.player, target[0], target[1]);
        if (cell && !cell.hit && !cell.miss) return target;
      }
    }

    if (battleState.difficulty === 'hard') {
      const parity = unknown.filter((cell) => (cell.r + cell.c) % 2 === 0);
      const pool = parity.length ? parity : unknown;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      return [pick.r, pick.c];
    }

    const pick = unknown[Math.floor(Math.random() * unknown.length)];
    return [pick.r, pick.c];
  }

  function playerShoot(index) {
    if (!battleState.active || battleState.turn !== 'player') return;
    const target = battleState.enemy[index];
    const shot = attack(battleState.enemy, battleState.enemyShips, target.r, target.c);
    if (shot.result === 'repeat') return;

    if (shot.result === 'miss') {
      battleState.turn = 'ai';
      setBattleStatus('Мимо. Теперь ход ИИ.', 'neutral');
      renderSeaBoards();
      window.setTimeout(aiTurn, 520);
      return;
    }

    if (shot.result === 'sunk') setBattleStatus(`Корабль ИИ уничтожен: ${shot.ship.name}. Стреляй ещё.`, 'success');
    else setBattleStatus('Попадание. У тебя дополнительный ход.', 'success');

    finishCheck();
    renderSeaBoards();
  }

  function aiTurn() {
    if (!battleState.active || battleState.turn !== 'ai') return;
    const shotTarget = chooseAiShot();
    if (!shotTarget) return;
    const [r, c] = shotTarget;
    battleState.ai.shots.add(`${r}:${c}`);
    const shot = attack(battleState.player, battleState.playerShips, r, c);

    if (shot.result === 'hit') {
      if (battleState.difficulty !== 'easy') addAiTargets(r, c);
      setBattleStatus('ИИ попал и стреляет ещё.', 'danger');
      finishCheck();
      renderSeaBoards();
      if (battleState.active) window.setTimeout(aiTurn, 620);
      return;
    }

    if (shot.result === 'sunk') {
      battleState.ai.targets = [];
      setBattleStatus(`ИИ уничтожил ваш корабль: ${shot.ship.name}.`, 'danger');
      finishCheck();
      renderSeaBoards();
      if (battleState.active) window.setTimeout(aiTurn, 720);
      return;
    }

    battleState.turn = 'player';
    setBattleStatus('ИИ промахнулся. Твой ход.', 'warning');
    renderSeaBoards();
  }

  function shipsAlive(ships) {
    return ships.filter((ship) => !ship.sunk).length;
  }

  function finishCheck() {
    const enemyAlive = shipsAlive(battleState.enemyShips);
    const playerAlive = shipsAlive(battleState.playerShips);
    if (enemyAlive === 0 || playerAlive === 0) {
      battleState.active = false;
      const won = enemyAlive === 0;
      const key = statKey(won ? 'wins' : 'losses');
      storage.set(key, storage.get(key, 0) + 1);
      setBattleStatus(won ? 'Победа. Флот ИИ уничтожен.' : 'Поражение. ИИ уничтожил ваш флот.', won ? 'success' : 'danger');
      updateBattleStats();
    }
  }

  function updateBattleStats() {
    playerShipsLeft.textContent = battleState.playerShips.length ? shipsAlive(battleState.playerShips) : 5;
    enemyShipsLeft.textContent = battleState.enemyShips.length ? shipsAlive(battleState.enemyShips) : 5;
    battleWins.textContent = storage.get(statKey('wins'), 0);
    battleLosses.textContent = storage.get(statKey('losses'), 0);
  }

  function renderSeaBoards() {
    updateBattleStats();
    renderSeaBoard(playerBoard, battleState.player, battleState.playerShips, false);
    renderSeaBoard(enemyBoard, battleState.enemy, battleState.enemyShips, true);
  }

  function renderSeaBoard(root, board, ships, hidden) {
    const fragment = document.createDocumentFragment();
    board.forEach((cell, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sea-cell';
      button.setAttribute('aria-label', `Клетка ${cell.r + 1}:${cell.c + 1}`);
      const ship = cell.ship !== null ? ships[cell.ship] : null;

      if (!hidden && cell.ship !== null) button.classList.add('ship');
      if (cell.hit) button.classList.add('hit');
      if (cell.miss) button.classList.add('miss');
      if (cell.hit && ship?.sunk) button.classList.add('sunk');
      if (hidden && (!battleState.active || battleState.turn !== 'player' || cell.hit || cell.miss)) button.classList.add('disabled');

      if (cell.hit) button.textContent = ship?.sunk ? '✹' : '×';
      else if (cell.miss) button.textContent = '•';
      else if (!hidden && cell.ship !== null) button.textContent = '▰';
      else button.textContent = '';

      if (hidden) button.addEventListener('click', () => playerShoot(index));
      fragment.appendChild(button);
    });
    root.replaceChildren(fragment);
  }

  battleDifficulty.value = battleState.difficulty;
  battleDifficulty.addEventListener('change', (event) => {
    battleState.difficulty = event.target.value;
    storage.set('apple-games.battleDifficulty', battleState.difficulty);
    resetBattle();
  });
  $('#randomFleet').addEventListener('click', () => resetBattle());
  $('#startBattle').addEventListener('click', startBattle);

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  newMineGame();
  resetBattle(true);
})();
