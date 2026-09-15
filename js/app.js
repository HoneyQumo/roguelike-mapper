const STORE_KEY = 'roguelike-mapper-v1';

const state = {
  mode: 'room',
  room: blankRoom(16, 12, 'room'),
  brush: WALL,
  tool: 'brush',
  rooms: {},
  act: { title: 'Акт', next: '', tileset: 'prison', music: '', ambient: '', boss: '',
    columns: 4, rows: 3, cellWidth: 16, cellHeight: 12, places: [] },
  drag: null,
};

const view = document.getElementById('view');
const output = document.getElementById('output');
const checksList = document.getElementById('checks');
const libraryList = document.getElementById('library');
const cursorLabel = document.getElementById('cursor');
const tilesetPick = document.getElementById('tileset');
const showGrid = document.getElementById('showGrid');
const showSeams = document.getElementById('showSeams');

function save() {
  try {
    const rooms = {};
    Object.keys(state.rooms).forEach((name) => { rooms[name] = roomToText(state.rooms[name]); });
    localStorage.setItem(STORE_KEY, JSON.stringify({
      room: roomToText(state.room),
      roomName: state.room.name,
      rooms,
      act: state.act,
    }));
  } catch (error) { /* приватное окно или запрет на хранилище */ }
}

function restore() {
  let kept = null;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) kept = JSON.parse(raw);
  } catch (error) { return; }

  if (!kept) return;

  try {
    if (kept.room) {
      state.room = parseRoom(kept.room, kept.roomName || 'room');
      state.room.name = kept.roomName || state.room.name;
    }
  } catch (error) { /* одна испорченная комната не должна прятать библиотеку */ }

  Object.keys(kept.rooms || {}).forEach((name) => {
    try {
      state.rooms[name] = parseRoom(kept.rooms[name], name);
      state.rooms[name].name = name;
    } catch (error) { /* пропускаем только эту комнату */ }
  });

  try {
    if (kept.act) state.act = Object.assign(state.act, kept.act);
  } catch (error) { /* акт не обязателен */ }
}

function actPlaces() {
  const total = state.act.columns * state.act.rows;
  while (state.act.places.length < total) state.act.places.push(null);
  state.act.places.length = total;
  return state.act.places;
}

function actGrid() {
  const places = actPlaces();
  const width = state.act.cellWidth;
  const height = state.act.cellHeight;

  let right = 0;
  let bottom = 0;
  places.forEach((place, index) => {
    const room = place && state.rooms[place.room];
    if (!room) return;
    const column = index % state.act.columns;
    const row = Math.floor(index / state.act.columns);
    right = Math.max(right, column * width + room.grid.width);
    bottom = Math.max(bottom, row * height + room.grid.height);
  });

  const grid = new Grid(Math.max(1, right), Math.max(1, bottom), () => EMPTY);
  const boxes = [];

  places.forEach((place, index) => {
    if (!place) return;
    const room = state.rooms[place.room];
    if (!room) return;

    const column = index % state.act.columns;
    const row = Math.floor(index / state.act.columns);
    boxes.push({ x: column * width, y: row * height, width, height, label: place.room });

    for (let r = 0; r < room.grid.height; r++) {
      for (let c = 0; c < room.grid.width; c++) {
        grid.set(column * width + c, row * height + r, room.grid.at(c, r));
      }
    }
  });

  return { grid, boxes, width, height };
}

function cellSize(grid) {
  const room = document.querySelector('.canvasWrap');
  const room_width = Math.max(320, room.clientWidth - 26);
  const room_height = Math.max(240, room.clientHeight - 26);
  const fit = Math.min(room_width / grid.width, room_height / grid.height);
  return Math.max(6, Math.min(48, Math.floor(fit)));
}

let lastIssues = [];
let lastGrid = null;
let lastSize = 16;

function draw() {
  const isRoom = state.mode === 'room';
  const scene = isRoom ? { grid: state.room.grid, boxes: null } : actGrid();
  const tileset = (isRoom ? state.room.tileset : state.act.tileset) || DEFAULT_TILESET;

  lastIssues = isRoom
    ? checkRoom(scene.grid)
    : checkMap(scene.grid, { hasNext: !!state.act.next })
      .concat(checkSeams(actPlaces(), state.rooms, state.act.columns, state.act.cellWidth, state.act.cellHeight));

  lastGrid = scene.grid;
  lastSize = cellSize(scene.grid);

  drawScene(view, scene.grid, {
    size: lastSize,
    tileset,
    grid: showGrid.checked,
    seams: !isRoom && showSeams.checked ? scene.boxes : null,
    issues: lastIssues,
  });

  showChecks();
  showOutput();
}

