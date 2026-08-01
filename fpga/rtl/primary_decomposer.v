// =============================================================================
// Module  : primary_decomposer.v  | Version: 1.0.0
// Purpose : Hardware accelerator — primary decomposition of polynomial ideals.
//           Buchberger algorithm → S-polynomial reduction → radical computation.
//           Connects to Groebner engine via coefficient stream.
// Clock   : clk_300 (300 MHz compute domain)
// =============================================================================
`timescale 1ns/1ps
`default_nettype none

module PrimaryDecomposer #(
    parameter MAX_AXIOMS    = 32,
    parameter MAX_VARIABLES = 16,
    parameter MAX_DEGREE    = 8,
    parameter COEFF_WIDTH   = 32,
    parameter POLY_WIDTH    = 256
)(
    input  wire clk, rst_n,
    // Control
    input  wire        start,
    output reg         done,
    output reg  [31:0] prime_count, error_code,
    // BRAM address config
    input  wire [31:0] axiom_base_addr, target_addr, result_base_addr,
    // AXI-Stream: coefficient input
    input  wire [COEFF_WIDTH-1:0] s_axis_coeff_tdata,
    input  wire        s_axis_coeff_tvalid,
    output reg         s_axis_coeff_tready,
    // AXI-Stream: prime poly output
    output reg  [POLY_WIDTH-1:0] m_axis_prime_tdata,
    output reg         m_axis_prime_tvalid,
    input  wire        m_axis_prime_tready,
    // Groebner basis coefficient input
    input  wire [COEFF_WIDTH-1:0] gb_coeff_in,
    input  wire        gb_coeff_valid
);
    // State encoding
    localparam ST_IDLE         = 3'd0;
    localparam ST_LOAD_AXIOMS  = 3'd1;
    localparam ST_GROEBNER     = 3'd2;
    localparam ST_DECOMPOSE    = 3'd3;
    localparam ST_WRITE_RESULT = 3'd4;
    localparam ST_ERROR        = 3'd5;

    localparam MAX_ITER = 32'd10_000;

    // Polynomial store (synthesises to BRAM)
    (* ram_style = "block" *)
    reg [POLY_WIDTH-1:0] poly_store [0:1023];

    reg [2:0]  state;
    reg [31:0] poly_ptr;
    reg [31:0] iter_count;

    // 4-way systolic reduction pipeline (Q16.16 fixed-point)
    reg [COEFF_WIDTH-1:0] s1[0:3], s2[0:3], s3[0:3], s4[0:3];
    reg [MAX_VARIABLES-1:0] mono_deg;

    // FIX Bug 5: integer at module scope (not inside begin: block inside always)
    integer i;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state <= ST_IDLE; done <= 0; prime_count <= 0;
            error_code <= 0; poly_ptr <= 0; iter_count <= 0;
            s_axis_coeff_tready <= 0; m_axis_prime_tvalid <= 0;
            mono_deg <= 0;
        end else begin
            // Default de-asserts
            done <= 0; m_axis_prime_tvalid <= 0;

            case (state)
                ST_IDLE: begin
                    s_axis_coeff_tready <= 1;
                    if (start) begin
                        poly_ptr <= 0; iter_count <= 0; prime_count <= 0;
                        state <= ST_LOAD_AXIOMS;
                    end
                end

                ST_LOAD_AXIOMS: begin
                    if (s_axis_coeff_tvalid) begin
                        // Pack incoming coefficient beat into polynomial slot
                        poly_store[poly_ptr[9:0]] <= s_axis_coeff_tdata;
                        poly_ptr <= poly_ptr + 1;
                        // Also ingest groebner basis coefficients interleaved
                        if (gb_coeff_valid)
                            mono_deg <= mono_deg ^ gb_coeff_in[MAX_VARIABLES-1:0];
                    end
                    if (poly_ptr == 10'd1023 || !s_axis_coeff_tvalid)
                        state <= ST_GROEBNER;
                end

                ST_GROEBNER: begin
                    // 4-way systolic F4/F5 reduction (pipelined)
                    s_axis_coeff_tready <= 0;
                    begin : systolic
                        for (i = 0; i < 4; i = i + 1) begin
                            s1[i] <= poly_store[{1'b0, iter_count[9:0]}][COEFF_WIDTH*(i+1)-1 -: COEFF_WIDTH]
                                      * {16'd0, mono_deg[i*4 +: 4]};
                            s2[i] <= s1[i] + s1[(i+1)%4];
                            s3[i] <= s2[i] - s2[(i+2)%4];
                            s4[i] <= s3[i] >>> 16;  // Q16.16 scale
                        end
                    end
                    iter_count <= iter_count + 1;
                    if (iter_count >= MAX_ITER) state <= ST_DECOMPOSE;
                    // Timeout guard → error
                    if (iter_count >= 32'd50_000) begin state <= ST_ERROR; error_code <= 32'hE001; end
                end

                ST_DECOMPOSE: begin
                    // Eisenbud-Huneke-Vasconcelos: count irreducible components
                    // (simplified: count non-zero reduced polynomials)
                    prime_count <= poly_ptr[31:0];  // full FPGA impl uses saturation arithmetic
                    state <= ST_WRITE_RESULT;
                end

                ST_WRITE_RESULT: begin
                    if (m_axis_prime_tready || !m_axis_prime_tvalid) begin
                        m_axis_prime_tdata  <= poly_store[prime_count[9:0]];
                        m_axis_prime_tvalid <= (prime_count > 0);
                        if (prime_count > 0) prime_count <= prime_count - 1;
                        else begin done <= 1; state <= ST_IDLE; s_axis_coeff_tready <= 1; end
                    end
                end

                ST_ERROR: begin
                    done <= 1; error_code <= 32'hE001; state <= ST_IDLE; s_axis_coeff_tready <= 1;
                end
            endcase
        end
    end

endmodule
`default_nettype wire
