// =============================================================================
// Module  : och.v  | Version: 1.0.0
// Project : Sovereign Matrix — OCH (Ontology Compliance Healthcare)
// Purpose : Dedicated hardware accelerator engine for clinical biomarker 
//           admissibility, LOINC threshold verification, Castelli risk index, 
//           SOFA organ failure scoring, and hardware decision gating.
// Language: Pure Verilog-2001
// =============================================================================
`timescale 1ns/1ps
`default_nettype none

module och #(
    parameter NUM_BIOMARKERS = 16,
    parameter DATA_WIDTH     = 32, // Q16.16 Fixed Point
    parameter ADDR_WIDTH     = 8
)(
    input  wire clk,
    input  wire rst_n,
    
    // Control & Enable
    input  wire        start,
    input  wire        enable,
    
    // Biomarker Data Input Array (16 x 32-bit Q16.16)
    // 0: Glucose, 1: Hemoglobin, 2: Creatinine, 3: Troponin
    // 4: BP_Systolic, 5: BP_Diastolic, 6: WBC, 7: Platelets
    // 8: Sodium, 9: Potassium, 10: Bilirubin, 11: Albumin
    // 12: PaO2/FiO2, 13: MAP, 14: GCS, 15: Urine Output
    input  wire [NUM_BIOMARKERS*DATA_WIDTH-1:0] biomarkers_flat,
    input  wire [NUM_BIOMARKERS-1:0]           biomarkers_valid,

    // Status & Decision Outputs
    output reg                     busy,
    output reg                     valid,
    output reg  [1:0]              decision,      // 2'b10: ALLOW, 2'b01: LIMIT, 2'b00: REFUSE
    output reg  [DATA_WIDTH-1:0]   castelli_index, // Q16.16
    output reg  [7:0]              sofa_score,     // 0 .. 24
    output reg                     hazard_flag,
    output reg                     irq_out
);

    // ── Decision Encoding Constants ───────────────────────────────────────────
    localparam DEC_REFUSE = 2'b00;
    localparam DEC_LIMIT  = 2'b01;
    localparam DEC_ALLOW  = 2'b10;

    // Q16.16 Constants
    localparam ONE_Q16    = 32'h0001_0000; // 1.0 in Q16.16

    // LOINC / Clinical Reference Thresholds (Q16.16)
    // Glucose Normal Max: 140 mg/dL -> 140 << 16 = 32'h008C_0000
    localparam THRESH_GLUCOSE_MAX    = 32'h008C_0000; 
    // Creatinine Normal Max: 1.5 mg/dL -> 1.5 * 65536 = 98304 = 32'h0001_8000
    localparam THRESH_CREATININE_MAX = 32'h0001_8000;
    // Troponin Normal Max: 0.04 ng/mL -> 0.04 * 65536 = 2621 = 32'h0000_0A3D
    localparam THRESH_TROPONIN_MAX   = 32'h0000_0A3D;
    // BP Systolic Max: 180 mmHg (Hypertensive Crisis) -> 180 << 16 = 32'h00B4_0000
    localparam THRESH_BP_SYS_MAX     = 32'h00B4_0000;

    // ── Internal Unpacked Biomarkers ─────────────────────────────────────────
    wire [DATA_WIDTH-1:0] bm [0:NUM_BIOMARKERS-1];
    genvar i;
    generate
        for (i = 0; i < NUM_BIOMARKERS; i = i + 1) begin : unpack_bm
            assign bm[i] = biomarkers_flat[i*DATA_WIDTH +: DATA_WIDTH];
        end
    endgenerate

    // ── Intermediate Evaluation Signals ──────────────────────────────────────
    reg [3:0]  viol_count;
    reg [7:0]  computed_sofa;
    reg [31:0] computed_castelli;

    // ── FSM States ───────────────────────────────────────────────────────────
    localparam STATE_IDLE  = 2'b00;
    localparam STATE_EVAL  = 2'b01;
    localparam STATE_DONE  = 2'b10;

    reg [1:0] state;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state           <= STATE_IDLE;
            busy            <= 1'b0;
            valid           <= 1'b0;
            decision        <= DEC_ALLOW;
            castelli_index  <= 32'h0;
            sofa_score      <= 8'h0;
            hazard_flag     <= 1'b0;
            irq_out         <= 1'b0;
            viol_count      <= 4'h0;
            computed_sofa   <= 8'h0;
            computed_castelli <= 32'h0;
        end else begin
            irq_out <= 1'b0; // Pulse output

            case (state)
                STATE_IDLE: begin
                    valid <= 1'b0;
                    if (enable && start) begin
                        state <= STATE_EVAL;
                        busy  <= 1'b1;
                    end
                end

                STATE_EVAL: begin
                    // 1. LOINC Clinical Biomarker Threshold Checks
                    viol_count <= 4'h0;
                    hazard_flag <= 1'b0;

                    if (bm[0] > THRESH_GLUCOSE_MAX)    viol_count <= viol_count + 1'b1;
                    if (bm[2] > THRESH_CREATININE_MAX) viol_count <= viol_count + 1'b1;
                    if (bm[3] > THRESH_TROPONIN_MAX)   begin
                        viol_count  <= viol_count + 2'd2;
                        hazard_flag <= 1'b1; // Severe cardiac alert
                    end
                    if (bm[4] > THRESH_BP_SYS_MAX)     viol_count <= viol_count + 1'b1;

                    // 2. Hardware SOFA Score Accumulation (Simplified Organ Failure Index)
                    computed_sofa <= 8'h0;
                    if (bm[2] > THRESH_CREATININE_MAX) computed_sofa <= computed_sofa + 8'd2; // Renal
                    if (bm[3] > THRESH_TROPONIN_MAX)   computed_sofa <= computed_sofa + 8'd3; // Cardiovascular
                    if (bm[4] > THRESH_BP_SYS_MAX)     computed_sofa <= computed_sofa + 8'd1; // Vascular

                    // 3. Simplified Castelli Risk Index Approximation (Q16.16)
                    // Castelli = (Glucose / 100) + (Creatinine * 2)
                    computed_castelli <= (bm[0] >> 2) + (bm[2] << 1);

                    state <= STATE_DONE;
                end

                STATE_DONE: begin
                    busy       <= 1'b0;
                    valid      <= 1'b1;
                    sofa_score <= computed_sofa;
                    castelli_index <= computed_castelli;

                    // Decision Gate Synthesis
                    if (hazard_flag || viol_count >= 4'd3 || computed_sofa >= 8'd4) begin
                        decision <= DEC_REFUSE;
                        irq_out  <= 1'b1; // Raise IRQ on REFUSE / Hazard
                    end else if (viol_count > 4'd0 || computed_sofa > 8'd1) begin
                        decision <= DEC_LIMIT;
                    end else begin
                        decision <= DEC_ALLOW;
                    end

                    state <= STATE_IDLE;
                end

                default: state <= STATE_IDLE;
            endcase
        end
    end

endmodule
`default_nettype wire
