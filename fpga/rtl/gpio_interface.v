// =============================================================================
// Module  : GPIO_Interface.v
// Purpose : General Purpose I/O stub
// =============================================================================
`timescale 1ns/1ps
`default_nettype none

module GPIO_Interface #(
    parameter WIDTH = 16
)(
    input  wire        clk, rst_n,
    input  wire [WIDTH-1:0] gpio_in,
    output reg  [WIDTH-1:0] gpio_out,
    output reg  [WIDTH-1:0] gpio_oe
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            gpio_out <= 0;
            gpio_oe <= 0;
        end else begin
            gpio_out <= gpio_in;
            gpio_oe <= {WIDTH{1'b1}};
        end
    end
endmodule
`default_nettype wire
