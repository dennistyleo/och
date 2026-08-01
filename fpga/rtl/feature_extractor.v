// =============================================================================
// Module  : feature_extractor.v  | Version: 1.1.0  | M-08
// Purpose : 64-byte feature vector generation for ML training pipeline.
//           Layout per AI-PMC Spec Section 6.1:
//           Bytes 0–15:  VOUT per rail  (8×12-bit → packed 16-bit Q4.8)
//           Bytes 16–31: IOUT per rail
//           Bytes 32–47: Efficiency (Q8.8), Ripple (mVpp)
//           Bytes 48–63: Temperature, Droop, Overshoot, Settling, Reserved
//
// *** Vivado compatibility fix v1.1 ***
// Ports use FLAT PACKED buses (Verilog-2001) instead of unpacked arrays.
// vout_flat  [95:0]  = {vout[7],vout[6],...,vout[0]}  (8 × ADC_WIDTH bits)
// iout_flat  [95:0]  = {iout[7],...,iout[0]}
// temp_flat  [47:0]  = {temp[3],...,temp[0]}
// eff_flat   [127:0] = {eff[7],...,eff[0]}  (8 × 16 bit)
// rip_flat   [127:0] = {rip[7],...,rip[0]}
// =============================================================================
`timescale 1ns/1ps
`default_nettype none

module FeatureExtractor #(
    parameter NUM_FEATURES = 64,
    parameter ADC_WIDTH    = 12
)(
    input  wire        clk, rst_n,
    // ── Flattened sensor buses (Verilog-2001 compatible) ─────────────────────
    // vout_flat[ADC_WIDTH*8-1:0] = {vout[7], vout[6], ... vout[0]}
    input  wire [ADC_WIDTH*8-1:0] vout_flat,
    input  wire [ADC_WIDTH*8-1:0] iout_flat,
    input  wire [ADC_WIDTH*4-1:0] temp_flat,
    input  wire [127:0]           eff_flat,    // 8 × 16-bit efficiency Q8.8
    input  wire [127:0]           rip_flat,    // 8 × 16-bit ripple mVpp
    // Scalar transient metrics
    input  wire [15:0] droop_mv, overshoot_mv, settling_us,
    // Control
    input  wire        capture,
    // Output (512 bits = 64 bytes)
    output reg  [511:0] feature_vector,
    output reg          feature_valid,
    input  wire         feature_ready
);

    // ── Unpack helper function: extract one ADC_WIDTH-bit lane ──────────────
    // Lane 0 is at the LSB of the flat bus.
    function [15:0] adc_lane_fp16;
        input [ADC_WIDTH*8-1:0] bus;
        input integer           lane;
        reg   [ADC_WIDTH-1:0]   raw;
    begin
        raw         = bus[lane*ADC_WIDTH +: ADC_WIDTH];
        adc_lane_fp16 = {4'b0000, raw};       // zero-pad to 16 bits (Q4.8)
    end
    endfunction

    function [15:0] adc4_lane_fp16;
        input [ADC_WIDTH*4-1:0] bus;
        input integer           lane;
        reg   [ADC_WIDTH-1:0]   raw;
    begin
        raw            = bus[lane*ADC_WIDTH +: ADC_WIDTH];
        adc4_lane_fp16 = {4'b0000, raw};
    end
    endfunction

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            feature_vector <= 512'd0;
            feature_valid  <= 1'b0;
        end else begin
            feature_valid <= 1'b0;   // default de-assert

            if (capture && feature_ready) begin
                // ── VOUT lanes 0–7 (bits 511:384) ────────────────────────────
                feature_vector[511:496] <= adc_lane_fp16(vout_flat, 7);
                feature_vector[495:480] <= adc_lane_fp16(vout_flat, 6);
                feature_vector[479:464] <= adc_lane_fp16(vout_flat, 5);
                feature_vector[463:448] <= adc_lane_fp16(vout_flat, 4);
                feature_vector[447:432] <= adc_lane_fp16(vout_flat, 3);
                feature_vector[431:416] <= adc_lane_fp16(vout_flat, 2);
                feature_vector[415:400] <= adc_lane_fp16(vout_flat, 1);
                feature_vector[399:384] <= adc_lane_fp16(vout_flat, 0);
                // ── IOUT lanes 0–7 (bits 383:256) ────────────────────────────
                feature_vector[383:368] <= adc_lane_fp16(iout_flat, 7);
                feature_vector[367:352] <= adc_lane_fp16(iout_flat, 6);
                feature_vector[351:336] <= adc_lane_fp16(iout_flat, 5);
                feature_vector[335:320] <= adc_lane_fp16(iout_flat, 4);
                feature_vector[319:304] <= adc_lane_fp16(iout_flat, 3);
                feature_vector[303:288] <= adc_lane_fp16(iout_flat, 2);
                feature_vector[287:272] <= adc_lane_fp16(iout_flat, 1);
                feature_vector[271:256] <= adc_lane_fp16(iout_flat, 0);
                // ── Efficiency (bits 255:128) — pass-through, already 16-bit─
                feature_vector[255:128] <= eff_flat;
                // ── Ripple + Temp + Transient (bits 127:0) ─────────────────
                // ANOM-006 FIX: Removed dead first write. Single authoritative
                // write per spec/25_aipmc_rtl_spec.md §5.6 feature vector layout.
                feature_vector[127:0] <= {
                    rip_flat[127:120],       // ripple[7] lane MSB byte only
                    rip_flat[111:104],
                    rip_flat[95:88],
                    rip_flat[79:72],
                    rip_flat[63:56],
                    rip_flat[47:40],
                    rip_flat[31:24],
                    rip_flat[15:8],          // 8 ripple MSB bytes
                    adc4_lane_fp16(temp_flat, 3),
                    adc4_lane_fp16(temp_flat, 2),
                    adc4_lane_fp16(temp_flat, 1),
                    adc4_lane_fp16(temp_flat, 0),
                    droop_mv,
                    overshoot_mv,
                    settling_us,
                    16'd0
                };
                feature_valid <= 1'b1;
            end
        end
    end

endmodule
`default_nettype wire