function showChecks() {
  checksList.innerHTML = '';

  if (!lastIssues.length) {
    const li = document.createElement('li');
    li.className = 'good';
    li.textContent = 'чисто';
    checksList.appendChild(li);
    return;
  }

  const groups = new Map();
  lastIssues.forEach((issue) => {
    const list = groups.get(issue.text) || [];
    list.push(issue);
    groups.set(issue.text, list);
  });

  groups.forEach((list, text) => {
    const li = document.createElement('li');
    li.className = list[0].hard ? 'bad' : '';
    const where = list[0].column < 0 ? '' : ' ' + list[0].column + ';' + list[0].row
      + (list.length > 1 ? ' и ещё ' + (list.length - 1) : '');
    li.textContent = text;
    if (where) {
      const note = document.createElement('span');
      note.className = 'where';
      note.textContent = where;
      li.appendChild(note);
    }
    checksList.appendChild(li);
  });
}

let lastOutput = '';

function showOutput() {
  document.getElementById('outputHead').textContent = state.mode === 'room' ? 'Файл комнаты' : 'Файл акта';

  let text;
  try {
    text = state.mode === 'room'
      ? roomToText(state.room)
      : actToText({
        title: state.act.title,
        next: state.act.next,
        tileset: state.act.tileset,
        music: state.act.music,
        ambient: state.act.ambient,
        boss: state.act.boss,
        columns: state.act.columns,
        cellWidth: state.act.cellWidth,
        cellHeight: state.act.cellHeight,
        places: actPlaces(),
      }, state.rooms);
  } catch (error) {
    text = '; ' + error.message;
  }

  if (output.value && output.value !== lastOutput) return;

  output.value = text;
  lastOutput = text;
}

