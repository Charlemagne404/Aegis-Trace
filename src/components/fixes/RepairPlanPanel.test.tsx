import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getSupplementalRepairOptions } from "@/core/fixRegistry";
import { createScenarioScanResult } from "@/core/diagnosticScenarios";
import { RepairPlanPanel } from "./RepairPlanPanel";

describe("RepairPlanPanel", () => {
  it("reveals scan-derived alternatives and guarded last-resort repairs", () => {
    const scan = createScenarioScanResult("gateway-unreachable");
    const options = getSupplementalRepairOptions(scan, "windows");
    const onRunFix = vi.fn();

    render(
      <RepairPlanPanel
        diagnosis={scan.diagnosis}
        fixResult={null}
        isScanning={false}
        fixesEnabled
        scanActionEnabled
        additionalFixes={options.alternatives}
        advancedFixes={options.advanced}
        onRunFix={onRunFix}
        onRunScan={vi.fn()}
      />
    );

    expect(screen.getByText("More ways to try")).toBeInTheDocument();
    expect(screen.queryByText("Last-resort repairs")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show additional options/i }));

    expect(screen.getByText("Reconnect to current Wi-Fi")).toBeInTheDocument();
    expect(screen.getByText("Last-resort repairs")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /reconnect wi-fi/i }));
    expect(onRunFix).toHaveBeenCalledWith(
      expect.objectContaining({ id: "reconnect-wifi" })
    );
  });
});
