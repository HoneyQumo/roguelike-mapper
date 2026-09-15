const IMAGES = {};

function loadImages(onReady) {
  const sources = [];
  Object.keys(DATA.tilesets).forEach((name) => sources.push(['tiles:' + name, DATA.tilesets[name]]));
  Object.keys(DATA.atlases).forEach((name) => sources.push(['atlas:' + name, DATA.atlases[name]]));

  let left = sources.length;
  if (!left) { onReady(); return; }

  sources.forEach(([key, uri]) => {
    const image = new Image();
    image.onload = () => { IMAGES[key] = image; if (--left === 0) onReady(); };
    image.onerror = () => { if (--left === 0) onReady(); };
    image.src = uri;
  });
}

const MARKS = {
  spawn: ['#5fdc86', 'S'],
  entrance: ['#5fc8dc', 'V'],
  exit: ['#5fa8ff', 'E'],
  door: ['#ffab3d', 'L'],
  patrol: ['#9aa6ff', 'P'],
  watch: ['#c69aff', 'W'],
  zone: ['#6f7a8a', 'Z'],
};

function enemyColour(tile) {
  const table = {
    GruntSpawn: '#e05b4d',
    MarauderSpawn: '#e8873c',
    AssaultSpawn: '#cf4f3a',
    ShieldSpawn: '#c95697',
    HeavySpawn: '#9c3636',
    RadioSpawn: '#efc648',
    BossSpawn: '#ff3b3b',
  };
  return table[tile] || '#e05b4d';
}

function drawTileLayer(context, grid, tileset, size) {
  const sheet = IMAGES['tiles:' + tileset] || IMAGES['tiles:ruins'];

  for (let row = 0; row < grid.height; row++) {
    for (let column = 0; column < grid.width; column++) {
      const spec = grid.at(column, row);
      if (isEmptySpec(spec)) continue;

      const isWall = isWallSpec(spec);
      const frame = isWall ? wallMask(grid, column, row) % WALL_FRAMES : floorFrame(column, row);
      const sheetRow = isWall ? WALL_ROW : FLOOR_ROW;

      if (sheet) {
        context.drawImage(sheet, frame * TILE, sheetRow * TILE, TILE, TILE,
          column * size, row * size, size, size);
      } else {
        context.fillStyle = isWall ? '#5b5750' : '#2d2a27';
        context.fillRect(column * size, row * size, size, size);
      }
    }
  }
}

function drawProp(context, prop, x, y, size) {
  const sheet = IMAGES['atlas:' + prop.atlas];
  const scale = Math.max(0.35, Math.min(1, prop.size / TILE));
  const side = size * scale;
  const left = x + (size - side) / 2;
  const top = y + (size - side) / 2;

  if (sheet && prop.frame) {
    context.drawImage(sheet, prop.frame[0], prop.frame[1], prop.frame[2], prop.frame[3], left, top, side, side);
    return;
  }

  context.fillStyle = 'rgb(' + prop.colour.join(',') + ')';
  context.fillRect(left, top, side, side);
}

function drawMarker(context, x, y, size, colour, letter) {
  const radius = size * 0.34;
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, radius, 0, Math.PI * 2);
  context.fillStyle = colour;
  context.fill();
  context.lineWidth = Math.max(1, size * 0.05);
  context.strokeStyle = 'rgba(10,12,16,0.85)';
  context.stroke();

  if (letter && size >= 14) {
    context.fillStyle = '#12141a';
    context.font = 'bold ' + Math.round(size * 0.46) + 'px Segoe UI, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(letter, x + size / 2, y + size / 2 + size * 0.02);
  }
}

function drawThings(context, grid, size) {
  for (let row = 0; row < grid.height; row++) {
    for (let column = 0; column < grid.width; column++) {
      const spec = grid.at(column, row);
      if (!spec) continue;

      const x = column * size;
      const y = row * size;

      if (spec.k === 'prop') {
        const prop = PROP_BY_ID[spec.id];
        if (prop) drawProp(context, prop, x, y, size);
        else drawMarker(context, x, y, size, '#7a4a4a', '?');
        continue;
      }

      if (spec.k === 'enemy') {
        drawMarker(context, x, y, size, enemyColour(spec.id), spec.id === 'BossSpawn' ? 'B' : '');
        continue;
      }

      if (spec.k === 'item') {
        const isKey = !!unlockTargetOf(spec.id);
        drawMarker(context, x, y, size, isKey ? '#ffe45e' : '#7fe3a8', isKey ? 'K' : '');
        continue;
      }

      const mark = MARKS[spec.k];
      if (mark) drawMarker(context, x, y, size, mark[0], mark[1]);
    }
  }
}

function drawGrid(context, grid, size) {
  context.strokeStyle = 'rgba(255,255,255,0.07)';
  context.lineWidth = 1;
  for (let column = 0; column <= grid.width; column++) {
    context.beginPath();
    context.moveTo(column * size + 0.5, 0);
    context.lineTo(column * size + 0.5, grid.height * size);
    context.stroke();
  }
  for (let row = 0; row <= grid.height; row++) {
    context.beginPath();
    context.moveTo(0, row * size + 0.5);
    context.lineTo(grid.width * size, row * size + 0.5);
    context.stroke();
  }
}

function drawIssues(context, issues, size) {
  issues.forEach((issue) => {
    if (issue.column < 0) return;
    context.strokeStyle = issue.hard ? 'rgba(224,97,79,0.95)' : 'rgba(240,190,60,0.9)';
    context.lineWidth = Math.max(2, size * 0.12);
    context.strokeRect(issue.column * size + 1, issue.row * size + 1, size - 2, size - 2);
  });
}

function drawScene(canvas, grid, options) {
  const size = options.size;
  canvas.width = grid.width * size;
  canvas.height = grid.height * size;

  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.fillStyle = '#0e1013';
  context.fillRect(0, 0, canvas.width, canvas.height);

  drawTileLayer(context, grid, options.tileset, size);
  drawThings(context, grid, size);

  if (options.seams) {
    context.strokeStyle = 'rgba(255,255,255,0.28)';
    context.lineWidth = 1;
    options.seams.forEach((box) => {
      context.strokeRect(box.x * size + 0.5, box.y * size + 0.5, box.width * size - 1, box.height * size - 1);
      if (box.label && size >= 10) {
        context.fillStyle = 'rgba(255,255,255,0.75)';
        context.font = '11px Segoe UI, sans-serif';
        context.textAlign = 'left';
        context.textBaseline = 'top';
        context.fillText(box.label, box.x * size + 4, box.y * size + 3);
      }
    });
  }

  if (options.grid) drawGrid(context, grid, size);
  if (options.issues) drawIssues(context, options.issues, size);
}
