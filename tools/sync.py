import base64
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
DEFAULT_GAME = os.path.normpath(os.path.join(ROOT, '..', 'Roguelike'))

TILE_PREFIX = 'tiles_'
PROP_ATLASES = ['props.png', 'props_act1.png']


def Read(path):
    with io.open(path, 'rb') as source:
        return source.read()


def DataUri(path):
    return 'data:image/png;base64,' + base64.b64encode(Read(path)).decode('ascii')


def Text(path):
    with io.open(path, encoding='utf-8-sig') as source:
        return source.read().replace('\r\n', '\n')


def Blocks(text, prefix):
    blocks = []
    current = None
    for raw in text.split('\n'):
        line = raw.strip()
        if not line or line.startswith(';'):
            continue

        if line.startswith('[' + prefix + ' ') and line.endswith(']'):
            current = {'id': line[len(prefix) + 2:-1].strip(), 'fields': []}
            blocks.append(current)
            continue

        if current is not None:
            parts = line.split(None, 1)
            current['fields'].append((parts[0], parts[1] if len(parts) > 1 else ''))

    return blocks


def Field(block, key, fallback=''):
    for name, value in block['fields']:
        if name == key:
            return value

    return fallback


def Props(game):
    out = []
    for block in Blocks(Text(os.path.join(game, 'Resources', 'Props', 'props.config')), 'prop'):
        frame = Field(block, 'frame').split()
        spent = Field(block, 'spentFrame').split()
        colour = Field(block, 'color', '150 110 60').split()
        out.append({
            'id': block['id'],
            'name': Field(block, 'name', block['id']),
            'size': float(Field(block, 'size', '48')),
            'health': float(Field(block, 'health', '0')),
            'solid': Field(block, 'solid', 'true') == 'true',
            'cover': Field(block, 'cover', 'false') == 'true',
            'atlas': os.path.basename(frame[0]) if frame else '',
            'frame': [int(v) for v in frame[1:5]] if len(frame) >= 5 else None,
            'spent': [int(v) for v in spent[1:5]] if len(spent) >= 5 else None,
            'colour': [int(v) for v in colour[:3]],
        })

    return out


def Items(game):
    out = []
    for block in Blocks(Text(os.path.join(game, 'Resources', 'Items', 'items.config')), 'item'):
        effect = Field(block, 'effect').split()
        out.append({
            'id': block['id'],
            'name': Field(block, 'name', block['id']),
            'type': Field(block, 'type', 'Consumable'),
            'effect': effect[0] if effect else 'None',
            'target': effect[2] if len(effect) > 2 else '',
        })

    return out


def Enemies(game):
    text = Text(os.path.join(game, 'Enemies', 'EnemyCatalog.h'))
    out = []
    for match in re.finditer(r"\{\s*TileType::(\w+),\s*'(.)',\s*\"(\w+)\",\s*\n?\s*\{\"([^\"]+)\"", text):
        out.append({'tile': match.group(1), 'symbol': match.group(2), 'name': match.group(4)})

    return out


def Tilesets(game):
    folder = os.path.join(game, 'Resources', 'Textures')
    out = {}
    for name in sorted(os.listdir(folder)):
        if name.startswith(TILE_PREFIX) and name.endswith('.png'):
            out[name[len(TILE_PREFIX):-4]] = DataUri(os.path.join(folder, name))

    return out


def Atlases(game):
    folder = os.path.join(game, 'Resources', 'Textures')
    return {name: DataUri(os.path.join(folder, name)) for name in PROP_ATLASES
            if os.path.exists(os.path.join(folder, name))}


def Build(game):
    data = {
        'tilesets': Tilesets(game),
        'atlases': Atlases(game),
        'props': Props(game),
        'items': Items(game),
        'enemies': Enemies(game),
    }

    target = os.path.join(ROOT, 'data', 'assets.js')
    body = json.dumps(data, ensure_ascii=False, indent=1)
    with io.open(target, 'w', encoding='utf-8', newline='\n') as out:
        out.write('window.MAPPER_DATA = ' + body + ';\n')

    print('tilesets', len(data['tilesets']))
    print('prop atlases', len(data['atlases']))
    print('props', len(data['props']))
    print('items', len(data['items']))
    print('enemies', len(data['enemies']))
    print('written', target, os.path.getsize(target), 'bytes')


if __name__ == '__main__':
    Build(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_GAME)
