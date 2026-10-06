"""Build a compact, attributed bone atlas from the official BodyParts3D archive.

Usage: python scripts/build_bones.py --archive /tmp/obm-bp3d.zip
Requires numpy and fast-simplification (build-time only). Source tables and archive
are from https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/.
"""
import argparse, csv, json, zipfile, hashlib, urllib.request
from pathlib import Path
from collections import defaultdict
import numpy as np
import fast_simplification
BASE = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/'
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--archive', type=Path, required=True)
p.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'assets/anatomy')
a = p.parse_args()
elements = defaultdict(list)
rows = urllib.request.urlopen(BASE + 'partof_element_parts.txt').read().decode().splitlines()
for r in csv.reader(rows, delimiter='\t'):
    if len(r) > 2:
        elements[r[1]].append(r[2])
names = [r[2] for r in csv.reader(urllib.request.urlopen(BASE + 'partof_parts_list_e.txt').read().decode().splitlines(), delimiter='\t') if len(r) > 2]
z = zipfile.ZipFile(a.archive)
files = {Path(f).stem: f for f in z.namelist() if f.endswith('.obj')}

def mesh(concepts):
    vertices = []
    triangles = []
    ids = sorted({i for name in concepts for i in elements[name]})
    for i in ids:
        offset = len(vertices)
        for line in z.read(files[i]).decode().splitlines():
            if line.startswith('v '):
                vertices.append([float(n) for n in line.split()[1:4]])
            elif line.startswith('f '):
                face = [int(n.split('/')[0]) - 1 + offset for n in line.split()[1:]]
                for j in range(1, len(face) - 1):
                    triangles.append([face[0], face[j], face[j + 1]])
    return (np.array(vertices, dtype=float), np.array(triangles, dtype=np.int32), ids)

def end_center(v, top):
    """Approximate an atlas joint anchor from its terminal slice."""
    lo, hi = (v[:, 2].min(), v[:, 2].max())
    cut = 0.06 * (hi - lo)
    band = v[v[:, 2] > hi - cut] if top else v[v[:, 2] < lo + cut]
    out = band.mean(0)
    out[2] = hi if top else lo
    return out

def normalized_segment(v):
    """Fit the atlas distal/proximal anchors to local Z=0/Z=1."""
    low, high = (end_center(v, False), end_center(v, True))
    delta = high - low
    length = np.linalg.norm(delta)
    up = delta / length
    x = np.array([1.0, 0.0, 0.0])
    x -= up * np.dot(up, x)
    x /= np.linalg.norm(x)
    y = np.cross(up, x)
    return (v - low) @ np.array([x, y, up]).T / length
parts = {}
for side in ['left', 'right']:
    title = side.capitalize()
    hand_names = [f'skeleton of {side} hand proper'] + [n for n in names if f'of {side}' in n and any((k in n for k in ['finger', 'thumb'])) and ('phalanx' in n)]
    foot_names = [n for n in names if side in n and any((k in n for k in ['talus', 'calcaneus', 'metatarsal', 'navicular bone', 'cuboid', 'cuneiform', 'phalanx'])) and (not any((k in n for k in ['finger', 'thumb', 'hand'])))]
    for key, concepts, count in [(side + 'Femur', [side + ' femur'], 2000), (side + 'Shin', [side + ' tibia', side + ' fibula'], 2000), (side + 'Humerus', [side + ' humerus'], 1600), (side + 'Forearm', [side + ' radius', side + ' ulna'], 1800), (side + 'Hand', hand_names, 2400), (side + 'Foot', foot_names, 2400)]:
        v, f, ids = mesh(concepts)
        if key.endswith('Foot'):
            # The distal tibial slice approximates the ankle attachment.
            tibia = mesh([side + ' tibia'])[0]
            origin = end_center(tibia, False)
            scale = np.ptp(v[:, 1])
            v = (v - origin) / scale
        else:
            v = normalized_segment(v)
        parts[key] = (v, f, ids, count)
for key, concepts, count in [('pelvis', ['bony pelvis'], 3500), ('chest', ['rib cage', 'thoracic vertebral column', 'left scapula', 'right scapula', 'left clavicle', 'right clavicle'], 10000), ('lumbar', ['lumbar vertebral column'], 2500), ('cervical', ['cervical vertebral column'], 1600), ('skull', ['skull'], 7000)]:
    v, f, ids = mesh(concepts)
    if key == 'pelvis':
        l = end_center(mesh(['left femur'])[0], True)
        r = end_center(mesh(['right femur'])[0], True)
        v = (v - (l + r) / 2) / np.linalg.norm(l - r)
    elif key == 'chest':
        v = (v - np.array([0, -80, 1090])) / 290
    elif key == 'skull':
        v = (v - (v.min(0) + v.max(0)) / 2) / np.ptp(v[:, 2])
    else:
        v = normalized_segment(v)
    parts[key] = (v, f, ids, count)
a.output.mkdir(parents=True, exist_ok=True)
manifest = {'source': BASE + 'partof_BP3D_4.0_obj_99.zip', 'sourceSha256': hashlib.sha256(a.archive.read_bytes()).hexdigest(), 'credit': 'BodyParts3D © The Database Center for Life Science, licensed under CC Attribution 4.0 International', 'license': 'https://creativecommons.org/licenses/by/4.0/', 'modifications': 'Bone-only selection, mesh simplification, normalization, approximate joint fitting. Generic atlas, not athlete-specific anatomy.', 'parts': {}}
binary = bytearray()
for key, (v, f, ids, target) in parts.items():
    if len(f) > target:
        v, f = fast_simplification.simplify(v, f, target_count=target)
    vb = np.asarray(v, dtype='<f4').tobytes()
    ib = np.asarray(f, dtype='<u4').tobytes()
    manifest['parts'][key] = {'positionOffset': len(binary), 'vertexCount': len(v), 'indexOffset': len(binary) + len(vb), 'indexCount': f.size, 'sourceElements': ids}
    binary += vb + ib
    print(key, len(v), 'vertices', len(f), 'triangles')
(a.output / 'bones.bin').write_bytes(binary)
manifest['meshSha256'] = hashlib.sha256(binary).hexdigest()
(a.output / 'bones.json').write_text(json.dumps(manifest, indent=2) + '\n')
(a.output / 'ATTRIBUTION.md').write_text('# Anatomical bone meshes\n\nBodyParts3D © The Database Center for Life Science, licensed under **CC Attribution 4.0 International**.\n\nSource: https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_BP3D_4.0_obj_99.zip\nOfficial license (updated February 27, 2025): https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README.html\nLicense text: https://creativecommons.org/licenses/by/4.0/legalcode.en\n\nModified for this dashboard: bone-only selection, triangle reduction, coordinate normalization and approximate fitting to released joint centers. These generic atlas shapes are a visual aid, not subject-specific anatomy or additional measured signals. Mesh IDs and SHA-256 checksums are recorded in bones.json. Rebuild with scripts/build_bones.py (numpy and fast-simplification required only when rebuilding).\n')
print('Runtime atlas bytes:', len(binary))
