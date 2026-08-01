// =============================================================================
// Module  : sequencing_engine.v  | Version: 1.1.0  | M-05
// Purpose : Power rail sequencing executor.
//           Steps: NOP / ASSERT_EN / DEASSERT_EN / RELEASE_RESET / ASSERT_RESET
//           Guard checks vin_valid + pgood before each step advance.
//           EVID evidence emitted on ENTER/EXIT/BLOCKED/TIMEOUT/DONE.
// Ref     : AI-PMC Spec Section 3 | Spec Section 3.2 (POWER_ON sequence)
// =============================================================================
`timescale 1ns/1ps
`default_nettype none

module SequencingEngine #(
    parameter MAX_STEPS = 16,
    parameter MAX_RAILS = 8
)(
    input  wire        clk, rst_n,
    // Guard inputs
    input  wire        vin_valid, bus_ok,
    input  wire [MAX_RAILS-1:0] pgood_in,
    input  wire [31:0] fault_flags,
    // Commands from AXI
    input  wire        seq_start, seq_stop, seq_hold, seq_resume,
    // Rail outputs
    output reg  [MAX_RAILS-1:0] en_out, reset_out,
    // Evidence (M-03)
    output reg         evidence_valid,
    output reg [255:0] evidence_data,
    input  wire        evidence_ready,
    // Status
    output reg  [2:0]  seq_state,
    output reg  [7:0]  current_step,
    output reg  [31:0] timeout_count
);
    localparam SS_IDLE  = 3'd0;
    localparam SS_START = 3'd1;
    localparam SS_RUN   = 3'd2;
    localparam SS_HOLD  = 3'd3;
    localparam SS_DONE  = 3'd4;
    localparam SS_FAIL  = 3'd5;

    // Step types
    localparam NOP           = 3'd0;
    localparam ASSERT_EN     = 3'd1;
    localparam DEASSERT_EN   = 3'd2;
    localparam RELEASE_RESET = 3'd3;
    localparam ASSERT_RESET  = 3'd4;

    // Hardcoded POWER_ON sequence (Spec Section 3.2)
    // Step: [semantic, rail_index, guard_mask, timeout_cycles]
    // ANOM-008 FIX: rom_style attribute + ROM_INIT tag (synthesisable constant tables)
    (* rom_style = "distributed" *) reg [2:0]  step_semantic  [0:MAX_STEPS-1];  // ROM_INIT
    (* rom_style = "distributed" *) reg [2:0]  step_rail      [0:MAX_STEPS-1];  // ROM_INIT
    (* rom_style = "distributed" *) reg [31:0] step_timeout   [0:MAX_STEPS-1];  // ROM_INIT
    integer si;
    initial begin // ROM_INIT — synthesis tool infers as distributed ROM (safe)
        for (si=0; si<MAX_STEPS; si=si+1) begin
            step_semantic[si] = NOP; step_rail[si] = 0; step_timeout[si] = 32'd100_000;
        end
        // ON_00_PRECHECK
        step_semantic[0] = NOP;           step_rail[0] = 0; step_timeout[0] = 32'd1000;
        // ON_10_ENABLE_MAIN (rail 0)
        step_semantic[1] = ASSERT_EN;     step_rail[1] = 0; step_timeout[1] = 32'd1_000_000;
        // ON_20_ENABLE_AUX (rail 1)
        step_semantic[2] = ASSERT_EN;     step_rail[2] = 1; step_timeout[2] = 32'd1_000_000;
        // ON_30_RELEASE_RESET
        step_semantic[3] = RELEASE_RESET; step_rail[3] = 0; step_timeout[3] = 32'd2_000_000;
    end

    // Guard condition for current step
    wire guard_ok;
    assign guard_ok = vin_valid && bus_ok && (fault_flags == 0);

    // Step completion detection
    wire step_done;
    assign step_done =
        (step_semantic[current_step] == NOP)           ? 1'b1 :
        (step_semantic[current_step] == ASSERT_EN)     ? pgood_in[step_rail[current_step]] :
        (step_semantic[current_step] == DEASSERT_EN)   ? ~en_out[step_rail[current_step]] :
        (step_semantic[current_step] == RELEASE_RESET) ? (timeout_count >= step_timeout[current_step]) :
        (step_semantic[current_step] == ASSERT_RESET)  ? (timeout_count >= step_timeout[current_step]) :
        1'b1;

    wire step_timeout_fire = (timeout_count >= step_timeout[current_step]) && ~step_done;

    // Monotonic ns counter
    reg [31:0] ts_ns;
    always @(posedge clk or negedge rst_n) if (!rst_n) ts_ns <= 0; else ts_ns <= ts_ns + 32'd10;

    // Event ID constants (ASCII packed)
    // ANOM-019 FIX: Truncated to 64-bit (dropped leading 'E'=0x45 byte, same as governance_fsm)
    localparam [63:0] EV_SEQ_START_ID = 64'h5649442E53455153; // "VID.SEQS" (was EVID.SEQS)
    localparam [63:0] EV_STEP_ENT   = 64'h455649442E535445;
    localparam [63:0] EV_STEP_EXT   = 64'h455649442E535458;
    localparam [63:0] EV_BLOCKED    = 64'h455649442E424C4B;
    localparam [63:0] EV_TIMEOUT    = 64'h455649442E544F55;
    localparam [63:0] EV_DONE       = 64'h455649442E444F4E;
    localparam [63:0] EV_HOLD       = 64'h455649442E484F4C;
    localparam [63:0] EV_RESUME     = 64'h455649442E524553;

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

    reg [2:0] state;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state <= SS_IDLE; seq_state <= SS_IDLE;
            current_step <= 0; timeout_count <= 0;
            en_out <= 0; reset_out <= {MAX_RAILS{1'b1}}; evidence_valid <= 0;
        end else begin
            evidence_valid <= 0;
            seq_state <= state;

            case (state)
                SS_IDLE: begin
                    if (seq_start && guard_ok) begin
                        current_step <= 0; timeout_count <= 0;
                        emit_ev(EV_SEQ_START_ID, 32'd0, 32'd0, 96'd0);

                        state <= SS_RUN;
                        emit_ev(EV_STEP_ENT, 32'd0, 32'd0, {88'd0, 8'd0});
                    end else if (seq_start && !guard_ok) begin
                        emit_ev(EV_BLOCKED, 32'd0, 32'd1, {88'd0, 8'd0});
                    end
                end

                SS_RUN: begin
                    timeout_count <= timeout_count + 1;

                    if (seq_hold) begin
                        emit_ev(EV_HOLD, 32'd2, 32'd0, 96'd0);
                        state <= SS_HOLD;
                    end else if (!guard_ok) begin
                        emit_ev(EV_BLOCKED, 32'd2, 32'd1, {88'd0, current_step});
                        state <= SS_FAIL;
                    end else if (step_timeout_fire) begin
                        emit_ev(EV_TIMEOUT, 32'd2, 32'd2, {64'd0, step_timeout[current_step]});
                        state <= SS_FAIL;
                    end else begin
                        // Execute step action
                        case (step_semantic[current_step])
                            ASSERT_EN:     en_out[step_rail[current_step]]    <= 1'b1;
                            DEASSERT_EN:   en_out[step_rail[current_step]]    <= 1'b0;
                            RELEASE_RESET: reset_out[step_rail[current_step]] <= 1'b0;
                            ASSERT_RESET:  reset_out[step_rail[current_step]] <= 1'b1;
                            default: ; // NOP
                        endcase

                        if (step_done) begin
                            emit_ev(EV_STEP_EXT, 32'd2, 32'd0, {64'd0, {24'd0, current_step}});
                            if (current_step >= MAX_STEPS - 1) begin
                                emit_ev(EV_DONE, 32'd2, 32'd0, 96'd0);
                                state <= SS_DONE;
                            end else begin
                                current_step  <= current_step + 1;
                                timeout_count <= 0;
                                emit_ev(EV_STEP_ENT, 32'd2, 32'd0, {88'd0, current_step + 8'd1});
                            end
                        end
                    end
                end

                SS_HOLD: begin
                    if (seq_resume) begin
                        emit_ev(EV_RESUME, 32'd3, 32'd0, 96'd0);
                        state <= SS_RUN;
                    end
                end

                SS_DONE, SS_FAIL: begin
                    if (seq_stop) begin
                        en_out <= 0; reset_out <= {MAX_RAILS{1'b1}}; current_step <= 0;
                        state <= SS_IDLE;
                    end
                end

                default: state <= SS_IDLE;
            endcase
        end
    end

endmodule
`default_nettype wire
