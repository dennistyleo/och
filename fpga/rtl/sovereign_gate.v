/*
 * Module: sovereign_gate
 * Version: 1.0.0
 * Standard: Verilog-2001 (IEEE 1364-2001)
 *
 * Description:
 * Implements the "Quarantine & Analysis" principle for XR-PMC.
 * - Motherboard Sentinels: Monitors PCIE PERST_N and VIN_A_OK to detect Reset Tree faults.
 * - Debug Port Gate (The Sovereign Gate): Detects JTAG/UART access and ensures MCP Handshake.
 *   If JTAG accessed without MCP credential, triggers PROT_TRIP.
 * - Enforces Two-Stage CDC Synchronizers, Synchronous Resets, and Two-Always-Block FSM.
 */

`timescale 1ns/1ps

module sovereign_gate (
    input  wire        clk_sys,        // System Clock
    input  wire        clk_arm,        // ARM Cortex Clock
    input  wire        rst_sync_n,     // Synchronous Active-Low Reset (System domain)
    
    // Motherboard Sentinels
    input  wire        vin_a_ok,       // VIN_A stable
    input  wire        pcie_perst_n,   // PCIE Reset (Active Low)
    
    // Debug Port Interface
    input  wire        jtag_tck,
    input  wire        uart_rx_active,
    
    // MCP Interface (from ARM Domain)
    input  wire        mcp_auth_valid, // MCP Handshake Credential
    
    // Outputs
    output reg         prot_trip,      // Protection Trip / Logic Interference Event
    output reg         reset_tree_err  // Reset Tree Physical Failure
);

    //-------------------------------------------------------------------------
    // 1. Two-Stage CDC Synchronizer for MCP Auth Valid (ARM -> SYS Domain)
    //-------------------------------------------------------------------------
    reg mcp_auth_sync_1;
    reg mcp_auth_sync_2;

    always @(posedge clk_sys) begin
        if (!rst_sync_n) begin
            mcp_auth_sync_1 <= 1'b0;
            mcp_auth_sync_2 <= 1'b0;
        end else begin
            mcp_auth_sync_1 <= mcp_auth_valid;
            mcp_auth_sync_2 <= mcp_auth_sync_1;
        end
    end

    //-------------------------------------------------------------------------
    // 2. Motherboard Sentinels Monitoring
    //    If VIN_A is stable but PCIE PERST# drops unexpectedly during power-on
    //-------------------------------------------------------------------------
    always @(posedge clk_sys) begin
        if (!rst_sync_n) begin
            reset_tree_err <= 1'b0;
        end else begin
            if (vin_a_ok && !pcie_perst_n) begin
                reset_tree_err <= 1'b1;
            end else begin
                reset_tree_err <= 1'b0;
            end
        end
    end

    //-------------------------------------------------------------------------
    // 3. The Sovereign Gate FSM (Two-Always-Block Style)
    //-------------------------------------------------------------------------
    localparam STATE_IDLE       = 2'b00;
    localparam STATE_MONITOR    = 2'b01;
    localparam STATE_AUTH_CHECK = 2'b10;
    localparam STATE_TRIP       = 2'b11;

    reg [1:0] current_state, next_state;

    // Detect Debug Port Activity (JTAG Clock or UART RX)
    wire debug_active = (jtag_tck || uart_rx_active);

    // Sequential State Block
    always @(posedge clk_sys) begin
        if (!rst_sync_n) begin
            current_state <= STATE_IDLE;
        end else begin
            current_state <= next_state;
        end
    end

    // Combinational Next-State and Output Logic
    always @(*) begin
        // Default assignments
        next_state = current_state;
        prot_trip  = 1'b0;

        case (current_state)
            STATE_IDLE: begin
                if (vin_a_ok) begin
                    next_state = STATE_MONITOR;
                end
            end

            STATE_MONITOR: begin
                if (debug_active) begin
                    next_state = STATE_AUTH_CHECK;
                end else if (!vin_a_ok) begin
                    next_state = STATE_IDLE;
                end
            end

            STATE_AUTH_CHECK: begin
                // Check if MCP Handshake credential is valid
                if (mcp_auth_sync_2) begin
                    // Authorized, return to monitoring
                    next_state = STATE_MONITOR;
                end else begin
                    // Unauthorized Debug Access -> Trip
                    next_state = STATE_TRIP;
                end
            end

            STATE_TRIP: begin
                prot_trip = 1'b1;
                // Latch fault until reset
                next_state = STATE_TRIP;
            end
            
            default: next_state = STATE_IDLE;
        endcase
    end

endmodule
