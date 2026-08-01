// =============================================================================
// Module  : axi_slave_interface.v  | Version: 1.1.0
// Purpose : AXI4-Lite register file (0x0000–0x7FFF) + AXI4-Stream passthrough
// Ref     : AI-PMC Spec Section 3 register map
// =============================================================================
`timescale 1ns/1ps
`default_nettype none

module AXI_SlaveInterface #(parameter BASE_ADDR = 32'h4000_0000)(
    input  wire        clk, rst_n,
    // AXI4-Lite
    input  wire [31:0] s_axi_awaddr,  input  wire s_axi_awvalid, output reg  s_axi_awready,
    input  wire [31:0] s_axi_wdata,   input  wire [3:0] s_axi_wstrb,
    input  wire        s_axi_wvalid,  output reg  s_axi_wready,
    output reg  [1:0]  s_axi_bresp,   output reg  s_axi_bvalid,  input  wire s_axi_bready,
    input  wire [31:0] s_axi_araddr,  input  wire s_axi_arvalid, output reg  s_axi_arready,
    output reg  [31:0] s_axi_rdata,   output reg  [1:0] s_axi_rresp,
    output reg         s_axi_rvalid,  input  wire s_axi_rready,
    // AXI4-Stream
    input  wire [63:0] s_axis_tdata,  input  wire s_axis_tvalid, output wire s_axis_tready,
    output wire [63:0] m_axis_tdata,  output wire m_axis_tvalid, input  wire m_axis_tready,
    // ── Read-only status inputs from engines ──────────────────────────────────
    input  wire [31:0] prime_count, semantic_dist, error_code,
    input  wire [63:0] runtime_cycles,
    input  wire [31:0] global_hazard, stability_index,
    input  wire [1:0]  upasl_decision,
    input  wire [31:0] invariant_violations,
    input  wire [2:0]  gov_state, seq_state,
    input  wire [7:0]  current_seq_step,
    input  wire [31:0] gov_fault_cause,
    input  wire [9:0]  ev_fifo_count,
    input  wire        atp_pass,
    input  wire [31:0] atp_fail_reason,
    input  wire [63:0] feature_vector_lsw,
    input  wire [17:0] domain_status_flat,   // {status[5],status[4],...status[0]} each 3-bit
    // ── Decomposer/Groebner status ────────────────────────────────────────────
    input  wire        decomp_done,
    // ── Writable config outputs to engines ────────────────────────────────────
    output reg  [31:0] control_reg,
    output reg  [31:0] axiom_base_addr, result_base_addr, target_addr,
    output reg  [31:0] t_max, t_dot_max, h_t_min,
    output reg  [31:0] sigma_max, sigma_dot_max, d_m_max,
    output reg  [31:0] v_min, i_dot_max, soc_min, p_margin_min,
    output reg  [31:0] d_max, d_dot_max, r_see_max,
    output reg  [31:0] tau_s_max, pi_max, l_max, j_max,
    output reg  [31:0] gov_profile_id, gov_timeout_ms, gov_thresholds,
    output reg  [31:0] gov_hysteresis, gov_allowed_actions,
    output reg         seq_start_cmd, seq_stop_cmd, seq_hold_cmd, seq_resume_cmd,
    output reg  [7:0]  atp_test_id,
    output reg         atp_inject_cmd, atp_check_cmd,
    output reg         ml_capture
);

    // ── Flat register file: 64 words × 32 bit ────────────────────────────────
    // Indices: 0x00–0x0F core | 0x40–0x4F gov | 0x80–0x8F ev | 0xC0 gov_fsm
    //          0x100 seq | 0x140 atp | 0x180 upasl | 0x1C0 feature
    reg [31:0] RF [0:255];  // word-addressed shadow register file

    // ── AXI decode helpers ────────────────────────────────────────────────────
    wire [12:0] wr_reg = s_axi_awaddr[14:2];  // word index from byte address
    wire [12:0] rd_reg = s_axi_araddr[14:2];

    // ── Write channel ─────────────────────────────────────────────────────────
    reg aw_pend, w_pend;
    reg [12:0] aw_addr_r;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            s_axi_awready <= 0; s_axi_wready <= 0; s_axi_bvalid <= 0;
            aw_pend <= 0; w_pend <= 0; aw_addr_r <= 0;
            control_reg <= 0;
            axiom_base_addr <= 0; result_base_addr <= 0; target_addr <= 0;
            t_max <= 32'd1200; t_dot_max <= 32'd50; h_t_min <= 32'd20;
            sigma_max <= 32'd1000; sigma_dot_max <= 32'd100; d_m_max <= 32'd50;
            v_min <= 32'd3000; i_dot_max <= 32'd2000; soc_min <= 32'd200; p_margin_min <= 32'd500;
            d_max <= 32'd100; d_dot_max <= 32'd10; r_see_max <= 32'd5;
            tau_s_max <= 32'd3200; pi_max <= 32'd4000; l_max <= 32'd1000; j_max <= 32'd200;
            gov_profile_id <= 0; gov_timeout_ms <= 32'd1000;
            gov_thresholds <= 0; gov_hysteresis <= 0; gov_allowed_actions <= 32'hFF;
            atp_test_id <= 0;
            // FIX Bug 7: registered command strobes reset to 0
            seq_start_cmd <= 0; seq_stop_cmd <= 0;
            seq_hold_cmd  <= 0; seq_resume_cmd <= 0;
            atp_inject_cmd <= 0; atp_check_cmd <= 0;
            ml_capture <= 0;
        end else begin
            // Accept AW
            if (s_axi_awvalid && !aw_pend) begin s_axi_awready <= 1; aw_pend <= 1; aw_addr_r <= s_axi_awaddr[14:2]; end
            else s_axi_awready <= 0;
            // Accept W
            if (s_axi_wvalid && !w_pend)  begin s_axi_wready  <= 1; w_pend  <= 1; end
            else s_axi_wready <= 0;
            // Commit write when both pending
            if (aw_pend && w_pend) begin
                RF[aw_addr_r[7:0]] <= s_axi_wdata;
                // Shadow decode
                // Sector-based shadow decode (Word-indexed bases: 0x000, 0x400, 0x1000, 0x1400)
                case (aw_addr_r[12:2])
                    11'h000: case (aw_addr_r[1:0]) // 0x0000 core
                        2'd1: control_reg <= s_axi_wdata;
                        default:;
                    endcase
                    11'h002: case (aw_addr_r[4:0]) // 0x0008+ core config
                        5'd0: axiom_base_addr <= s_axi_wdata;
                        5'd1: result_base_addr <= s_axi_wdata;
                        5'd2: target_addr <= s_axi_wdata;
                        default:;
                    endcase
                    11'h100: case (aw_addr_r[3:0]) // 0x1000 governance config
                        4'd0: gov_profile_id <= s_axi_wdata;
                        4'd1: gov_timeout_ms <= s_axi_wdata;
                        4'd2: gov_thresholds <= s_axi_wdata;
                        4'd3: gov_hysteresis <= s_axi_wdata;
                        4'd4: gov_allowed_actions <= s_axi_wdata;
                        default:;
                    endcase
                    11'h400: case (aw_addr_r[3:0]) // 0x4000 sequencing
                        4'd1: RF[8'hd0] <= s_axi_wdata; // SEQ_CMD
                        4'd3: RF[8'hd3] <= s_axi_wdata; // SEQ_TIMEOUT_MS
                        default:;
                    endcase
                    11'h500: if (aw_addr_r[3:0] == 4'd0) atp_test_id <= s_axi_wdata[7:0]; // 0x5000 ATP
                    default:;
                endcase
                // FIX Bug 7: register command strobes on the commit edge
                seq_start_cmd  <= s_axi_wdata[0] && (aw_addr_r[12:0] == 13'h1001);
                seq_stop_cmd   <= s_axi_wdata[1] && (aw_addr_r[12:0] == 13'h1001);
                seq_hold_cmd   <= s_axi_wdata[2] && (aw_addr_r[12:0] == 13'h1001);
                seq_resume_cmd <= s_axi_wdata[3] && (aw_addr_r[12:0] == 13'h1001);
                atp_inject_cmd <= (aw_addr_r[12:0] == 13'h1400);
                atp_check_cmd  <= (aw_addr_r[12:0] == 13'h1401);
                ml_capture     <= s_axi_wdata[4] && (aw_addr_r[12:0] == 13'h001);
                aw_pend <= 0; w_pend <= 0; s_axi_bvalid <= 1; s_axi_bresp <= 2'b00;
            end else begin
                // De-assert command strobes after 1 cycle
                seq_start_cmd <= 0; seq_stop_cmd <= 0;
                seq_hold_cmd  <= 0; seq_resume_cmd <= 0;
                atp_inject_cmd <= 0; atp_check_cmd <= 0;
                ml_capture <= 0;
                if (s_axi_bvalid && s_axi_bready) s_axi_bvalid <= 0;
            end
        end
    end

    // ── Read channel ──────────────────────────────────────────────────────────
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin s_axi_arready <= 0; s_axi_rvalid <= 0; s_axi_rdata <= 0; end
        else begin
            s_axi_arready <= s_axi_arvalid;
            if (s_axi_arvalid) begin
                s_axi_rvalid <= 1; s_axi_rresp <= 2'b00;
                case (s_axi_araddr[14:2])
                        // 0x0000 core
                        13'h000: s_axi_rdata <= {29'd0, ~(|prime_count), decomp_done, 1'b0};
                        13'h001: s_axi_rdata <= control_reg;
                        13'h004: s_axi_rdata <= prime_count;
                        13'h005: s_axi_rdata <= semantic_dist;
                        13'h006: s_axi_rdata <= runtime_cycles[31:0];
                        13'h007: s_axi_rdata <= runtime_cycles[63:32];
                        13'h00B: s_axi_rdata <= error_code;
                        // 0x1000 governance config
                        13'h400: s_axi_rdata <= gov_profile_id;
                        13'h401: s_axi_rdata <= gov_timeout_ms;
                        13'h402: s_axi_rdata <= gov_thresholds;
                        13'h403: s_axi_rdata <= gov_hysteresis;
                        13'h404: s_axi_rdata <= gov_allowed_actions;
                        // 0x2000 evidence FIFO
                        13'h801: s_axi_rdata <= {22'd0, ev_fifo_count};
                        // 0x3000 governance FSM
                        13'hC00: s_axi_rdata <= {29'd0, gov_state};
                        13'hC01: s_axi_rdata <= gov_fault_cause;
                        // 0x4000 sequencing
                        13'h1000: s_axi_rdata <= {29'd0, seq_state};
                        13'h1002: s_axi_rdata <= {24'd0, current_seq_step};
                        // 0x5000 ATP
                        13'h1401: s_axi_rdata <= {31'd0, atp_pass};
                        13'h1402: s_axi_rdata <= atp_fail_reason;
                        // 0x6000 UPASL per-domain status (3-bit SAT=1/VIOL=2/UND=4)
                        13'h1800: s_axi_rdata <= {29'd0, domain_status_flat[2:0]};   // Thermal
                        13'h1801: s_axi_rdata <= {29'd0, domain_status_flat[5:3]};   // Mech
                        13'h1802: s_axi_rdata <= {29'd0, domain_status_flat[8:6]};   // EPS
                        13'h1803: s_axi_rdata <= {29'd0, domain_status_flat[11:9]};  // Radiation
                        13'h1804: s_axi_rdata <= {29'd0, domain_status_flat[14:12]}; // Fluid
                        13'h1805: s_axi_rdata <= {29'd0, domain_status_flat[17:15]}; // Info
                        13'h1806: s_axi_rdata <= global_hazard;
                        13'h1807: s_axi_rdata <= stability_index;
                        13'h1808: s_axi_rdata <= {30'd0, upasl_decision};
                        // 0x7000 feature extractor
                        13'h1C00: s_axi_rdata <= feature_vector_lsw[31:0];
                        13'h1C01: s_axi_rdata <= feature_vector_lsw[63:32];
                        // 0x7040 OCH (Ontology Compliance Healthcare)
                        13'h1C10: s_axi_rdata <= 32'h0; // och_decision
                        13'h1C11: s_axi_rdata <= 32'h0; // och_castelli
                        13'h1C12: s_axi_rdata <= 32'h0; // och_sofa
                        default: s_axi_rdata <= 32'hDEADBEEF;
                    endcase
            end else if (s_axi_rready) s_axi_rvalid <= 0;
        end
    end

    // ── AXI-Stream passthrough ─────────────────────────────────────────────────
    assign s_axis_tready = m_axis_tready;
    assign m_axis_tdata  = s_axis_tdata;
    assign m_axis_tvalid = s_axis_tvalid;
    // Command strobes are now registered outputs (Bug 7 fix above — assigns removed)

endmodule
`default_nettype wire
