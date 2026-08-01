// =============================================================================
// Module  : upasl_domain_engine.v  | Version: 1.3.0
// Purpose : UPASL 6-Domain Engine
// Language: Pure Verilog-2001
// =============================================================================
`timescale 1ns/1ps
`default_nettype none

module upasl_domain_engine #(
    parameter NUM_DOMAINS = 6,
    parameter ADC_WIDTH   = 12
)(
    input  wire clk, rst_n,
    input  wire [ADC_WIDTH-1:0] temp_hotspot, temp_rate,
    input  wire [ADC_WIDTH-1:0] stress_mech, stress_rate,
    input  wire [ADC_WIDTH-1:0] bus_voltage, bus_current, battery_soc,
    input  wire [ADC_WIDTH-1:0] dose_rate, fill_fraction,
    input  wire [31:0]          loop_latency, jitter,
    input  wire [NUM_DOMAINS-1:0] evidence_valid,
    input  wire [31:0] t_max, t_dot_max, h_t_min,
    input  wire [31:0] sigma_max, sigma_dot_max,
    input  wire [31:0] v_min, i_dot_max, soc_min,
    input  wire [31:0] d_max, tau_s_max,
    input  wire [31:0] l_max, j_max,
    output wire [NUM_DOMAINS*3-1:0]  domain_status_flat,
    output wire [NUM_DOMAINS*32-1:0] limit_fraction_flat,
    output reg  [31:0] global_hazard,
    output reg  [31:0] stability_index,
    output reg  [1:0]  decision
);

    localparam SAT  = 3'b001;
    localparam VIOL = 3'b010;
    localparam UND  = 3'b100;
    localparam DEC_REFUSE = 2'b00;
    localparam DEC_LIMIT  = 2'b01;
    localparam DEC_ALLOW  = 2'b10;
    localparam ONE_Q = 32'h0001_0000;

    wire [31:0] temp_hotspot_32, temp_rate_32;
    wire [31:0] stress_mech_32, stress_rate_32;
    wire [31:0] bus_voltage_32, bus_current_32, battery_soc_32;
    wire [31:0] dose_rate_32, fill_fraction_32;
    
    assign temp_hotspot_32 = {{32-ADC_WIDTH{1'b0}}, temp_hotspot};
    assign temp_rate_32    = {{32-ADC_WIDTH{1'b0}}, temp_rate};
    assign stress_mech_32  = {{32-ADC_WIDTH{1'b0}}, stress_mech};
    assign stress_rate_32  = {{32-ADC_WIDTH{1'b0}}, stress_rate};
    assign bus_voltage_32  = {{32-ADC_WIDTH{1'b0}}, bus_voltage};
    assign bus_current_32  = {{32-ADC_WIDTH{1'b0}}, bus_current};
    assign battery_soc_32  = {{32-ADC_WIDTH{1'b0}}, battery_soc};
    assign dose_rate_32    = {{32-ADC_WIDTH{1'b0}}, dose_rate};
    assign fill_fraction_32= {{32-ADC_WIDTH{1'b0}}, fill_fraction};

    wire th_sat, th_und, th_viol;
    wire mc_sat, mc_und, mc_viol;
    wire ep_sat, ep_und, ep_viol;
    wire rd_sat, rd_und, rd_viol;
    wire fl_sat, fl_und, fl_viol;
    wire in_sat, in_und, in_viol;

    assign th_sat  = (temp_hotspot_32 <= t_max) && (temp_rate_32 <= t_dot_max);
    assign th_und  = ~evidence_valid[0];
    assign th_viol = ~th_sat && ~th_und;

    assign mc_sat  = (stress_mech_32 <= sigma_max) && (stress_rate_32 <= sigma_dot_max);
    assign mc_und  = ~evidence_valid[1];
    assign mc_viol = ~mc_sat && ~mc_und;

    assign ep_sat  = (bus_voltage_32 >= v_min) && (bus_current_32 <= i_dot_max) && (battery_soc_32 >= soc_min);
    assign ep_und  = ~evidence_valid[2];
    assign ep_viol = ~ep_sat && ~ep_und;

    assign rd_sat  = (dose_rate_32 <= d_max);
    assign rd_und  = ~evidence_valid[3];
    assign rd_viol = ~rd_sat && ~rd_und;

    assign fl_sat  = (fill_fraction_32 <= tau_s_max);
    assign fl_und  = ~evidence_valid[4];
    assign fl_viol = ~fl_sat && ~fl_und;

    assign in_sat  = (loop_latency <= l_max) && (jitter <= j_max);
    assign in_und  = ~evidence_valid[5];
    assign in_viol = ~in_sat && ~in_und;

    wire any_viol = th_viol | mc_viol | ep_viol | rd_viol | fl_viol | in_viol;
    wire any_und  = th_und  | mc_und  | ep_und  | rd_und  | fl_und  | in_und;

    function [31:0] safe_div_q1616;
        input [31:0] num, den;
    begin
        if (den == 0)
            safe_div_q1616 = 32'hFFFF_FFFF;
        else if (num >= den)
            safe_div_q1616 = ONE_Q;
        else
            safe_div_q1616 = (num * ONE_Q) / den;
    end
    endfunction

    reg [2:0]  ds [0:NUM_DOMAINS-1];
    reg [31:0] lf [0:NUM_DOMAINS-1];
    integer idx;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            global_hazard   <= 32'd0;
            stability_index <= 32'd0;
            decision        <= DEC_REFUSE;
            ds[0] <= SAT; lf[0] <= 32'd0;
            ds[1] <= SAT; lf[1] <= 32'd0;
            ds[2] <= SAT; lf[2] <= 32'd0;
            ds[3] <= SAT; lf[3] <= 32'd0;
            ds[4] <= SAT; lf[4] <= 32'd0;
            ds[5] <= SAT; lf[5] <= 32'd0;
        end else begin
            ds[0] <= th_und ? UND : th_viol ? VIOL : SAT;
            ds[1] <= mc_und ? UND : mc_viol ? VIOL : SAT;
            ds[2] <= ep_und ? UND : ep_viol ? VIOL : SAT;
            ds[3] <= rd_und ? UND : rd_viol ? VIOL : SAT;
            ds[4] <= fl_und ? UND : fl_viol ? VIOL : SAT;
            ds[5] <= in_und ? UND : in_viol ? VIOL : SAT;

            lf[0] <= safe_div_q1616(t_max - temp_hotspot_32, t_max - h_t_min);
            lf[1] <= safe_div_q1616(sigma_max - stress_mech_32, sigma_max);
            lf[2] <= safe_div_q1616(bus_voltage_32 - v_min, 32'hFFFF_FFFF - v_min);
            lf[3] <= safe_div_q1616(d_max - dose_rate_32, d_max);
            lf[4] <= safe_div_q1616(tau_s_max - fill_fraction_32, tau_s_max);
            lf[5] <= safe_div_q1616(l_max - loop_latency, l_max);

            stability_index <= (lf[0] + lf[1] + lf[2] + lf[3] + lf[4] + lf[5]) / NUM_DOMAINS;
            global_hazard <= ONE_Q - stability_index;

            if (any_viol || any_und)
                decision <= DEC_REFUSE;
            else if (stability_index > 32'h0000_8000)
                decision <= DEC_ALLOW;
            else
                decision <= DEC_LIMIT;
        end
    end

    // ✅ CORRECT: Generate block with continuous assignment (= not <=)
    genvar gv;
    generate
        for (gv = 0; gv < NUM_DOMAINS; gv = gv + 1) begin : flatten_outputs
            assign domain_status_flat[gv*3+2 -: 3] = ds[gv];
            assign limit_fraction_flat[gv*32+31 -: 32] = lf[gv];
        end
    endgenerate

endmodule
`default_nettype wire
