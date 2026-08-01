// =============================================================================
// Module  : governance_fsm.v  | Version: 1.1.0  | M-04
// Purpose : Core AI-PMC power governance algorithm.
//           States: BOOT→IDLE→POWERUP→RUN→POWEROFF→FAULT→SAFE
//           Guardrails checked every clock. Evidence emitted on every transition.
// Ref     : AI-PMC Software Spec Chapter 7 | Spec Section 2
// =============================================================================
`timescale 1ns/1ps
`default_nettype none

module GovernanceFSM #(
    parameter TIMEOUT_WIDTH = 32,
    parameter SENSOR_WIDTH  = 12
)(
    input  wire        clk, rst_n,
    // Governance config (M-02)
    input  wire [31:0] profile_id, timeouts_ms, thresholds, hysteresis, allowed_actions,
    // Sensor inputs
    input  wire        vin_valid, bus_ok,
    input  wire [SENSOR_WIDTH-1:0] vcap, temp,
    input  wire [31:0] fault_flags,
    // Request inputs
    input  wire        power_up_req, power_down_req,
    input  wire [7:0]  throttle_req, timing_shift_req,
    // Evidence output (M-03)
    output reg         evidence_valid,
    output reg [255:0] evidence_data,
    input  wire        evidence_ready,
    // Status
    output reg [2:0]   gov_state,
    output reg [31:0]  fault_cause,
    // Sequencing state (for POWERUP→RUN transition per spec §5.3)
    input  wire [2:0]  seq_state_in
);

    // State encoding (matches register map)
    localparam S_BOOT     = 3'd0;
    localparam S_IDLE     = 3'd1;
    localparam S_POWERUP  = 3'd2;
    localparam S_RUN      = 3'd3;
    localparam S_POWEROFF = 3'd4;
    localparam S_FAULT    = 3'd5;
    localparam S_SAFE     = 3'd6;

    // Guardrail thresholds extracted from config word (packed Q12.0)
    wire [SENSOR_WIDTH-1:0] vcap_min = thresholds[11:0];    // field 0
    wire [SENSOR_WIDTH-1:0] temp_max = thresholds[23:12];   // field 1

    // Guardrail evaluation  (Spec Section 2.2)
    wire gr_vin  = ~vin_valid;
    wire gr_bus  = ~bus_ok;
    wire gr_vcap = (vcap < vcap_min);
    wire gr_temp = (temp > temp_max);
    wire gr_flt  = (fault_flags != 0);
    wire guardrail_trip = gr_vin | gr_bus | gr_vcap | gr_temp | gr_flt;

    // Priority-encoded guardrail reason
    wire [31:0] gr_reason = gr_vin  ? 32'd1 :
                             gr_bus  ? 32'd2 :
                             gr_vcap ? 32'd3 :
                             gr_temp ? 32'd4 :
                             gr_flt  ? 32'd5 : 32'd0;

    // Monotonic timestamp (nanosecond approximation at 100 MHz → +10 per tick)
    reg [31:0] ts_ns;
    always @(posedge clk or negedge rst_n) if (!rst_n) ts_ns <= 0; else ts_ns <= ts_ns + 32'd10;

    // ── Evidence emission task ─────────────────────────────────────────────────
    // Format: {ts_ns[31:0], event_id[63:0], state_id[31:0], severity[31:0], payload[95:0]}
    // ANOM-018 FIX (Option B): Event IDs are 9-byte ASCII ("EVID.XXXX" = 72 bits).
    // Truncated to 64-bit by dropping the leading 'E' (0x45) byte.
    // Full strings documented in spec/25_aipmc_rtl_spec.md §5.2.
    localparam [63:0] EV_BOOT_ID      = 64'h5649442E424F4F54;  // "VID.BOOT" (was EVID.BOOT)
    localparam [63:0] EV_STATE_ENT_ID = 64'h5649442E53544154;  // "VID.STAT"
    localparam [63:0] EV_GR_TRIP_ID   = 64'h5649442E47524454;  // "VID.GRDT"
    localparam [63:0] EV_THROTTLE_ID  = 64'h5649442E54485254;  // "VID.THRT"
    localparam [63:0] EV_TIMING_ID    = 64'h5649442E54494D47;  // "VID.TIMG"

    task emit_ev;
        input [63:0] event_id;
        input [31:0] state_id, severity;
        input [95:0] payload;
    begin
        if (evidence_ready) begin
            evidence_data  <= {ts_ns, event_id, state_id, severity, payload};
            evidence_valid <= 1'b1;
        end
    end
    endtask

    // ── FSM ───────────────────────────────────────────────────────────────────
    reg [2:0] state;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state <= S_BOOT; gov_state <= S_BOOT;
            fault_cause <= 0; evidence_valid <= 0;
        end else begin
            evidence_valid <= 0;  // Default de-assert (1-cycle pulse)
            gov_state <= state;

            case (state)
                S_BOOT: begin
                    emit_ev(EV_BOOT_ID, 32'd0, 32'd0, {64'd0, profile_id});
                    state <= S_IDLE;
                end

                S_IDLE: begin
                    if (guardrail_trip) begin
                        fault_cause <= gr_reason;
                        emit_ev(EV_GR_TRIP_ID, {29'd0,S_FAULT}, 32'd2, {64'd0, gr_reason});
                        state <= S_FAULT;
                    end else if (power_up_req) begin
                        emit_ev(EV_STATE_ENT_ID, {29'd0,S_POWERUP}, 32'd0, {64'd0 ,{29'd0,S_IDLE}});
                        state <= S_POWERUP;
                    end
                end

                S_POWERUP: begin
                    if (guardrail_trip) begin
                        fault_cause <= gr_reason;
                        emit_ev(EV_GR_TRIP_ID, {29'd0,S_FAULT}, 32'd2, {64'd0, gr_reason});
                        state <= S_FAULT;
                    end else if (seq_state_in == 3'd4) begin
                        // ANOM-020 FIX: Transition to RUN only when sequencing is DONE
                        // (SS_DONE=3'd4) per spec/25_aipmc_rtl_spec.md §5.3
                        emit_ev(EV_STATE_ENT_ID, {29'd0,S_RUN}, 32'd0, 96'd0);
                        state <= S_RUN;
                    end
                end

                S_RUN: begin
                    if (guardrail_trip) begin
                        fault_cause <= gr_reason;
                        emit_ev(EV_GR_TRIP_ID, {29'd0,S_FAULT}, 32'd2, {64'd0, gr_reason});
                        state <= S_FAULT;
                    end else begin
                        if (throttle_req != 0 && allowed_actions[0])
                            emit_ev(EV_THROTTLE_ID, {29'd0,S_RUN}, 32'd0, {88'd0, throttle_req});
                        if (timing_shift_req != 0 && allowed_actions[1])
                            emit_ev(EV_TIMING_ID, {29'd0,S_RUN}, 32'd0, {88'd0, timing_shift_req});
                        if (power_down_req) begin
                            emit_ev(EV_STATE_ENT_ID, {29'd0,S_POWEROFF}, 32'd0, 96'd0);

                            state <= S_POWEROFF;
                        end
                    end
                end

                S_POWEROFF: begin
                    emit_ev(EV_STATE_ENT_ID, {29'd0,S_IDLE}, 32'd0, 96'd0);
                    state <= S_IDLE;
                end

                S_FAULT: begin
                    if (!guardrail_trip) begin
                        emit_ev(EV_STATE_ENT_ID, {29'd0,S_SAFE}, 32'd1, {64'd0, fault_cause});
                        state <= S_SAFE;
                    end
                    // Remain in FAULT while guardrail active
                end

                S_SAFE: begin
                    if (power_up_req && !guardrail_trip) begin
                        emit_ev(EV_STATE_ENT_ID, {29'd0,S_POWERUP}, 32'd0, 96'd0);
                        state <= S_POWERUP;
                    end
                end

                default: state <= S_IDLE;
            endcase
        end
    end

endmodule
`default_nettype wire
