// =============================================================================
// Module  : UART_Interface.v
// Purpose : UART serial controller stub
// =============================================================================
`timescale 1ns/1ps
`default_nettype none

module UART_Interface #(
    parameter CLK_FREQ = 100_000_000,
    parameter BAUD_RATE = 115200
)(
    input  wire        clk, rst_n,
    input  wire        tx_start,
    input  wire [7:0]  tx_data,
    output reg         tx_busy,
    output reg  [7:0]  rx_data,
    output reg         rx_valid,
    // UART physical pins
    output reg         tx,
    input  wire        rx
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            tx_busy <= 0;
            rx_data <= 0;
            rx_valid <= 0;
            tx <= 1;
        end else begin
            if (tx_start) begin
                tx_busy <= 1;
                tx <= 0;  // Start bit
            end else begin
                tx_busy <= 0;
                tx <= 1;
            end
            
            // Stub: always return some data
            rx_valid <= 1;
            rx_data <= 8'hAA;
        end
    end
endmodule
`default_nettype wire