function paint(column, row, spec) {
  if (state.tool === 'pick') {
    const found = state.room.grid.at(column, row);
    if (found) selectSpec(found);
    return;
  }

  if (state.tool === 'fill') {
    const target = keyOf(state.room.grid.at(column, row));
    if (target === keyOf(spec)) return;

    const wave = [[column, row]];
    while (wave.length) {
      const [c, r] = wave.pop();
      if (!state.room.grid.inside(c, r)) continue;
      if (keyOf(state.room.grid.at(c, r)) !== target) continue;

      state.room.grid.set(c, r, spec);
      wave.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
    return;
  }

  state.room.grid.set(column, row, spec);
}

function cellAt(event) {
  const box = view.getBoundingClientRect();
  const column = Math.floor((event.clientX - box.left - view.clientLeft) / lastSize);
  const row = Math.floor((event.clientY - box.top - view.clientTop) / lastSize);
  return [column, row];
}

view.addEventListener('contextmenu', (event) => event.preventDefault());

view.addEventListener('mousedown', (event) => {
  const [column, row] = cellAt(event);
  if (!lastGrid || !lastGrid.inside(column, row)) return;

  if (state.mode === 'map') {
    const index = Math.floor(row / state.act.cellHeight) * state.act.columns
      + Math.floor(column / state.act.cellWidth);
    if (index < 0 || index >= actPlaces().length) return;

    const pick = document.getElementById('mapRoomPick').value;
    state.act.places[index] = event.button === 2 || !pick ? null : { room: pick };
    save();
    draw();
    return;
  }

  const spec = event.button === 2 ? FLOOR : state.brush;
  if (state.tool === 'rect') {
    state.drag = { from: [column, row], spec, before: state.room.grid.clone() };
  } else {
    state.drag = { from: null, spec };
    paint(column, row, spec);
  }

  draw();
});

view.addEventListener('mousemove', (event) => {
  const [column, row] = cellAt(event);
  if (!lastGrid) return;

  cursorLabel.textContent = lastGrid.inside(column, row) ? column + ';' + row : '';
  if (!state.drag || state.mode !== 'room') return;

  if (state.drag.from) {
    state.room.grid = state.drag.before.clone();
    const [fromColumn, fromRow] = state.drag.from;
    for (let r = Math.min(fromRow, row); r <= Math.max(fromRow, row); r++) {
      for (let c = Math.min(fromColumn, column); c <= Math.max(fromColumn, column); c++) {
        state.room.grid.set(c, r, state.drag.spec);
      }
    }
  } else if (lastGrid.inside(column, row)) {
    paint(column, row, state.drag.spec);
  }

  draw();
});

window.addEventListener('mouseup', () => {
  if (!state.drag) return;
  state.drag = null;
  save();
  draw();
});

function selectSpec(spec) {
  state.brush = spec;
  document.querySelectorAll('.swatch').forEach((button) => {
    button.classList.toggle('on', button.dataset.key === keyOf(spec));
  });
}

function swatchPreview(spec) {
  if (spec.k === 'prop') {
    const prop = PROP_BY_ID[spec.id];
    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 20;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    if (prop) drawProp(context, prop, 0, 0, 20);
    return canvas;
  }

  if (spec.k === 'wall' || spec.k === 'floor' || spec.k === 'empty') {
    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 20;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    const sheet = IMAGES['tiles:' + (state.room.tileset || DEFAULT_TILESET)];
    if (spec.k === 'empty' || !sheet) {
      context.fillStyle = spec.k === 'empty' ? '#0e1013' : '#4a4740';
      context.fillRect(0, 0, 20, 20);
    } else {
      const frame = spec.k === 'wall' ? 15 : 0;
      context.drawImage(sheet, frame * TILE, (spec.k === 'wall' ? WALL_ROW : FLOOR_ROW) * TILE,
        TILE, TILE, 0, 0, 20, 20);
    }
    return canvas;
  }

  const dot = document.createElement('span');
  dot.className = 'dot';
  if (spec.k === 'enemy') dot.style.background = enemyColour(spec.id);
  else if (spec.k === 'item') dot.style.background = unlockTargetOf(spec.id) ? '#ffe45e' : '#7fe3a8';
  else dot.style.background = (MARKS[spec.k] || ['#888'])[0];
  return dot;
}

function addSwatch(box, spec, name, tag) {
  const button = document.createElement('button');
  button.className = 'swatch';
  button.dataset.key = keyOf(spec);
  button.appendChild(swatchPreview(spec));

  const label = document.createElement('span');
  label.className = 'name';
  label.textContent = name;
  button.appendChild(label);

  if (tag) {
    const note = document.createElement('span');
    note.className = 'tag';
    note.textContent = tag;
    button.appendChild(note);
  }

  button.addEventListener('click', () => selectSpec(spec));
  box.appendChild(button);
}

function buildPalette() {
  const palette = document.getElementById('palette');
  palette.innerHTML = '';

  const group = (title) => {
    const box = document.createElement('div');
    box.className = 'group';
    const head = document.createElement('div');
    head.className = 'groupName';
    head.textContent = title;
    box.appendChild(head);
    const swatches = document.createElement('div');
    swatches.className = 'swatches';
    box.appendChild(swatches);
    palette.appendChild(box);
    return swatches;
  };

  const base = group('Основа');
  addSwatch(base, WALL, 'Стена');
  addSwatch(base, FLOOR, 'Пол');
  addSwatch(base, EMPTY, 'Пустота');
  addSwatch(base, { k: 'spawn' }, 'Старт игрока');
  addSwatch(base, { k: 'entrance' }, 'Вход');
  addSwatch(base, { k: 'exit' }, 'Выход');

  const enemies = group('Враги');
  DATA.enemies.forEach((enemy) => addSwatch(enemies, { k: 'enemy', id: enemy.tile }, enemy.name, enemy.symbol));

  const props = group('Объекты');
  DATA.props.forEach((prop) => {
    const tags = [];
    if (!prop.solid) tags.push('пройти');
    if (prop.cover) tags.push('укрытие');
    if (prop.health > 0) tags.push('ломается');
    addSwatch(props, { k: 'prop', id: prop.id }, prop.name, tags.join(', '));
  });

  const items = group('Предметы');
  DATA.items.forEach((item) => {
    addSwatch(items, { k: 'item', id: item.id }, item.name, item.effect === 'Unlock' ? item.target : '');
  });

  selectSpec(state.brush);
}

function refreshLibrary() {
  libraryList.innerHTML = '';
  const names = Object.keys(state.rooms).sort();

  names.forEach((name) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'name';
    label.textContent = name;
    li.appendChild(label);

    const edit = document.createElement('button');
    edit.textContent = 'Открыть';
    edit.addEventListener('click', () => {
      state.room = state.rooms[name];
      state.mode = 'room';
      syncMode();
      save();
      draw();
    });
    li.appendChild(edit);

    const drop = document.createElement('button');
    drop.textContent = '×';
    drop.addEventListener('click', () => { delete state.rooms[name]; refreshLibrary(); save(); draw(); });
    li.appendChild(drop);

    libraryList.appendChild(li);
  });

  const pick = document.getElementById('mapRoomPick');
  const kept = pick.value;
  pick.innerHTML = '';
  names.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    pick.appendChild(option);
  });
  if (names.indexOf(kept) >= 0) pick.value = kept;
}

