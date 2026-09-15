function specFromLegend(body) {
  const text = body.trim();

  for (const kind of Object.keys(PREFIXES)) {
    const prefix = PREFIXES[kind];
    if (text.startsWith(prefix)) {
      const id = text.slice(prefix.length).trim();
      return id ? { k: kind, id } : null;
    }
  }

  for (const kind of Object.keys(TILE_NAMES)) {
    if (text === TILE_NAMES[kind]) return kind === 'empty' ? EMPTY : { k: kind };
  }

  if (ENEMY_BY_TILE[text]) return { k: 'enemy', id: text };

  return null;
}

function legendBodyOf(spec) {
  if (spec.k === 'enemy') return spec.id;
  if (PREFIXES[spec.k]) return PREFIXES[spec.k] + spec.id;
  return TILE_NAMES[spec.k];
}

function defaultLegend() {
  const legend = { '#': WALL, '.': FLOOR, '@': { k: 'spawn' } };
  DATA.enemies.forEach((enemy) => { legend[enemy.symbol] = { k: 'enemy', id: enemy.tile }; });
  return legend;
}

function parseRoom(text, fallbackName) {
  const lines = text.replace(/\r\n/g, '\n').replace(/^﻿/, '').split('\n');
  const info = {};
  let legend = null;
  const rows = [];
  let section = 'map';

  for (const raw of lines) {
    if (raw.startsWith(';')) continue;

    const head = raw.trim();
    if (head === '[legend]') { section = 'legend'; legend = {}; continue; }
    if (head === '[map]') { section = 'map'; continue; }
    if (head === '[level]') { section = 'level'; continue; }

    if (section === 'level') {
      if (!head) continue;
      const at = head.indexOf(' ');
      if (at > 0) info[head.slice(0, at)] = head.slice(at + 1).trim();
      continue;
    }

    if (section === 'legend') {
      if (!head) continue;
      const symbol = head[0];
      const spec = specFromLegend(head.slice(1));
      if (spec) legend[symbol] = spec;
      continue;
    }

    if (!raw.trim()) continue;
    rows.push(raw);
  }

  if (!rows.length) throw new Error('в файле нет карты');

  const used = legend || defaultLegend();
  const width = rows.reduce((most, line) => Math.max(most, line.length), 0);
  const grid = new Grid(width, rows.length, () => EMPTY);

  rows.forEach((line, row) => {
    for (let column = 0; column < line.length; column++) {
      const spec = used[line[column]];
      grid.set(column, row, spec || EMPTY);
    }
  });

  const symbols = {};
  Object.keys(used).forEach((symbol) => { symbols[keyOf(used[symbol])] = symbol; });

  return {
    name: info.name || fallbackName || 'room',
    kind: info.kind || '',
    tileset: info.tileset || 'prison',
    grid,
    symbols,
  };
}

function assignSymbols(grid, preferred) {
  const specs = new Map();
  for (let row = 0; row < grid.height; row++) {
    for (let column = 0; column < grid.width; column++) {
      const spec = grid.at(column, row) || EMPTY;
      specs.set(keyOf(spec), spec);
    }
  }

  const symbols = new Map();
  const taken = new Set();

  const claim = (key, symbol) => { symbols.set(key, symbol); taken.add(symbol); };

  specs.forEach((spec, key) => {
    const fixed = FIXED_SYMBOLS[spec.k];
    if (fixed && !taken.has(fixed)) claim(key, fixed);
  });

  specs.forEach((spec, key) => {
    if (symbols.has(key)) return;
    const kept = preferred && preferred[key];
    if (kept && !taken.has(kept)) claim(key, kept);
  });

  specs.forEach((spec, key) => {
    if (symbols.has(key) || spec.k !== 'door') return;
    if (!taken.has('+')) claim(key, '+');
  });

  specs.forEach((spec, key) => {
    if (symbols.has(key) || spec.k !== 'enemy') return;
    const enemy = ENEMY_BY_TILE[spec.id];
    if (enemy && !taken.has(enemy.symbol)) claim(key, enemy.symbol);
  });

  specs.forEach((spec, key) => {
    if (symbols.has(key)) return;
    for (const symbol of SYMBOL_POOL) {
      if (!taken.has(symbol)) { claim(key, symbol); return; }
    }
    throw new Error('символы кончились - слишком много разных вещей в комнате');
  });

  return symbols;
}

function roomToText(room) {
  const symbols = assignSymbols(room.grid, room.symbols);
  const seen = new Map();

  for (let row = 0; row < room.grid.height; row++) {
    for (let column = 0; column < room.grid.width; column++) {
      const spec = room.grid.at(column, row) || EMPTY;
      seen.set(keyOf(spec), spec);
    }
  }

  const order = ['wall', 'floor', 'spawn', 'entrance', 'exit', 'door', 'enemy', 'prop', 'item', 'patrol', 'watch', 'zone'];
  const legendLines = [];
  order.forEach((kind) => {
    seen.forEach((spec, key) => {
      if (spec.k !== kind || spec.k === 'empty') return;
      legendLines.push(symbols.get(key) + ' ' + legendBodyOf(spec));
    });
  });

  const map = [];
  for (let row = 0; row < room.grid.height; row++) {
    let line = '';
    for (let column = 0; column < room.grid.width; column++) {
      line += symbols.get(keyOf(room.grid.at(column, row) || EMPTY));
    }
    map.push(line.replace(/ +$/, ''));
  }

  let head = '[level]\n';
  if (room.kind) head += 'kind ' + room.kind + '\n';
  head += 'tileset ' + room.tileset + '\n';

  return head + '\n[legend]\n' + legendLines.join('\n') + '\n\n[map]\n' + map.join('\n') + '\n';
}

function actToText(act, rooms) {
  const used = [];
  act.places.forEach((place) => {
    if (place && used.indexOf(place.room) < 0) used.push(place.room);
  });

  let text = '[act]\n';
  text += 'title ' + (act.title || 'Акт') + '\n';
  if (act.next) text += 'next ' + act.next + '\n';
  text += 'tileset ' + act.tileset + '\n';
  if (act.boss) text += 'boss ' + act.boss + '\n';

  text += '\n[library]\n';
  used.forEach((name) => { text += name + ' Resources/Rooms/' + name + '.config\n'; });

  text += '\n[rooms]\n';
  act.places.forEach((place, index) => {
    if (!place) return;
    const column = index % act.columns;
    const row = Math.floor(index / act.columns);
    const room = rooms[place.room];
    const width = room ? room.grid.width : 16;
    const height = room ? room.grid.height : 12;
    text += place.room + ' ' + column * width + ' ' + row * height + '\n';
  });

  return text;
}

function parseAct(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/^﻿/, '').split('\n');
  const act = { title: '', next: '', tileset: 'prison', boss: '', library: {}, rooms: [] };
  let section = '';

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    if (line === '[act]' || line === '[library]' || line === '[rooms]') { section = line; continue; }

    const parts = line.split(/\s+/);
    if (section === '[act]') {
      const rest = line.slice(parts[0].length).trim();
      if (parts[0] === 'title') act.title = rest;
      if (parts[0] === 'next') act.next = rest;
      if (parts[0] === 'tileset') act.tileset = rest;
      if (parts[0] === 'boss') act.boss = rest;
      continue;
    }

    if (section === '[library]') { act.library[parts[0]] = parts[1] || ''; continue; }
    if (section === '[rooms]') {
      act.rooms.push({ id: parts[0], column: parseInt(parts[1], 10) || 0, row: parseInt(parts[2], 10) || 0 });
    }
  }

  return act;
}
