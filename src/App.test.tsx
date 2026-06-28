import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("Pronunciation vault MVP", () => {
  it("renders the seeded local vocabulary and filters by note text", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Pronunciation Vault" })).toBeInTheDocument();
    expect(document.title).toBe("Pronunciation Vault");
    expect(await screen.findByText("侬好")).toBeInTheDocument();
    expect(screen.getByText("辰光")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search words"), "辰光");

    expect(await screen.findByText("1 word")).toBeInTheDocument();
    expect(screen.getByText("辰光")).toBeInTheDocument();
    expect(screen.queryByText("侬好")).not.toBeInTheDocument();
  });

  it("creates a word with a new tag and filters it with #tag search", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Add word" }));
    await user.type(screen.getByPlaceholderText("e.g. hello"), "谢谢");
    await user.type(screen.getByPlaceholderText("e.g. Lesson 1"), "问候");
    await user.click(screen.getByRole("button", { name: "Create tag" }));
    await user.type(screen.getByPlaceholderText("Record teacher tips, tone values, similar sounds, or common mistakes"), "第二个字轻短，尾音不要上扬。");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    const list = screen.getByRole("region", { name: "Word list" });
    expect(within(list).getByText("谢谢")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "问候1" })).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Search words"));
    await user.type(screen.getByLabelText("Search words"), "#问候");

    expect(await screen.findByText("1 word")).toBeInTheDocument();
    expect(within(list).getByText("谢谢")).toBeInTheDocument();
    expect(within(list).queryByText("侬好")).not.toBeInTheDocument();
  });

  it("switches to Chinese and persists the selected locale", async () => {
    const user = userEvent.setup();

    const { unmount } = render(<App />);

    await user.click(await screen.findByRole("button", { name: "中文" }));

    expect(await screen.findByRole("heading", { name: "发音词库" })).toBeInTheDocument();
    expect(document.title).toBe("发音词库");
    expect(localStorage.getItem("pronunciation-vault.locale")).toBe("zh");

    unmount();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "发音词库" })).toBeInTheDocument();
  });
});
