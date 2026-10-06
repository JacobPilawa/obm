# Anatomical bone meshes

BodyParts3D © The Database Center for Life Science, licensed under **CC Attribution 4.0 International**.

Source: https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_BP3D_4.0_obj_99.zip
Official license (updated February 27, 2025): https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README.html
License text: https://creativecommons.org/licenses/by/4.0/legalcode.en

Modified for this dashboard: bone-only selection, triangle reduction, coordinate normalization and approximate fitting to released joint centers. These generic atlas shapes are a visual aid, not subject-specific anatomy or additional measured signals. Mesh IDs and SHA-256 checksums are recorded in bones.json. Rebuild with scripts/build_bones.py (numpy and fast-simplification required only when rebuilding).

## Replacement pelvis

OpenSim GUI © 2005–2017 Stanford University and the Authors, **Apache License 2.0**.

Source revision: https://github.com/opensim-org/opensim-gui/tree/2ceb01b476e7e1a9b40fd1dfbced6eabb17bb935/Gui/opensim/labs/Curling/Geometry/

The replacement uses pelvis_l.vtp, pelvis_r.vtp and sacrum.vtp. Modified by combining these surfaces, one Loop subdivision pass, conversion to the atlas coordinate system, outer-width normalization and approximate fitting to released hip centers. Hip-origin reference: ArmCurlingFullBody.osim at the same revision. The remainder of the atlas retains BodyParts3D attribution above. Original source hashes are recorded in bones.json.

The OpenSim license and notice are preserved in OPENSIM_LICENSE.txt and OPENSIM_NOTICE.txt.
