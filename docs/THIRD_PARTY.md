# Source and third-party attribution

This contribution repository starts from Jacob Pilawa's active local dashboard, copied unchanged on October 6, 2026. It does not vendor the OpenBiomechanics dataset or its upstream repository. No new blanket license has been applied to the dashboard contributions.

- **OpenBiomechanics / Driveline Baseball Research & Development**: the independent dataset, conventions, and dictionaries used by this software. Follow its [data/documentation license](https://github.com/drivelineresearch/openbiomechanics/blob/main/LICENSE-DATA.md) and [code license](https://github.com/drivelineresearch/openbiomechanics/blob/main/LICENSE-CODE.md). Generated summaries and scientific analyses retain their source attribution; ignoring generated files does not change their applicable terms.
- **Three.js and OrbitControls**: bundled local browser modules. Their MIT notice is retained in `vendor/THREE-LICENSE.txt`.
- **Inter**: bundled variable font. Its SIL Open Font License is retained in `assets/fonts/Inter-OFL.txt`.
- **Playwright**: installed through npm rather than vendored; its package includes its Apache 2.0 license and third-party notices.

Unused historical fonts and reference images were moved to the ignored local archive. They remain recoverable from the baseline commit, with the original font notices.

- **BodyParts3D / The Database Center for Life Science**: anatomical bone meshes in `assets/anatomy/`, licensed under [CC Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). The official archive license was updated February 27, 2025. Bone-only selection, mesh reduction, normalization and approximate fitting are dashboard modifications; source elements and checksums are recorded in `assets/anatomy/bones.json`. The full source atlas is not bundled. See `assets/anatomy/ATTRIBUTION.md`.
