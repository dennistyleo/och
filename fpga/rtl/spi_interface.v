// =============================================================================
// Module  : SPI_Interface.v
// Purpose : SPI master/slave controller stub
// =============================================================================
`timescale 1ns/1ps
`default_nettype none

module SPI_Interface #(
    parameter CLK_FREQ = 100_000_000,
    parameter SPI_FREQ = 1_000_000
)(
    input  wire        clk, rst_n,
    input  wire        start,
    input  wire [7:0]  tx_data,
    output reg  [7:0]  rx_data,
    output reg         done,
    output reg         error,
    // SPI physical pins
    output reg         sclk,
    output reg         mosi,
    input  wire        miso,
    output reg         cs_n
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            rx_data <= 0;
            done <= 0;
            error <= 0;
            sclk <= 1;
            mosi <= 1;
            cs_n <= 1;
        end else begin
            if (start) begin
                done <= 1;
                rx_data <= 8'h00;
                error <= 0;
                cs_n <= 0;
            end else begin
                done <= 0;
                cs_n <= 1;
            end
        end
    end
endmodule
`default_nettype wire
