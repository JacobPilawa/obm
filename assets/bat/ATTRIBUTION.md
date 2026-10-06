# Baseball bat model

**Baseball Bat**, Enrique Martín / Poly Haven, **CC0 1.0 Universal**.

- Asset: https://polyhaven.com/a/baseball_bat
- License: https://polyhaven.com/license
- CC0 legal text: https://creativecommons.org/publicdomain/zero/1.0/legalcode.en

The 1K glTF geometry has been converted to compact buffers with unit length and +Y pointing from knob to barrel. Geometry and UVs are retained; 1K diffuse, normal and packed occlusion/roughness/metalness textures are unchanged. Source URLs and SHA-256 hashes are in bat.json. Rebuild with `python scripts/build_bat.py`; no additional build dependencies are needed.

The displayed prop is a generic bat. Released handle and sweet-spot positions set its axis. Declared bat length sets its length when available; the generic sweet spot is placed at 82% of model length and the handle offset follows from the measured separation. Missing/unsuitable length uses a generic proportion. The roll around the bat axis, wood finish and shape are illustrative. No measured landmarks, speed calculations, contact events or bat sweeps are altered.
