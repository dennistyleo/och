# OCH (Ontology Compliance Healthcare)

Dedicated single-purposed service for **Ontology Compliance Healthcare (OCH)** — deterministic AI compliance for clinical biomarkers, LOINC reference standards, Castelli Risk Indexing, SOFA Organ Failure scoring, and pre-surgery intelligence.

## Features
- **Deterministic SymPy Verification**: Zero-hallucination evaluation of 16-channel Q16.16 clinical biomarkers.
- **Hardware FPGA Acceleration**: Synthesizable Verilog RTL (`och.v`) with AXI4-Lite register mapping (`0x7000–0x70FF`).
- **AlphaFold Target Mapping**: 3D protein structure mapping & clinical drug interaction enrichment.
- **GCP Cloud Run Ready**: Multi-threaded Gunicorn server configured for custom domain mapping (`och.aichipco.com`).

## Architecture
- `app.py`: Flask/Gunicorn production web server & API router.
- `modules/och.py`: Core `OCHEngine` orchestrator.
- `fpga/rtl/och.v`: Verilog RTL hardware engine.
- `static/index.html`: Standalone OCH glassmorphic dashboard UI.
- `spec/31_och.md`: System specification.
