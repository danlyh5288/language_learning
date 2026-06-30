import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

    const account = await screen.findByRole("region", { name: "Account" });
    await user.click(within(account).getByRole("button", { name: /Sign in \/ Sign up/ }));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitemradio", { name: "中文" }));

    expect(await screen.findByRole("heading", { name: "发音词库" })).toBeInTheDocument();
    expect(document.title).toBe("发音词库");
    expect(localStorage.getItem("pronunciation-vault.locale")).toBe("zh");

    unmount();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "发音词库" })).toBeInTheDocument();
  });

  it("resets the recorder timer when starting a new word after saving a recording", async () => {
    const restoreMediaDevices = mockBrowserRecording(1600);
    const user = userEvent.setup();

    try {
      render(<App />);

      await user.click(await screen.findByRole("button", { name: "Add word" }));
      await user.type(screen.getByPlaceholderText("e.g. hello"), "recorded word");
      await user.click(screen.getByRole("button", { name: "Record" }));
      await user.click(await screen.findByRole("button", { name: "Stop" }));

      expect(await screen.findByText("New recording 0:02")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText("Saved")).toBeInTheDocument();
      expect(document.querySelector(".recorder .timer")).toHaveTextContent("0:02");

      await user.click(screen.getByRole("button", { name: "Add word" }));

      expect(screen.getByText("No recording yet")).toBeInTheDocument();
      expect(document.querySelector(".recorder .timer")).toHaveTextContent("0:00");
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      restoreMediaDevices();
    }
  });
});

function mockBrowserRecording(durationMs: number): () => void {
  const originalNow = performance.now.bind(performance);
  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  let startedAt = 0;

  class FakeMediaRecorder extends EventTarget {
    static isTypeSupported = () => true;
    state: "inactive" | "recording" = "inactive";
    mimeType = "audio/webm";

    start() {
      startedAt = originalNow();
      this.state = "recording";
    }

    stop() {
      this.state = "inactive";
      vi.spyOn(performance, "now").mockReturnValue(startedAt + durationMs);
      this.dispatchEvent(new BlobEvent("dataavailable", { data: new Blob(["audio"], { type: this.mimeType }) }));
      this.dispatchEvent(new Event("stop"));
    }
  }

  class FakeAudioContext {
    createMediaStreamSource() {
      return { connect: vi.fn() };
    }

    createAnalyser() {
      return {
        fftSize: 1024,
        getByteTimeDomainData: (samples: Uint8Array) => samples.fill(128)
      };
    }

    close = vi.fn();
  }

  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }]
      }))
    }
  });

  return () => {
    if (originalMediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    } else {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
  };
}
