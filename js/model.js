const DATA = window.MAPPER_DATA;

const TILE = 64;
const FLOOR_ROW = 0;
const WALL_ROW = 1;
const FLOOR_FRAMES = 4;
const WALL_FRAMES = 16;

const WALL = { k: 'wall' };
const FLOOR = { k: 'floor' };
const EMPTY = { k: 'empty' };

const DEFAULT_TILESET = 'ruins';

const FIXED_SYMBOLS = {
  wall: '#',
  floor: '.',
  spawn: '@',
  entrance: '<',
  exit: '>',
  empty: ' ',
};

const TILE_NAMES = {
  wall: 'Wall',
  floor: 'Floor',
  spawn: 'PlayerSpawn',
  entrance: 'Entrance',
  exit: 'Exit',
  empty: 'Empty',
};

const PREFIXES = {
  item: 'Item:',
  prop: 'Prop:',
  door: 'Door:',
  patrol: 'Patrol:',
  watch: 'Watch:',
  zone: 'Zone:',
};

const SYMBOL_POOL = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+=*-';

function keyOf(spec) {
  if (!spec) return 'empty';
  const step = spec.n === undefined || spec.n === null ? '' : '#' + spec.n;
  return spec.k + (spec.id ? ':' + spec.id : '') + step;
}

function isStopSpec(spec) {
  return !!spec && (spec.k === 'patrol' || spec.k === 'watch');
}

function sameSpec(a, b) {
  return keyOf(a) === keyOf(b);
}

function isWallSpec(spec) {
  return !!spec && spec.k === 'wall';
}

function isEmptySpec(spec) {
  return !spec || spec.k === 'empty';
}

function isGateSpec(spec) {
  return !!spec && spec.k === 'door';
}

function isWalkableSpec(spec) {
  return !isEmptySpec(spec) && !isWallSpec(spec);
}

function tileHash(column, row) {
  let value = (Math.imul(column >>> 0, 374761393) + Math.imul(row >>> 0, 668265263)) >>> 0;
  value = (value ^ (value >>> 13)) >>> 0;
  value = Math.imul(value, 1274126177) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return value;
}

function floorFrame(column, row) {
  return tileHash(column, row) % FLOOR_FRAMES;
}

function wallMask(grid, column, row) {
  const wallAt = (c, r) => {
    const cell = grid.at(c, r);
    return cell === undefined ? true : isWallSpec(cell);
  };

  return (wallAt(column, row - 1) ? 1 : 0)
    | (wallAt(column + 1, row) ? 2 : 0)
    | (wallAt(column, row + 1) ? 4 : 0)
    | (wallAt(column - 1, row) ? 8 : 0);
}

class Grid {
  constructor(width, height, fill) {
    this.width = width;
    this.height = height;
    this.cells = [];
    for (let row = 0; row < height; row++) {
      const line = [];
      for (let column = 0; column < width; column++) line.push(fill ? fill(column, row) : null);
      this.cells.push(line);
    }
  }

  inside(column, row) {
    return column >= 0 && row >= 0 && column < this.width && row < this.height;
  }

  at(column, row) {
    if (!this.inside(column, row)) return undefined;
    return this.cells[row][column];
  }

  set(column, row, spec) {
    if (!this.inside(column, row)) return;
    this.cells[row][column] = spec;
  }

  resize(width, height) {
    const next = new Grid(width, height, () => null);
    for (let row = 0; row < Math.min(height, this.height); row++) {
      for (let column = 0; column < Math.min(width, this.width); column++) {
        next.cells[row][column] = this.cells[row][column];
      }
    }
    this.width = width;
    this.height = height;
    this.cells = next.cells;
  }

  clone() {
    const copy = new Grid(this.width, this.height, () => null);
    for (let row = 0; row < this.height; row++) {
      for (let column = 0; column < this.width; column++) copy.cells[row][column] = this.cells[row][column];
    }
    return copy;
  }
}

function blankRoom(width, height, name) {
  const grid = new Grid(width, height, (column, row) => {
    const isBorder = column === 0 || row === 0 || column === width - 1 || row === height - 1;
    return isBorder ? WALL : FLOOR;
  });

  return { name: name || 'room', info: {}, kind: '', tileset: 'prison', grid, symbols: {}, stops: 0 };
}

const PROP_BY_ID = {};
DATA.props.forEach((prop) => { PROP_BY_ID[prop.id] = prop; });

const ITEM_BY_ID = {};
DATA.items.forEach((item) => { ITEM_BY_ID[item.id] = item; });

const ENEMY_BY_TILE = {};
DATA.enemies.forEach((enemy) => { ENEMY_BY_TILE[enemy.tile] = enemy; });

function unlockTargetOf(itemId) {
  const item = ITEM_BY_ID[itemId];
  return item && item.effect === 'Unlock' ? item.target : '';
}
