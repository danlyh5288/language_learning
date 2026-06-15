import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("Pronunciation vault MVP", () => {
  it("renders the seeded local vocabulary and filters by note text", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "发音词库" })).toBeInTheDocument();
    expect(await screen.findByText("侬好")).toBeInTheDocument();
    expect(screen.getByText("辰光")).toBeInTheDocument();

    await user.type(screen.getByLabelText("搜索词条"), "辰光");

    expect(await screen.findByText("1 个词条")).toBeInTheDocument();
    expect(screen.getByText("辰光")).toBeInTheDocument();
    expect(screen.queryByText("侬好")).not.toBeInTheDocument();
  });

  it("creates a word with a new tag and filters it with #tag search", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "添加词条" }));
    await user.type(screen.getByPlaceholderText("例如：侬好"), "谢谢");
    await user.type(screen.getByPlaceholderText("如：第一课"), "问候");
    await user.click(screen.getByRole("button", { name: "新建标签" }));
    await user.type(screen.getByPlaceholderText("记录老师提示、调值、近似音或易错点"), "第二个字轻短，尾音不要上扬。");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("已保存")).toBeInTheDocument();
    const list = screen.getByRole("region", { name: "词条列表" });
    expect(within(list).getByText("谢谢")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "问候1" })).toBeInTheDocument();

    await user.clear(screen.getByLabelText("搜索词条"));
    await user.type(screen.getByLabelText("搜索词条"), "#问候");

    expect(await screen.findByText("1 个词条")).toBeInTheDocument();
    expect(within(list).getByText("谢谢")).toBeInTheDocument();
    expect(within(list).queryByText("侬好")).not.toBeInTheDocument();
  });
});
