// =============================================================================
// Module  : bram_axiom_store.v  | Version: 1.1.0
// Purpose : True dual-port 4096×64-bit BRAM wrapper.
//           Port A: read-write (axiom storage, results)
//           Port B: read-only  (semantic engine, decomposer read-back)
// Xilinx   : Infers RAMB36 primitives via (* ram_style = "block" *)
// ANOM-009 FIX: Added data_valid_a/b 1-cycle output strobes.
// =============================================================================
`timescale 1ns/1ps
`default_nettype none

module BRAMAxiomStore #(
    parameter DEPTH = 4096,
    parameter WIDTH = 64
)(
    input  wire                 clk, rst_n,
    // Port A (read-write)
    input  wire [$clog2(DEPTH)-1:0] addr_a,
    input  wire [WIDTH-1:0]     din_a,
    output reg  [WIDTH-1:0]     dout_a,
    output reg                  data_valid_a,   // ANOM-009: 1-cycle read-valid strobe
    input  wire                 we_a, en_a,
    // Port B (read-only)
    input  wire [$clog2(DEPTH)-1:0] addr_b,
    output reg  [WIDTH-1:0]     dout_b,
    output reg                  data_valid_b,   // ANOM-009: 1-cycle read-valid strobe
    input  wire                 en_b
);
    (* ram_style = "block" *)
    reg [WIDTH-1:0] mem [0:DEPTH-1];

    // Port A — ANOM-009: data_valid_a asserted one cycle after successful read
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            dout_a <= 0; data_valid_a <= 0;
        end else begin
            data_valid_a <= 0;
            if (en_a) begin
                if (we_a) mem[addr_a] <= din_a;
                dout_a       <= mem[addr_a];
                data_valid_a <= en_a;     // valid 1 cycle after en_a asserted
            end
        end
    end

    // Port B (read-only)
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            dout_b <= 0; data_valid_b <= 0;
        end else begin
            data_valid_b <= 0;
            if (en_b) begin
                dout_b       <= mem[addr_b];
                data_valid_b <= en_b;
            end
        end
    end

endmodule
`default_nettype wire
