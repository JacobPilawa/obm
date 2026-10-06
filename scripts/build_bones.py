"""Build a compact, attributed bone atlas from the official BodyParts3D archive.

Usage: python scripts/build_bones.py --archive /tmp/obm-bp3d.zip
Requires numpy and fast-simplification (build-time only). Source tables and archive
are from https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/.
"""
import argparse, csv, json, zipfile, hashlib, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from collections import defaultdict
import numpy as np
import fast_simplification
OPENSIM_REVISION = '2ceb01b476e7e1a9b40fd1dfbced6eabb17bb935'
OPENSIM_BASE = f'https://raw.githubusercontent.com/opensim-org/opensim-gui/{OPENSIM_REVISION}/'
OPENSIM_GEOMETRY = 'Gui/opensim/labs/Curling/Geometry/'
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
def smooth_once(vertices, faces):
    """One Loop subdivision pass softens the low-resolution source surface."""
    edges = defaultdict(list)
    neighbors = defaultdict(set)
    for triangle in faces:
        for i in range(3):
            u, v, opposite = map(int, (triangle[i], triangle[(i + 1) % 3], triangle[(i + 2) % 3]))
            edges[tuple(sorted((u, v)))].append(opposite)
            neighbors[u].add(v)
            neighbors[v].add(u)
    boundary = defaultdict(set)
    for (u, v), opposite in edges.items():
        if len(opposite) == 1:
            boundary[u].add(v)
            boundary[v].add(u)
    updated = vertices.copy()
    for i, adjacent in neighbors.items():
        if len(boundary[i]) == 2:
            updated[i] = 0.75 * vertices[i] + 0.125 * vertices[list(boundary[i])].sum(0)
        elif not boundary[i] and len(adjacent) >= 3:
            n = len(adjacent)
            beta = (0.625 - (0.375 + 0.25 * np.cos(2 * np.pi / n)) ** 2) / n
            updated[i] = (1 - n * beta) * vertices[i] + beta * vertices[list(adjacent)].sum(0)
    out = list(updated)
    indices = {}
    for edge, opposite in sorted(edges.items()):
        u, v = edge
        point = ((3 * (vertices[u] + vertices[v]) + vertices[opposite].sum(0)) / 8
                 if len(opposite) == 2 else (vertices[u] + vertices[v]) / 2)
        indices[edge] = len(out)
        out.append(point)
    triangles = []
    for u, v, w in faces:
        uv, vw, wu = (indices[tuple(sorted(e))] for e in [(u, v), (v, w), (w, u)])
        triangles.extend([(u, uv, wu), (v, vw, uv), (w, wu, vw), (uv, vw, wu)])
    return np.asarray(out), np.asarray(triangles, dtype=np.int32)


def opensim_pelvis():
    vertices, triangles, sources = [], [], []
    for name in ['pelvis_l.vtp', 'pelvis_r.vtp', 'sacrum.vtp']:
        url = OPENSIM_BASE + OPENSIM_GEOMETRY + name
        source = urllib.request.urlopen(url).read()
        sources.append({'url': url, 'sha256': hashlib.sha256(source).hexdigest()})
        tree = ET.fromstring(source)
        offset = len(vertices)
        points = np.fromstring(tree.find('.//Points/DataArray').text, sep=' ').reshape(-1, 3)
        vertices.extend(points)
        cells = {item.get('Name'): np.fromstring(item.text, sep=' ', dtype=np.int32)
                 for item in tree.findall('.//Polys/DataArray')}
        start = 0
        for stop in cells['offsets']:
            face = cells['connectivity'][start:stop] + offset
            for i in range(1, len(face) - 1):
                triangles.append([face[0], face[i], face[i + 1]])
            start = stop
    v, f = smooth_once(np.asarray(vertices), np.asarray(triangles, dtype=np.int32))
    # OpenSim X=anterior, Y=superior, Z=right; atlas X=left, Y=posterior, Z=superior.
    # Origin is the midpoint of hip joint locations in ArmCurlingFullBody.osim.
    v -= np.array([-0.0707, -0.0661, 0])
    v = np.column_stack((-v[:, 2], -v[:, 0], v[:, 1]))
    # Outer width is a presentation convention, rather than extrapolating bone size
    # from an approximate femoral-head spacing. Released hip anchors are unchanged.
    v /= np.ptp(v[:, 0])
    return v, f, sources


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
    if key == 'pelvis':
        v, f, pelvis_sources = opensim_pelvis()
        ids = []
    else:
        v, f, ids = mesh(concepts)
    if key == 'chest':
        v = (v - np.array([0, -80, 1090])) / 290
    elif key == 'skull':
        v = (v - (v.min(0) + v.max(0)) / 2) / np.ptp(v[:, 2])
    elif key != 'pelvis':
        v = normalized_segment(v)
    parts[key] = (v, f, ids, count)
