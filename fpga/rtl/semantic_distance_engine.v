// =============================================================================
// Module  : semantic_distance_engine.v  | Version: 1.1.0
// Purpose : Q16.16 fixed-point semantic distance between two axiom vectors.
//           Distance = Σ|a_i - b_i|² / N  (Manhattan-squared normalised).
//           Pipelined: 4-stage, 1 result per clock at steady state.
// =============================================================================
`timescale 1ns/1ps
`default_nettype none

module SemanticDistanceEngine #(
    parameter COEFF_WIDTH = 32,
    parameter VECTOR_DIM  = 8     // Number of coefficient dimensions compared
)(
    input  wire        clk, rst_n,
    input  wire [31:0] axiom_a,   // AXI word: lower 32 bits of axiom ID / key
    input  wire [31:0] axiom_b,   // Target axiom address / key
    input  wire        dist_valid_in,
    output reg  [31:0] semantic_dist
);
    // Compute component-wise distance on packed 4-bit nibbles
    // axiom_a[31:0] = 8 × 4-bit semantic tokens
    // Stage 1: difference
    reg [7:0] diff [0:VECTOR_DIM-1];
    // Stage 2: absolute
    reg [7:0] absval [0:VECTOR_DIM-1];
    // Stage 3: squared (8-bit input → 16-bit output)
    reg [15:0] sq [0:VECTOR_DIM-1];
    // Stage 4: sum + normalise → Q16.16
    reg [31:0] dist_acc;
    reg        valid_s1, valid_s2, valid_s3;

    // Module-scope loop variables and accumulator (Verilog-2001: no declarations inside always)
    integer i, k;
    reg [31:0] acc_comb;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            semantic_dist <= 0;
            valid_s1 <= 0; valid_s2 <= 0; valid_s3 <= 0;
            for (i=0; i<VECTOR_DIM; i=i+1) begin
                diff[i] <= 0; absval[i] <= 0; sq[i] <= 0;
            end
            dist_acc <= 0;
        end else begin
            // Stage 1: compute signed difference per 4-bit nibble
            valid_s1 <= dist_valid_in;
            for (i=0; i<VECTOR_DIM; i=i+1) begin
                diff[i] <= axiom_a[i*4 +: 4] - axiom_b[i*4 +: 4];
            end

            // Stage 2: absolute value
            valid_s2 <= valid_s1;
            for (i=0; i<VECTOR_DIM; i=i+1) begin
                absval[i] <= diff[i][7] ? (~diff[i] + 8'd1) : diff[i];
            end

            // Stage 3: square
            valid_s3 <= valid_s2;
            for (i=0; i<VECTOR_DIM; i=i+1) begin
                sq[i] <= {8'd0, absval[i]} * {8'd0, absval[i]};
            end

            // Stage 4: sum and scale to Q16.16
            // FIX: acc_comb and k moved to module scope (Verilog-2001 compliant)
            // FIX: semantic_dist now reads acc_comb this cycle (no 1-cycle lag)
            if (valid_s3) begin : sum_loop
                acc_comb = 32'd0;
                for (k = 0; k < VECTOR_DIM; k = k + 1)
                    acc_comb = acc_comb + {16'd0, sq[k]};
                dist_acc      <= acc_comb;
                semantic_dist <= (acc_comb << 16) / VECTOR_DIM;  // normalise
            end
        end
    end

endmodule
`default_nettype wire
