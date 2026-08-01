// =============================================================================
// Module  : EvidenceEncoder.v  | Version: 1.3.0
// Purpose : Encodes telemetry evidence into 256-bit records for axiom engine
// FIXED   : Added all ports expected by ontology_silicon_module.v
// =============================================================================
`timescale 1ns/1ps
`default_nettype none

module EvidenceEncoder #(
    parameter FIFO_DEPTH = 1024,
    parameter FIFO_WIDTH = 256
)(
    input  wire clk, rst_n,
    
    // Write side (telemetry input)
    input  wire        ev_valid,
    output reg         ev_ready,
    input  wire [FIFO_WIDTH-1:0] ev_data,

    
    // Read side (AXI-Stream output)
    output reg  [FIFO_WIDTH-1:0] m_axis_tdata,
    output reg                    m_axis_tvalid,
    input  wire                   m_axis_tready,
    
    // Status outputs (for ontology_silicon_module)
    output reg  [9:0]  ev_count,
    output reg  [31:0] dropped_count,
    output reg         overflow_flag,
    
    // Additional status ports expected by ontology_silicon_module
    output reg                    ev_empty,
    output reg                    ev_full
);

    // FIFO storage
    reg [FIFO_WIDTH-1:0] fifo [0:FIFO_DEPTH-1];
    reg [9:0] wr_ptr, rd_ptr;
    reg [9:0] count;
    
    // Internal signals
    wire write_en;
    wire read_en;
    wire full;
    wire empty;
    
    assign full  = (count == FIFO_DEPTH);
    assign empty = (count == 0);
    assign write_en = ev_valid && ev_ready && !full;
    assign read_en  = m_axis_tvalid && m_axis_tready && !empty;
    
    // Pack data into 256-bit record
    wire [FIFO_WIDTH-1:0] packed_data;
    assign packed_data = ev_data;
    
    // ============================================================
    // UNIFIED ALWAYS BLOCK
    // ============================================================
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            wr_ptr <= 0;
            rd_ptr <= 0;
            count <= 0;
            ev_count <= 0;
            dropped_count <= 0;
            overflow_flag <= 0;
            ev_ready <= 1;
            m_axis_tvalid <= 0;
            m_axis_tdata <= 0;
            ev_empty <= 1;
            ev_full <= 0;
        end else begin
            // Defaults
            ev_ready <= 1;
            
            // ========================================================
            // FIFO write operation
            // ========================================================
            if (write_en) begin
                fifo[wr_ptr] <= packed_data;
                wr_ptr <= wr_ptr + 1;
                count <= count + 1;
                ev_count <= ev_count + 1;
            end
            
            // ========================================================
            // FIFO read operation
            // ========================================================
            if (read_en) begin
                m_axis_tdata <= fifo[rd_ptr];
                rd_ptr <= rd_ptr + 1;
                count <= count - 1;
                ev_count <= ev_count - 1;
            end
            
            // ========================================================
            // Output valid signals
            // ========================================================
            m_axis_tvalid <= !empty;
            ev_empty <= empty;
            ev_full <= full;
            
            // ========================================================
            // Overflow handling
            // ========================================================
            if (ev_valid && full) begin
                dropped_count <= dropped_count + 1;
                overflow_flag <= 1;
            end else begin
                overflow_flag <= 0;
            end
            
            // ========================================================
            // Reset dropped_count on overflow wrap
            // ========================================================
            if (dropped_count == 32'hFFFF_FFFF) begin
                dropped_count <= 0;
            end
            
        end
    end

endmodule
`default_nettype wire
