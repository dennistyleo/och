// =============================================================================
// Module  : causal_invariant_tracker.v  | Version: 1.1.0
// Purpose : CAM-based causal invariant checking. Stores a set of known-valid
//           axiom IDs in a Content-Addressable Memory. Raises an IRQ and
//           increments violation_count when an unknown axiom is presented.
// =============================================================================
`timescale 1ns/1ps
`default_nettype none

module CausalInvariantTracker #(
    parameter NUM_INVARIANTS = 32,
    parameter ID_WIDTH       = 8
)(
    input  wire clk, rst_n,
    // Axiom ID presented for validation
    input  wire [ID_WIDTH-1:0] axiom_id_in,
    input  wire                axiom_valid,
    // Status outputs
    output reg  [31:0]         violation_count,
    output reg                 irq_out
);
    // ── CAM storage (synthesises to distributed RAM with comparison logic) ────
    reg [ID_WIDTH-1:0] cam [0:NUM_INVARIANTS-1];
    reg                cam_valid [0:NUM_INVARIANTS-1];
    // ANOM-007 FIX: CAM reset via rst_n (synthesis-safe; replaces non-synthesisable initial block)
    // TEST_POINT: DESIGN_001 — CAM contents known-good after rst_n deassertion
    integer j;

    // ── CAM match logic ───────────────────────────────────────────────────────
    reg [NUM_INVARIANTS-1:0] match_bits;
    always @(*) begin
        match_bits = {NUM_INVARIANTS{1'b0}};  // ANOM-015 FIX: default prevents latch
        for (j=0; j<NUM_INVARIANTS; j=j+1)
            match_bits[j] = cam_valid[j] && (cam[j] == axiom_id_in);
    end
    wire hit = |match_bits;

    // ── CAM write: register new axiom if capacity available ──────────────────
    reg [5:0] free_slot;
    always @(*) begin
        free_slot = NUM_INVARIANTS[5:0];  // ANOM-015 FIX: default = invalid slot
        for (j=0; j<NUM_INVARIANTS; j=j+1)
            if (!cam_valid[j]) free_slot = j[5:0];
    end

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            violation_count <= 0; irq_out <= 0;
            // ANOM-007 FIX: Pre-load 8 canonical IDs at reset (synthesis-safe)
            for (j=0; j<NUM_INVARIANTS; j=j+1) begin
                cam[j]       <= j[ID_WIDTH-1:0];
                cam_valid[j] <= (j < 8) ? 1'b1 : 1'b0;
            end
        end else begin
            irq_out <= 0;
            if (axiom_valid) begin
                if (!hit) begin
                    // Unknown axiom: log violation and raise IRQ
                    violation_count <= violation_count + 1;
                    irq_out <= 1;
                    // Optionally register into CAM if free slot exists
                    if (free_slot < NUM_INVARIANTS) begin
                        cam[free_slot] <= axiom_id_in;
                        cam_valid[free_slot] <= 1;
                    end
                end
            end
        end
    end

endmodule
`default_nettype wire
