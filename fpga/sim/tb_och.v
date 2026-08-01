// =============================================================================
// Testbench: tb_och.v
// Project  : Sovereign Matrix — OCH (Ontology Compliance Healthcare)
// Purpose  : Verilog simulation testbench for och.v hardware module.
// =============================================================================
`timescale 1ns/1ps
`default_nettype none

module tb_och;

    parameter NUM_BIOMARKERS = 16;
    parameter DATA_WIDTH     = 32;

    reg clk;
    reg rst_n;
    reg start;
    reg enable;

    reg [NUM_BIOMARKERS*DATA_WIDTH-1:0] biomarkers_flat;
    reg [NUM_BIOMARKERS-1:0]           biomarkers_valid;

    wire busy;
    wire valid;
    wire [1:0] decision;
    wire [DATA_WIDTH-1:0] castelli_index;
    wire [7:0] sofa_score;
    wire hazard_flag;
    wire irq_out;

    // Unit Under Test (UUT)
    och #(
        .NUM_BIOMARKERS(NUM_BIOMARKERS),
        .DATA_WIDTH(DATA_WIDTH)
    ) uut (
        .clk(clk),
        .rst_n(rst_n),
        .start(start),
        .enable(enable),
        .biomarkers_flat(biomarkers_flat),
        .biomarkers_valid(biomarkers_valid),
        .busy(busy),
        .valid(valid),
        .decision(decision),
        .castelli_index(castelli_index),
        .sofa_score(sofa_score),
        .hazard_flag(hazard_flag),
        .irq_out(irq_out)
    );

    // Clock Generation (100 MHz -> 10ns period)
    always #5 clk = ~clk;

    // Test Procedure
    initial begin
        $display("[TB_OCH] Starting OCH Verilog RTL Simulation...");
        clk   = 0;
        rst_n = 0;
        start = 0;
        enable = 0;
        biomarkers_flat = 0;
        biomarkers_valid = 0;

        #20 rst_n = 1;
        #10 enable = 1;

        // ── Test Case 1: Normal Biomarkers (DEC_ALLOW) ────────────────────────
        $display("[TB_OCH] Test Case 1: Normal Biomarker Payload");
        // Glucose: 90 mg/dL (90 << 16 = 32'h005A0000)
        // Creatinine: 0.9 mg/dL (0.9 * 65536 = 58982 = 32'h0000E666)
        // Troponin: 0.01 ng/mL (0.01 * 65536 = 655 = 32'h0000028F)
        // BP Systolic: 120 mmHg (120 << 16 = 32'h00780000)
        biomarkers_flat = 0;
        biomarkers_flat[0*32 +: 32] = 32'h005A_0000;
        biomarkers_flat[2*32 +: 32] = 32'h0000_E666;
        biomarkers_flat[3*32 +: 32] = 32'h0000_028F;
        biomarkers_flat[4*32 +: 32] = 32'h0078_0000;
        biomarkers_valid = 16'hFFFF;

        #10 start = 1;
        #10 start = 0;

        // Wait for valid output
        wait(valid == 1);
        #5;
        $display("[TB_OCH] Test 1 Result: decision=%b (expected 10: ALLOW), sofa=%d, hazard=%b",
                 decision, sofa_score, hazard_flag);
        if (decision !== 2'b10) begin
            $display("[TB_OCH][FAIL] Test 1 Expected DEC_ALLOW (2'b10), got %b", decision);
            $finish;
        end

        // ── Test Case 2: Cardiac Hazard / Elevated Troponin (DEC_REFUSE) ───────
        #20;
        $display("[TB_OCH] Test Case 2: Severe Cardiac Hazard Payload");
        // Troponin: 0.50 ng/mL -> 32'h0000_8000 (exceeds threshold 0.04)
        biomarkers_flat[3*32 +: 32] = 32'h0000_8000;

        #10 start = 1;
        #10 start = 0;

        wait(valid == 1);
        #5;
        $display("[TB_OCH] Test 2 Result: decision=%b (expected 00: REFUSE), sofa=%d, hazard=%b, irq=%b",
                 decision, sofa_score, hazard_flag, irq_out);
        if (decision !== 2'b00 || hazard_flag !== 1'b1) begin
            $display("[TB_OCH][FAIL] Test 2 Expected DEC_REFUSE (2'b00) and hazard_flag=1", decision);
            $finish;
        end

        $display("[TB_OCH] ALL OCH RTL VERILOG TESTS PASSED SUCCESSFULLY!");
        $finish;
    end

endmodule
`default_nettype wire
