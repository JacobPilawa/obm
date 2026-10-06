# Anatomical bone display

Added October 6, 2026 to the canonical external-drive dashboard.

Body display → Anatomical bones enables a BodyParts3D mesh atlas for processed hitting and pitching recordings, including both handednesses. Meshes are fitted to the released joint centers; missing joints hide affected parts. The pelvis, ribs/scapulae/clavicles, cervical/lumbar spine, skull, humeri, radius/ulna pairs, femurs, tibia/fibula pairs, hands and feet use generic anatomical shapes. Skull and feet use raw markers when available. Transverse orientation, hands and shapes remain approximate.

The 1,057,620-byte binary atlas and 7.6 KB metadata load only when the option is activated. These are fixed model assets; recordings are not preloaded. Disabling the option preserves the existing display, and switching trials disposes the previous GPU resources. The option remains off by default. The source dataset and scientific outputs are unchanged.

Validation: the 12 existing browser checks passed, plus seven bone-specific checks for on-demand assets, solo pitching/hitting, bone-only display, matched comparison, split view, movie preparation, left-handed fitting, missing samples and disposal. Seven extended checks passed, including Full body settings and a complete 78-frame H.264/yuv420p split-comparison movie with anatomical bones and floating charts at 60 fps. Three numerical unit tests and formatting checks passed.

Runtime mesh checksums, original element IDs and atlas checksum are in `assets/anatomy/bones.json`. Source and licensing are in `assets/anatomy/ATTRIBUTION.md`; the official archive license is CC Attribution 4.0 International. The builder uses numpy and fast-simplification 0.1.13, with build-only requirements in `scripts/requirements-bones.txt`. Download the official archive to temporary storage, then run `python scripts/build_bones.py --archive /path/to/partof_BP3D_4.0_obj_99.zip`. The full atlas and build tool are not shipped as dashboard runtime dependencies.
