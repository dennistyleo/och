# OCH (Ontology Compliance Healthcare) Module Specification

## 1. Overview
The **OCH (Ontology Compliance Healthcare)** module provides dedicated clinical reasoning, LOINC biomarker admissibility checking, clinical risk index calculation, and hardware-accelerated FPGA evaluation within the Sovereign Matrix framework.

## 2. Hardware Architecture (RTL)
- **Module Name**: `och` (File: `fpga/rtl/och.v`)
- **Target Platform**: Xilinx Zynq UltraScale+ / Versal / 7-series FPGAs
- **Clock Domains**: `clk_100` (AXI/Control, 100 MHz), `clk_300` (Compute, 300 MHz)
- **Biomarker Channels**: 16-channel input array in Q16.16 fixed-point format:
  1. `glucose` (mg/dL)
  2. `hemoglobin` (g/dL)
  3. `creatinine` (mg/dL)
  4. `troponin` (ng/mL)
  5. `bp_systolic` (mmHg)
  6. `bp_diastolic` (mmHg)
  7. `white_blood_cell` (x10^3/uL)
  8. `platelets` (x10^3/uL)
  9. `sodium` (mEq/L)
  10. `potassium` (mEq/L)
  11. `bilirubin` (mg/dL)
  12. `alb` (g/dL)
  13. `pao2_fio2_ratio`
  14. `map_pressure` (mmHg)
  15. `gcs_score` (3..15)
  16. `urine_output` (mL/day)

### AXI4-Lite Register Map (`0x7000–0x70FF`)
| Address Offset | Register Name | Description |
|----------------|---------------|-------------|
| `0x7000` | `OCH_CTRL` | Control register (Bit 0: Enable, Bit 1: Start, Bit 2: Reset) |
| `0x7004` | `OCH_STATUS` | Status register (Bit 0: Ready, Bit 1: Valid, Bit 2: Hazard) |
| `0x7008` | `OCH_DECISION` | Decision output (2'b10: ALLOW, 2'b01: LIMIT, 2'b00: REFUSE) |
| `0x700C` | `OCH_CASTELLI_INDEX` | Q16.16 Castelli Risk Index value |
| `0x7010` | `OCH_SOFA_SCORE` | Hardware computed SOFA Organ Failure Score (0-24) |
| `0x7014..0x703F` | `OCH_BIOMARKER_0..15` | Biomarker Q16.16 input values |

## 3. Software Architecture (Python)
- **Class**: `OCHEngine` in `modules/och.py`
- **BUS Events**:
  - `och:request`: Accepts clinical audit payload.
  - `ontology_medical:request`: Legacy alias mapped to `och:request`.
  - `OCH_CLASSIFIED`: Emitted upon ontology classification.
  - `SYMPY_EVAL_COMPLETE`: Emitted when SymPy calculation finishes.
  - `PHASE_GATE_RESULT`: Emitted on L3 phase-gate evaluation.
  - `REPORT_READY`: Emitted when final OAR audit packet is ready.

## 4. Error Codes
- `E001`: Clinical API / LOINC Reference Data Not Found
- `E002`: SymPy Evaluation Timeout
- `E003`: Invalid Clinical JSON Payload
- `E004`: Schema Validation Failure
- `E007`: Causal / Surgical Audit Pipeline Error
