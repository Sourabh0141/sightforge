import { describe, it, expect } from "vitest";
import * as UI from "./index";

describe("@sightforge/ui Component Exports (P4 U1)", () => {
  it("exports all expected design system primitives and components", () => {
    expect(UI.Button).toBeDefined();
    expect(UI.Card).toBeDefined();
    expect(UI.StatusPill).toBeDefined();
    expect(UI.Skeleton).toBeDefined();
    expect(UI.JobListSkeleton).toBeDefined();
    expect(UI.ResultViewerSkeleton).toBeDefined();
    expect(UI.EmptyState).toBeDefined();
    expect(UI.ErrorBanner).toBeDefined();
    expect(UI.ReconnectingBanner).toBeDefined();
    expect(UI.CapacityState).toBeDefined();
    expect(UI.Sidebar).toBeDefined();
    expect(UI.BottomNav).toBeDefined();
    expect(UI.TopBar).toBeDefined();
    expect(UI.AppShell).toBeDefined();
    expect(UI.TurnstileWidget).toBeDefined();
  });
});
