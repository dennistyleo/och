// =============================================================================
// Module  : two_stage_sync.v
// Purpose : Generic two-stage synchronizer for metastability protection
// =============================================================================
`timescale 1ns/1ps
`default_nettype none

module two_stage_sync #(parameter WIDTH = 1)(
    input  wire clk,
    input  wire rst_n,
    input  wire [WIDTH-1:0] async_in,
    output reg  [WIDTH-1:0] sync_out
);

    reg [WIDTH-1:0] sync_stage1;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            sync_stage1 <= {WIDTH{1'b0}};
            sync_out    <= {WIDTH{1'b0}};
        end else begin
            sync_stage1 <= async_in;
            sync_out    <= sync_stage1;
        end
    end

endmodule
`default_nettype wire
