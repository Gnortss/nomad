import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const mint = vi.fn(async (_tripId: string) => ({ shareToken: "tok_abc" }));
const rotate = vi.fn(async (_tripId: string) => ({ shareToken: "tok_new" }));
vi.mock("../../src/client/lib/api", () => ({ mintShare: (t: string) => mint(t), rotateShare: (t: string) => rotate(t) }));

import { ShareDialog } from "../../src/client/editor/ShareDialog";

describe("ShareDialog", () => {
  it("mints a token on open and rotates on request", async () => {
    render(<ShareDialog tripId="t1" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/tok_abc/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /rotate/i }));
    await waitFor(() => expect(screen.getByText(/tok_new/)).toBeTruthy());
  });
});
