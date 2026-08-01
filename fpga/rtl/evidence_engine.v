// Evidence Snapshot Trigger & Buffer Control
module evidence_engine (
    input wire clk_sys,
    input wire rst_n,
    input wire anomaly_trigger,   // From Causal Corridor logic
    input wire [11:0] adc_data,   // High-speed V/I data
    output reg [31:0] snapshot_id,
    output wire [11:0] snapshot_bus // To MCP Bridge
);

    // Circular Buffer to capture pre-trigger data
    reg [11:0] ring_buffer [0:1023];
    reg [9:0] write_ptr;
    reg frozen;

    always @(posedge clk_sys) begin
        if (!rst_n) begin
            write_ptr <= 10'd0;
            frozen    <= 1'b0;
            snapshot_id <= 32'd0;
        end else if (!frozen) begin
            ring_buffer[write_ptr] <= adc_data;
            write_ptr <= write_ptr + 1'b1;
            
            // Freeze buffer upon anomaly detection
            if (anomaly_trigger) begin
                frozen <= 1'b1;
                snapshot_id <= snapshot_id + 1'b1;
            end
        end
    end
    
    // Assign output to the current write pointer to stream out the buffer
    assign snapshot_bus = ring_buffer[write_ptr];

endmodule
