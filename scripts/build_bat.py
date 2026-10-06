"""Build a lightweight Poly Haven CC0 bat from its verified 1K glTF release."""
import argparse
import hashlib
import json
import struct
import urllib.request
from pathlib import Path

API = 'https://api.polyhaven.com/files/baseball_bat'
SOURCE = 'https://polyhaven.com/a/baseball_bat'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-directory', type=Path, help='Existing files downloaded from the official 1K release')
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'assets/bat')
args = parser.parse_args()
request = urllib.request.Request(API, headers={'User-Agent': 'OBM dashboard asset builder'})
release = json.load(urllib.request.urlopen(request))['gltf']['1k']['gltf']
sources = []

def read(name, item):
    data = ((args.source_directory / name).read_bytes() if args.source_directory
            else urllib.request.urlopen(item['url']).read())
    if hashlib.md5(data).hexdigest() != item['md5']:
        raise ValueError(f'Source checksum mismatch: {name}')
    sources.append({'file': name, 'url': item['url'], 'sha256': hashlib.sha256(data).hexdigest()})
    return data

model = json.loads(read('bat.gltf', release))
includes = release['include']
buffer = read('baseball_bat.bin', includes['baseball_bat.bin'])
primitive = model['meshes'][0]['primitives'][0]

def values(index):
    accessor = model['accessors'][index]
    view = model['bufferViews'][accessor['bufferView']]
    count = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[accessor['type']]
    kind = {5123: 'H', 5126: 'f'}[accessor['componentType']]
    stride = view.get('byteStride', struct.calcsize('<' + kind * count))
    offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    return [struct.unpack_from('<' + kind * count, buffer, offset + i * stride)
            for i in range(accessor['count'])]

positions = values(primitive['attributes']['POSITION'])
normals = values(primitive['attributes']['NORMAL'])
uv = values(primitive['attributes']['TEXCOORD_0'])
indices = [row[0] for row in values(primitive['indices'])]
lo = min(p[2] for p in positions)
hi = max(p[2] for p in positions)
length = hi - lo
center = [(min(p[i] for p in positions) + max(p[i] for p in positions)) / 2 for i in range(2)]
# Source +Z points toward the knob. Turn the bat so +Y runs knob→barrel.
positions = [((x - center[0]) / length, (hi - z) / length, (y - center[1]) / length)
             for x, y, z in positions]
normals = [(x, -z, y) for x, y, z in normals]
binary = bytearray()
attributes = {}
for name, data, count, kind in [('position', positions, 3, 'f'), ('normal', normals, 3, 'f'),
                                 ('uv', uv, 2, 'f'), ('index', [(i,) for i in indices], 1, 'H')]:
    attributes[name] = {'offset': len(binary), 'count': len(data), 'components': count, 'type': 'Float32' if kind == 'f' else 'Uint16'}
    for row in data:
        binary.extend(struct.pack('<' + kind * count, *row))
args.output.mkdir(parents=True, exist_ok=True)
textures = {}
for name, source_name in [('diffuse', 'baseball_bat_diff_1k.jpg'), ('normal', 'baseball_bat_nor_gl_1k.jpg'), ('arm', 'baseball_bat_arm_1k.jpg')]:
    (args.output / f'{name}.jpg').write_bytes(read(source_name, includes['textures/' + source_name]))
    textures[name] = f'{name}.jpg'
(args.output / 'bat.bin').write_bytes(binary)
manifest = {'source': SOURCE, 'author': 'Enrique Martín / Poly Haven', 'license': 'CC0-1.0',
            'sourceLengthMeters': length, 'triangles': len(indices) // 3,
            'modifications': 'Converted glTF attributes to compact buffers, normalized length and coordinates; textures unchanged at 1K.',
            'sources': sources, 'meshSha256': hashlib.sha256(binary).hexdigest(),
            'attributes': attributes, 'textures': textures}
(args.output / 'bat.json').write_text(json.dumps(manifest, indent=2) + '\n')
(args.output / 'ATTRIBUTION.md').write_text(f'''# Baseball bat model

**Baseball Bat**, Enrique Martín / Poly Haven, **CC0 1.0 Universal**.

- Asset: {SOURCE}
- License: https://polyhaven.com/license
- CC0 legal text: https://creativecommons.org/publicdomain/zero/1.0/legalcode.en

The 1K glTF geometry has been converted to compact buffers with unit length and +Y pointing from knob to barrel. Geometry and UVs are retained; 1K diffuse, normal and packed occlusion/roughness/metalness textures are unchanged. Source URLs and SHA-256 hashes are in bat.json. Rebuild with `python scripts/build_bat.py`; no additional build dependencies are needed.

The displayed prop is a generic bat. Released handle and sweet-spot positions set its axis. Declared bat length sets its length when available; the generic sweet spot is placed at 82% of model length and the handle offset follows from the measured separation. Missing/unsuitable length uses a generic proportion. The roll around the bat axis, wood finish and shape are illustrative. No measured landmarks, speed calculations, contact events or bat sweeps are altered.
''')
print('Bat:', len(indices) // 3, 'triangles; geometry:', len(binary), 'bytes; textures:', sum((args.output / f).stat().st_size for f in textures.values()), 'bytes')
