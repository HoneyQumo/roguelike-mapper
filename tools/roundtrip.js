const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const GAME = process.argv[2] || path.join(ROOT, '..', 'Roguelike', 'Roguelike');

const context = { window: {}, console };
vm.createContext(context);
['data/assets.js', 'js/model.js', 'js/config.js', 'js/checks.js'].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
});

const { parseRoom, roomToText, parseAct, actToText } = context;

function body(text, section) {
  const at = text.indexOf('[' + section + ']');
  if (at < 0) return '';
  const rest = text.slice(at + section.length + 2);
  const next = rest.search(/\n\[/);
  return (next < 0 ? rest : rest.slice(0, next)).replace(/\s+$/, '').trim();
}

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

let checked = 0;
let failed = 0;

function checkFile(file) {
  const source = read(file);
  const name = path.basename(file);
  const room = parseRoom(source, name.replace(/\.[^.]+$/, ''));
  const back = roomToText(room);

  checked++;

  const wantMap = body(source, 'map');
  const gotMap = body(back, 'map');
  if (wantMap !== gotMap) {
    failed++;
    console.log('MAP CHANGED ' + name);
    wantMap.split('\n').forEach((line, index) => {
      const other = gotMap.split('\n')[index];
      if (line !== other) console.log('  ' + index + ' было |' + line + '| стало |' + other + '|');
    });
    return;
  }

  const usedSymbols = new Set(wantMap.replace(/\n/g, '').split(''));
  const wantLegend = body(source, 'legend').split('\n').map((line) => line.trim()).filter(Boolean)
    .filter((line) => usedSymbols.has(line[0]));
  const gotLegend = body(back, 'legend').split('\n').map((line) => line.trim()).filter(Boolean);
  if (wantLegend.join('\n') !== gotLegend.join('\n')) {
    failed++;
    console.log('LEGEND CHANGED ' + name);
    console.log('  было  ' + wantLegend.join(' / '));
    console.log('  стало ' + gotLegend.join(' / '));
    return;
  }

  const wantLevel = body(source, 'level').split('\n').map((line) => line.trim()).filter(Boolean).sort();
  const gotLevel = body(back, 'level').split('\n').map((line) => line.trim()).filter(Boolean).sort();
  if (wantLevel.join('\n') !== gotLevel.join('\n')) {
    failed++;
    console.log('LEVEL CHANGED ' + name);
    console.log('  было  ' + wantLevel.join(' / '));
    console.log('  стало ' + gotLevel.join(' / '));
  }
}

function checkAct(file) {
  const source = read(file);
  const name = path.basename(file);
  const act = parseAct(source);

  const rooms = {};
  let cellWidth = 0;
  let cellHeight = 0;
  act.rooms.forEach((placement) => {
    if (placement.column > 0) cellWidth = cellWidth ? Math.min(cellWidth, placement.column) : placement.column;
    if (placement.row > 0) cellHeight = cellHeight ? Math.min(cellHeight, placement.row) : placement.row;
  });

  const columns = act.rooms.reduce((most, p) => Math.max(most, Math.floor(p.column / (cellWidth || 16)) + 1), 1);
  const rows = act.rooms.reduce((most, p) => Math.max(most, Math.floor(p.row / (cellHeight || 12)) + 1), 1);
  const places = new Array(columns * rows).fill(null);

  act.rooms.forEach((placement) => {
    const index = Math.floor(placement.row / (cellHeight || 12)) * columns
      + Math.floor(placement.column / (cellWidth || 16));
    places[index] = { room: placement.id, quarters: placement.quarters, isMirrored: placement.isMirrored };
    rooms[placement.id] = { path: act.library[placement.id] };
  });

  const back = actToText({
    title: act.title,
    next: act.next,
    tileset: act.tileset,
    music: act.music,
    ambient: act.ambient,
    boss: act.boss,
    columns,
    cellWidth: cellWidth || 16,
    cellHeight: cellHeight || 12,
    places,
  }, rooms);

  checked++;

  ['act', 'library', 'rooms'].forEach((section) => {
    const want = body(source, section).split('\n').map((line) => line.trim()).filter(Boolean).sort();
    const got = body(back, section).split('\n').map((line) => line.trim()).filter(Boolean).sort();
    if (want.join('\n') !== got.join('\n')) {
      failed++;
      console.log('ACT ' + section.toUpperCase() + ' CHANGED ' + name);
      console.log('  было  ' + want.join(' / '));
      console.log('  стало ' + got.join(' / '));
    }
  });
}

['Resources/Rooms', 'Resources/Levels'].forEach((folder) => {
  const full = path.join(GAME, folder);
  if (!fs.existsSync(full)) return;
  fs.readdirSync(full).filter((name) => name.endsWith('.config') && name !== 'levels.config')
    .forEach((name) => checkFile(path.join(full, name)));
});

const acts = path.join(GAME, 'Resources', 'Acts');
if (fs.existsSync(acts)) {
  fs.readdirSync(acts).filter((name) => name.endsWith('.config')).forEach((name) => checkAct(path.join(acts, name)));
}

console.log('проверено файлов: ' + checked + ', расхождений: ' + failed);
process.exit(failed ? 1 : 0);