# One generic finger bone is reused in the illustrative hitter grip renderer.
v, f, ids = mesh(['proximal phalanx of right middle finger'])
parts['gripPhalanx'] = (normalized_segment(v), f, ids, 300)
a.output.mkdir(parents=True, exist_ok=True)
manifest = {'pelvisSource': {'project': 'OpenSim GUI', 'revision': OPENSIM_REVISION, 'license': 'Apache-2.0', 'files': pelvis_sources, 'modifications': 'Pelvis and sacrum combined; one Loop subdivision pass; coordinate conversion; outer-width normalization and approximate hip-origin fitting.'}, 'source': BASE + 'partof_BP3D_4.0_obj_99.zip', 'sourceSha256': hashlib.sha256(a.archive.read_bytes()).hexdigest(), 'credit': 'BodyParts3D © The Database Center for Life Science, licensed under CC Attribution 4.0 International', 'license': 'https://creativecommons.org/licenses/by/4.0/', 'modifications': 'Bone-only selection, mesh simplification, normalization, approximate joint fitting. Generic atlas, not athlete-specific anatomy.', 'parts': {}}
binary = bytearray()
for key, (v, f, ids, target) in parts.items():
    if len(f) > target:
        v, f = fast_simplification.simplify(v, f, target_count=target)
    vb = np.asarray(v, dtype='<f4').tobytes()
    ib = np.asarray(f, dtype='<u4').tobytes()
    manifest['parts'][key] = {'positionOffset': len(binary), 'vertexCount': len(v), 'indexOffset': len(binary) + len(vb), 'indexCount': f.size, 'sourceElements': ids}
    if key == 'pelvis':
        manifest['parts'][key]['source'] = 'pelvisSource'
        manifest['parts'][key]['widthConvention'] = 'outer-width-equals-released-hip-spacing'
    binary += vb + ib
    print(key, len(v), 'vertices', len(f), 'triangles')
(a.output / 'bones.bin').write_bytes(binary)
manifest['meshSha256'] = hashlib.sha256(binary).hexdigest()
(a.output / 'bones.json').write_text(json.dumps(manifest, indent=2) + '\n')
(a.output / 'ATTRIBUTION.md').write_text('# Anatomical bone meshes\n\nBodyParts3D © The Database Center for Life Science, licensed under **CC Attribution 4.0 International**.\n\nSource: https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_BP3D_4.0_obj_99.zip\nOfficial license (updated February 27, 2025): https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README.html\nLicense text: https://creativecommons.org/licenses/by/4.0/legalcode.en\n\nModified for this dashboard: bone-only selection, triangle reduction, coordinate normalization and approximate fitting to released joint centers. These generic atlas shapes are a visual aid, not subject-specific anatomy or additional measured signals. Mesh IDs and SHA-256 checksums are recorded in bones.json. Rebuild with scripts/build_bones.py (numpy and fast-simplification required only when rebuilding).\n')
with (a.output / 'ATTRIBUTION.md').open('a') as attribution:
    attribution.write(f'\n## Replacement pelvis\n\nOpenSim GUI © 2005–2017 Stanford University and the Authors, **Apache License 2.0**.\n\nSource revision: https://github.com/opensim-org/opensim-gui/tree/{OPENSIM_REVISION}/{OPENSIM_GEOMETRY}\n\nThe replacement uses pelvis_l.vtp, pelvis_r.vtp and sacrum.vtp. Modified by combining these surfaces, one Loop subdivision pass, conversion to the atlas coordinate system, outer-width normalization and approximate fitting to released hip centers. Hip-origin reference: ArmCurlingFullBody.osim at the same revision. The remainder of the atlas retains BodyParts3D attribution above. Original source hashes are recorded in bones.json.\n\nThe OpenSim license and notice are preserved in OPENSIM_LICENSE.txt and OPENSIM_NOTICE.txt.\n')
for source_name, output_name in [('LICENSE.txt', 'OPENSIM_LICENSE.txt'), ('NOTICE.txt', 'OPENSIM_NOTICE.txt')]:
    (a.output / output_name).write_bytes(urllib.request.urlopen(OPENSIM_BASE + source_name).read())
with (a.output / 'ATTRIBUTION.md').open('a') as attribution:
    attribution.write('\n## Illustrative hitter grip\n\nThe proximal phalanx of the right middle finger is additionally reused as a generic finger/metacarpal surface. Runtime finger curling and procedural carpal shapes are an artistic grip pose around the bat, not measured or reconstructed finger motion. Released wrist and hand anchors are unchanged.\n')
print('Runtime atlas bytes:', len(binary))