function syncMode() {
  const isRoom = state.mode === 'room';
  document.getElementById('tabRoom').classList.toggle('on', isRoom);
  document.getElementById('tabMap').classList.toggle('on', !isRoom);
  document.getElementById('roomTools').classList.toggle('hidden', !isRoom);
  document.getElementById('mapTools').classList.toggle('hidden', isRoom);
  document.getElementById('palettePane').classList.toggle('hidden', !isRoom);

  document.getElementById('roomWidth').value = state.room.grid.width;
  document.getElementById('roomHeight').value = state.room.grid.height;
  document.getElementById('roomName').value = state.room.name;
  tilesetPick.value = (isRoom ? state.room.tileset : state.act.tileset) || DEFAULT_TILESET;
}

function wire() {
  Object.keys(DATA.tilesets).sort().forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    tilesetPick.appendChild(option);
  });

  tilesetPick.addEventListener('change', () => {
    if (state.mode === 'room') state.room.tileset = tilesetPick.value;
    else state.act.tileset = tilesetPick.value;
    buildPalette();
    save();
    draw();
  });

  document.getElementById('tabRoom').addEventListener('click', () => { state.mode = 'room'; syncMode(); draw(); });
  document.getElementById('tabMap').addEventListener('click', () => { state.mode = 'map'; syncMode(); draw(); });

  document.querySelectorAll('.tool').forEach((button) => {
    button.addEventListener('click', () => {
      state.tool = button.dataset.tool;
      document.querySelectorAll('.tool').forEach((other) => other.classList.toggle('on', other === button));
    });
  });

  const resize = () => {
    const width = Math.max(3, Math.min(64, parseInt(document.getElementById('roomWidth').value, 10) || 16));
    const height = Math.max(3, Math.min(64, parseInt(document.getElementById('roomHeight').value, 10) || 12));
    state.room.grid.resize(width, height);
    save();
    draw();
  };
  document.getElementById('roomWidth').addEventListener('change', resize);
  document.getElementById('roomHeight').addEventListener('change', resize);

  document.getElementById('roomName').addEventListener('change', (event) => {
    state.room.name = event.target.value.trim() || 'room';
    save();
  });

  document.getElementById('roomNew').addEventListener('click', () => {
    state.room = blankRoom(state.room.grid.width, state.room.grid.height, state.room.name);
    save();
    draw();
  });

  document.getElementById('roomSave').addEventListener('click', () => {
    state.rooms[state.room.name] = state.room;
    refreshLibrary();
    save();
    draw();
  });

  ['mapCols', 'mapRows', 'mapCellWidth', 'mapCellHeight'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => {
      state.act.columns = Math.max(1, Math.min(12, parseInt(document.getElementById('mapCols').value, 10) || 4));
      state.act.rows = Math.max(1, Math.min(12, parseInt(document.getElementById('mapRows').value, 10) || 3));
      state.act.cellWidth = Math.max(3, Math.min(64, parseInt(document.getElementById('mapCellWidth').value, 10) || 16));
      state.act.cellHeight = Math.max(3, Math.min(64, parseInt(document.getElementById('mapCellHeight').value, 10) || 12));
      actPlaces();
      save();
      draw();
    });
  });

  const custom = () => document.getElementById('customId').value.trim();
  document.getElementById('addDoor').addEventListener('click', () => { if (custom()) selectSpec({ k: 'door', id: custom() }); });
  document.getElementById('addPatrol').addEventListener('click', () => { if (custom()) selectSpec({ k: 'patrol', id: custom() }); });
  document.getElementById('addWatch').addEventListener('click', () => { if (custom()) selectSpec({ k: 'watch', id: custom() }); });
  document.getElementById('addZone').addEventListener('click', () => { if (custom()) selectSpec({ k: 'zone', id: custom() }); });

  document.getElementById('copy').addEventListener('click', () => {
    output.select();
    try { document.execCommand('copy'); } catch (error) { /* браузер может запретить */ }
  });

  document.getElementById('load').addEventListener('click', () => {
    try {
      if (state.mode === 'room') {
        state.room = parseRoom(output.value, state.room.name);
        state.room.name = document.getElementById('roomName').value.trim() || state.room.name;
      } else {
        applyAct(parseAct(output.value));
      }
      syncMode();
      save();
      draw();
    } catch (error) {
      alert('не разобрал: ' + error.message);
    }
  });

  document.getElementById('download').addEventListener('click', () => {
    const name = state.mode === 'room' ? state.room.name + '.config' : 'act.config';
    const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  });

  document.getElementById('clearLibrary').addEventListener('click', () => {
    state.rooms = {};
    refreshLibrary();
    save();
    draw();
  });

  document.getElementById('loadFiles').addEventListener('change', (event) => {
    const files = Array.from(event.target.files || []);
    let left = files.length;
    if (!left) return;

    const acts = [];
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result);
        const name = file.name.replace(/\.[^.]+$/, '');
        try {
          if (text.indexOf('[rooms]') >= 0) acts.push(parseAct(text));
          else {
            const room = parseRoom(text, name);
            room.name = name;
            room.path = 'Resources/Rooms/' + file.name;
            state.rooms[name] = room;
          }
        } catch (error) { /* один битый файл не должен ронять загрузку остальных */ }

        if (--left === 0) {
          if (acts.length) applyAct(acts[0]);
          refreshLibrary();
          save();
          draw();
        }
      };
      reader.readAsText(file);
    });

    event.target.value = '';
  });

  [showGrid, showSeams].forEach((box) => box.addEventListener('change', draw));
  window.addEventListener('resize', draw);
}

