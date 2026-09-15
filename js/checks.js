function regionsOf(grid) {
  const seen = new Grid(grid.width, grid.height, () => 0);
  const regions = [];

  for (let row = 0; row < grid.height; row++) {
    for (let column = 0; column < grid.width; column++) {
      if (seen.at(column, row) || !isWalkableSpec(grid.at(column, row))) continue;

      const cells = [];
      const wave = [[column, row]];
      seen.set(column, row, 1);

      while (wave.length) {
        const [c, r] = wave.pop();
        cells.push([c, r]);

        [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dc, dr]) => {
          const nc = c + dc;
          const nr = r + dr;
          if (!grid.inside(nc, nr) || seen.at(nc, nr)) return;
          if (!isWalkableSpec(grid.at(nc, nr))) return;
          seen.set(nc, nr, 1);
          wave.push([nc, nr]);
        });
      }

      regions.push(cells);
    }
  }

  return regions;
}

function walk(grid, start, opened) {
  const seen = new Grid(grid.width, grid.height, () => 0);
  const wave = [start];
  seen.set(start[0], start[1], 1);

  while (wave.length) {
    const [c, r] = wave.pop();
    [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dc, dr]) => {
      const nc = c + dc;
      const nr = r + dr;
      if (!grid.inside(nc, nr) || seen.at(nc, nr)) return;

      const spec = grid.at(nc, nr);
      if (!isWalkableSpec(spec)) return;
      if (isGateSpec(spec) && !opened.has(spec.id)) return;

      seen.set(nc, nr, 1);
      wave.push([nc, nr]);
    });
  }

  return seen;
}

function cellsOfKind(grid, kind) {
  const found = [];
  for (let row = 0; row < grid.height; row++) {
    for (let column = 0; column < grid.width; column++) {
      const spec = grid.at(column, row);
      if (spec && spec.k === kind) found.push([column, row, spec]);
    }
  }
  return found;
}

function checkRoom(grid) {
  const issues = [];
  const regions = regionsOf(grid);

  if (regions.length > 1) {
    const sorted = regions.slice().sort((a, b) => b.length - a.length);
    sorted.slice(1).forEach((region) => {
      region.forEach(([column, row]) => {
        issues.push({ text: 'кусок отрезан от остального', column, row, hard: true });
      });
    });
  }

  for (let row = 0; row < grid.height; row++) {
    for (let column = 0; column < grid.width; column++) {
      const spec = grid.at(column, row);
      if (!spec) continue;
      if (spec.k === 'prop' && !PROP_BY_ID[spec.id]) {
        issues.push({ text: 'нет такого объекта: ' + spec.id, column, row, hard: true });
      }
      if (spec.k === 'item' && !ITEM_BY_ID[spec.id]) {
        issues.push({ text: 'нет такого предмета: ' + spec.id, column, row, hard: true });
      }
    }
  }

  return issues;
}

function checkMap(grid) {
  const issues = [];

  const entrances = cellsOfKind(grid, 'entrance');
  const spawns = cellsOfKind(grid, 'spawn');
  const starts = entrances.length ? entrances : spawns;

  for (let column = 0; column < grid.width; column++) {
    [0, grid.height - 1].forEach((row) => {
      const spec = grid.at(column, row);
      if (isWalkableSpec(spec)) issues.push({ text: 'дыра в границе', column, row, hard: true });
    });
  }
  for (let row = 1; row < grid.height - 1; row++) {
    [0, grid.width - 1].forEach((column) => {
      const spec = grid.at(column, row);
      if (isWalkableSpec(spec)) issues.push({ text: 'дыра в границе', column, row, hard: true });
    });
  }

  if (!starts.length) {
    issues.push({ text: 'нет точки старта', column: -1, row: -1, hard: true });
    return issues;
  }

  if (starts.length > 1) {
    starts.slice(1).forEach(([column, row]) => {
      issues.push({ text: 'вторая точка старта', column, row, hard: true });
    });
  }

  const start = [starts[0][0], starts[0][1]];
  const opened = new Set();
  let reached = walk(grid, start, opened);

  for (;;) {
    const next = new Set();
    cellsOfKind(grid, 'item').forEach(([column, row, spec]) => {
      if (!reached.at(column, row)) return;
      const target = unlockTargetOf(spec.id);
      if (target) next.add(target);
    });

    if (next.size === opened.size) break;
    next.forEach((id) => opened.add(id));
    reached = walk(grid, start, opened);
  }

  const reportedDoors = new Set();
  cellsOfKind(grid, 'door').forEach(([column, row, spec]) => {
    if (opened.has(spec.id) || reportedDoors.has(spec.id)) return;

    const touches = [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dc, dr]) => !!reached.at(column + dc, row + dr));
    if (!touches) return;

    reportedDoors.add(spec.id);
    issues.push({ text: 'дверь ' + spec.id + ' - ключа к ней не достать', column, row, hard: true });
  });

  for (let row = 0; row < grid.height; row++) {
    for (let column = 0; column < grid.width; column++) {
      const spec = grid.at(column, row);
      if (!isWalkableSpec(spec) || isGateSpec(spec)) continue;
      if (!reached.at(column, row)) issues.push({ text: 'сюда не дойти', column, row, hard: true });
    }
  }

  const exits = cellsOfKind(grid, 'exit');
  if (!exits.length) issues.push({ text: 'нет выхода', column: -1, row: -1, hard: false });
  exits.forEach(([column, row]) => {
    if (!reached.at(column, row)) issues.push({ text: 'до выхода не дойти', column, row, hard: true });
  });

  return issues.concat(checkRoom(grid).filter((issue) => issue.text.startsWith('нет такого')));
}

function checkSeams(places, rooms, columns) {
  const issues = [];

  places.forEach((place, index) => {
    if (!place) return;
    const room = rooms[place.room];
    if (!room) return;

    const column = index % columns;
    const row = Math.floor(index / columns);
    const width = room.grid.width;
    const height = room.grid.height;

    const rightIndex = column + 1 < columns ? index + 1 : -1;
    const right = rightIndex >= 0 ? places[rightIndex] : null;
    if (right && rooms[right.room]) {
      const other = rooms[right.room];
      for (let line = 0; line < Math.min(height, other.grid.height); line++) {
        const mine = isWalkableSpec(room.grid.at(width - 1, line));
        const theirs = isWalkableSpec(other.grid.at(0, line));
        if (mine !== theirs) {
          issues.push({
            text: place.room + ' и ' + right.room + ' не сходятся по строке ' + line,
            column: column * width + width - 1,
            row: row * height + line,
            hard: true,
          });
        }
      }
    }

    const belowIndex = index + columns;
    const below = belowIndex < places.length ? places[belowIndex] : null;
    if (below && rooms[below.room]) {
      const other = rooms[below.room];
      for (let line = 0; line < Math.min(width, other.grid.width); line++) {
        const mine = isWalkableSpec(room.grid.at(line, height - 1));
        const theirs = isWalkableSpec(other.grid.at(line, 0));
        if (mine !== theirs) {
          issues.push({
            text: place.room + ' и ' + below.room + ' не сходятся по столбцу ' + line,
            column: column * width + line,
            row: row * height + height - 1,
            hard: true,
          });
        }
      }
    }
  });

  return issues;
}
