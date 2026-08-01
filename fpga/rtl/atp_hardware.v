// =============================================================================
// Module  : atp_hardware.v  | Version: 1.0.0  | M-06 / M-07
// Purpose : Scenario injection + ATP evidence verification.
//           ATP-01: VIN invalid blocks power-up  (M-06)
//           ATP-02: PGOOD timeout → ABORT        (M-07)
// Ref     : AI-PMC Spec Section 5
// =============================================================================
`timescale 1ns/1ps
`default_nettype none

module ATPHardware #(parameter NUM_ATP_TESTS = 8)(
    input  wire       clk, rst_n,
    // Test control (from AXI)
    input  wire [7:0] atp_test_id,
    input  wire       atp_inject, atp_check,
    // Fault injection outputs (fed back into top-level sensor mux)
    output reg        inject_vin_invalid,
    output reg        inject_pgood_timeout,
    output reg [31:0] inject_timeout_ms,
    // Evidence flags (sampled from sequencing_engine + governance_fsm states)
    input  wire       ev_has_seq_start,
    input  wire       ev_has_seq_blocked,
    input  wire       ev_has_seq_done,
    input  wire       ev_has_seq_timeout,
    // Results
    output reg        atp_pass,
    output reg [31:0] atp_fail_reason,
    output reg        atp_busy
);
    localparam ATP_NONE             = 8'd0;
    localparam ATP_VIN_INVALID      = 8'd1;   // M-06: ATP-01
    localparam ATP_PGOOD_TIMEOUT    = 8'd2;   // M-07: ATP-02

    // Fail reason codes
    localparam FR_PASS              = 32'd0;
    localparam FR_NO_BLOCKED_EV     = 32'd1;  // ATP-01: BLOCKED evidence absent
    localparam FR_DONE_WHEN_BLOCKED = 32'd2;  // ATP-01: SEQ_DONE present (wrong)
    localparam FR_NO_TIMEOUT_EV     = 32'd3;  // ATP-02: TIMEOUT evidence absent
    localparam FR_DONE_WHEN_TIMEOUT = 32'd4;  // ATP-02: SEQ_DONE present (wrong)
    localparam FR_UNKNOWN_TEST      = 32'hFF;

    // ── Injection FSM ──────────────────────────────────────────────────────────
    // Dwell timer: hold fault for 2048 cycles then evaluate
    reg [11:0] dwell;
    reg [7:0]  active_test;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            inject_vin_invalid   <= 0; inject_pgood_timeout <= 0;
            inject_timeout_ms    <= 0; atp_pass <= 0;
            atp_fail_reason <= 0; atp_busy <= 0;
            dwell <= 0; active_test <= 0;
        end else begin

            if (atp_inject && !atp_busy) begin
                // ── Start injection ──────────────────────────────────────────
                atp_busy <= 1; active_test <= atp_test_id;
                atp_pass <= 0; atp_fail_reason <= 0;
                dwell <= 0;

                case (atp_test_id)
                    ATP_VIN_INVALID: begin
                        inject_vin_invalid   <= 1;
                        inject_pgood_timeout <= 0;
                        inject_timeout_ms    <= 32'd0;
                    end
                    ATP_PGOOD_TIMEOUT: begin
                        inject_vin_invalid   <= 0;
                        inject_pgood_timeout <= 1;
                        inject_timeout_ms    <= 32'd10;  // 10 ms → triggers fast timeout
                    end
                    default: begin
                        atp_busy        <= 0;
                        atp_fail_reason <= FR_UNKNOWN_TEST;
                    end
                endcase

            end else if (atp_busy) begin
                // ── Dwell phase ──────────────────────────────────────────────
                dwell <= dwell + 1;

                if (dwell == 12'hFFF) begin
                    // ── Evaluate evidence ────────────────────────────────────
                    case (active_test)
                        ATP_VIN_INVALID: begin
                            // Pass: BLOCKED present AND DONE absent
                            if (ev_has_seq_blocked && !ev_has_seq_done) begin
                                atp_pass <= 1; atp_fail_reason <= FR_PASS;
                            end else if (!ev_has_seq_blocked) begin
                                atp_pass <= 0; atp_fail_reason <= FR_NO_BLOCKED_EV;
                            end else begin
                                atp_pass <= 0; atp_fail_reason <= FR_DONE_WHEN_BLOCKED;
                            end
                        end
                        ATP_PGOOD_TIMEOUT: begin
                            // Pass: TIMEOUT present AND DONE absent
                            if (ev_has_seq_timeout && !ev_has_seq_done) begin
                                atp_pass <= 1; atp_fail_reason <= FR_PASS;
                            end else if (!ev_has_seq_timeout) begin
                                atp_pass <= 0; atp_fail_reason <= FR_NO_TIMEOUT_EV;
                            end else begin
                                atp_pass <= 0; atp_fail_reason <= FR_DONE_WHEN_TIMEOUT;
                            end
                        end
                        default: atp_fail_reason <= FR_UNKNOWN_TEST;
                    endcase

                    // De-assert injection
                    inject_vin_invalid   <= 0;
                    inject_pgood_timeout <= 0;
                    inject_timeout_ms    <= 0;
                    atp_busy <= 0;
                end
            end
        end
    end

endmodule
`default_nettype wire