function applyAct(act) {
  state.act.title = act.title || state.act.title;
  state.act.next = act.next || '';
  state.act.tileset = act.tileset || state.act.tileset;
  state.act.boss = act.boss || '';

  let width = 0;
  let height = 0;
  act.rooms.forEach((placement) => {
    if (placement.column > 0) width = width ? Math.min(width, placement.column) : placement.column;
    if (placement.row > 0) height = height ? Math.min(height, placement.row) : placement.row;
  });

  if (!width || !height) {
    act.rooms.forEach((placement) => {
      const room = state.rooms[placement.id] || state.rooms[fileStem(act.library[placement.id])];
      if (!room) return;
      if (!width) width = room.grid.width;
      if (!height) height = room.grid.height;
    });
  }

  width = width || 16;
  height = height || 12;
  state.act.cellWidth = width;
  state.act.cellHeight = height;

  let columns = 1;
  let rows = 1;
  act.rooms.forEach((placement) => {
    columns = Math.max(columns, Math.floor(placement.column / width) + 1);
    rows = Math.max(rows, Math.floor(placement.row / height) + 1);
  });

  state.act.columns = columns;
  state.act.rows = rows;
  state.act.places = new Array(columns * rows).fill(null);

  const missing = [];
  const clashes = [];

  act.rooms.forEach((placement) => {
    const name = state.rooms[placement.id] ? placement.id : fileStem(act.library[placement.id]);
    if (!state.rooms[name]) { missing.push(placement.id); return; }

    const offGrid = placement.column % width !== 0 || placement.row % height !== 0;
    const index = Math.floor(placement.row / height) * columns + Math.floor(placement.column / width);
    if (index < 0 || index >= state.act.places.length) { clashes.push(placement.id); return; }
    if (offGrid || state.act.places[index]) { clashes.push(placement.id); return; }

    state.act.places[index] = { room: name, quarters: placement.quarters, isMirrored: placement.isMirrored };
  });

  document.getElementById('mapCols').value = columns;
  document.getElementById('mapRows').value = rows;
  document.getElementById('mapCellWidth').value = width;
  document.getElementById('mapCellHeight').value = height;
  state.mode = 'map';

  if (missing.length || clashes.length) {
    const parts = [];
    if (missing.length) parts.push('нет в библиотеке: ' + missing.join(', '));
    if (clashes.length) parts.push('не легли в сетку: ' + clashes.join(', '));
    alert('Часть комнат не разложилась - ' + parts.join('; '));
  }
}

function fileStem(path) {
  if (!path) return '';
  const name = path.split('/').pop();
  return name.replace(/\.[^.]+$/, '');
}

loadImages(() => {
  restore();
  wire();
  buildPalette();
  refreshLibrary();
  syncMode();
  draw();
});
