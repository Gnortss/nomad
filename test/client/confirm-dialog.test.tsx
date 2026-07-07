import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { ConfirmDialog } from "../../src/client/components/ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders title, body and fires onConfirm", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog title={'Delete "Iceland"?'} body="This removes everything." confirmLabel="Delete trip" onConfirm={onConfirm} onCancel={() => {}} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText('Delete "Iceland"?')).toBeTruthy();
    expect(screen.getByText("This removes everything.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete trip" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("fires onCancel from the Cancel button", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog title="Sure?" confirmLabel="Yes" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
