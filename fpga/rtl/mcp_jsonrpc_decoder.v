// =============================================================================
// Module  : mcp_jsonrpc_decoder.v  | Version: 1.0.0
// Purpose : JSON-RPC 2.0 framing decoder over AXI4-Stream.
//           Detects method field in ASCII stream, maps to 8-bit method_id.
//           Extracts params payload (first 64 bits) into payload_out.
// Protocol : {"jsonrpc":"2.0","method":"<name>","params":{...},"id":N}
// Note     : Simplified UTF-8 / ASCII only; no JSON escape processing.
// =============================================================================
`timescale 1ns/1ps
`default_nettype none

module MCPJsonRpcDecoder (
    input  wire        clk, rst_n,
    // AXI4-Stream input (UTF-8 JSON beats, 64-bit wide)
    input  wire [63:0] s_axis_tdata,
    input  wire        s_axis_tvalid,
    output reg         s_axis_tready,
    // Decoded outputs
    output reg  [63:0] payload_out,
    output reg         payload_valid,
    output reg  [7:0]  method_id
);
    // Known method codes
    localparam M_DECOMPOSE   = 8'd1;
    localparam M_EVALUATE    = 8'd2;
    localparam M_STATUS      = 8'd3;
    localparam M_RESET       = 8'd4;
    localparam M_ATP         = 8'd5;
    localparam M_FEATURE     = 8'd6;
    localparam M_UNKNOWN     = 8'hFF;

    // ── State machine ─────────────────────────────────────────────────────────
    localparam ST_HUNT   = 2'd0;   // Looking for "method":
    localparam ST_METHOD = 2'd1;   // Reading method name
    localparam ST_PARAMS = 2'd2;   // Reading params
    localparam ST_DONE   = 2'd3;

    reg [1:0]  state;
    reg [63:0] accum;         // 8-byte method name accumulator
    reg [3:0]  method_byte;
    reg [31:0] hunt_shift;    // 4-byte window for "meth" keyword detect

    // Keyword detection: detect ASCII "meth" in stream window
    wire method_keyword = (hunt_shift == 32'h6D657468);  // "meth"

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state <= ST_HUNT; s_axis_tready <= 1;
            payload_out <= 0; payload_valid <= 0;
            method_id <= M_UNKNOWN; accum <= 0;
            method_byte <= 0; hunt_shift <= 0;
        end else begin
            payload_valid <= 0;
            s_axis_tready <= 1;

            if (s_axis_tvalid) begin
                case (state)
                    ST_HUNT: begin
                        // Slide 4-byte window looking for "meth"
                        hunt_shift <= {hunt_shift[23:0], s_axis_tdata[7:0]};
                        if (method_keyword) begin
                            state <= ST_METHOD; accum <= 0; method_byte <= 0;
                        end
                    end

                    ST_METHOD: begin
                        // Accumulate up to 8 bytes of method name ASCII
                        accum <= {accum[55:0], s_axis_tdata[7:0]};
                        method_byte <= method_byte + 1;
                        if (method_byte == 4'd7 || s_axis_tdata[7:0] == 8'h22) begin
                            // Decode method by matching known prefixes
                            casez (accum[63:32])
                                32'h6465636F: method_id <= M_DECOMPOSE;  // "deco"
                                32'h6576616C: method_id <= M_EVALUATE;   // "eval"
                                32'h73746174: method_id <= M_STATUS;     // "stat"
                                32'h72657365: method_id <= M_RESET;      // "rese"
                                32'h61747068: method_id <= M_ATP;        // "atph"
                                32'h66656174: method_id <= M_FEATURE;    // "feat"
                                default:      method_id <= M_UNKNOWN;
                            endcase
                            state <= ST_PARAMS;
                        end
                    end

                    ST_PARAMS: begin
                        // First 64-bit beat of params captured directly
                        payload_out   <= s_axis_tdata;
                        payload_valid <= 1;
                        state <= ST_DONE;
                    end

                    ST_DONE: begin
                        // Wait for end-of-frame (detect '}' = 0x7D)
                        if (s_axis_tdata[7:0] == 8'h7D) begin
                            hunt_shift <= 0;
                            state <= ST_HUNT;
                        end
                    end
                endcase
            end
        end
    end

endmodule
`default_nettype wire
