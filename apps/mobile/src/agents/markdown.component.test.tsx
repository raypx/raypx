import { beforeEach, describe, expect, it, vi } from "vitest";
import { Image, Linking } from "../../tests/mocks/react-native.js";
import { findByLabel, press, renderNative, textContent } from "../../tests/native.js";
import { ReplyMarkdown } from "./markdown.js";

beforeEach(() => vi.clearAllMocks());

describe("native reply Markdown", () => {
  it("renders Markdown into native text without nesting another virtualized list", async () => {
    const view = await renderNative(
      <ReplyMarkdown
        text={
          "# Reading\n\nA **useful** reply.\n\n- First\n- Second\n\n```ts\nconst answer = 42;\n```"
        }
      />,
    );
    expect(textContent(view.root)).toContain("Reading");
    expect(textContent(view.root)).toContain("A useful reply.");
    expect(textContent(view.root)).toContain("const answer = 42;");
    expect(textContent(view.root)).toContain("First");
    expect(textContent(view.root)).toContain("Second");
    expect(textContent(view.root)).not.toContain("**");
    expect(view.root.findAll((node) => String(node.type) === "FlatList")).toHaveLength(0);
    expect(
      view.root.findAll((node) => String(node.type) === "ScrollView" && node.props.horizontal),
    ).toHaveLength(1);
    await view.unmount();
  });

  it("opens web links only on a member press and rejects active or local schemes", async () => {
    const text =
      "[Read](https://example.com/guide) [Bad](javascript:alert(1)) [File](file:///private/info) [Data](data:text/html,test)";
    const view = await renderNative(<ReplyMarkdown text={text} />);
    expect(Linking.openURL).not.toHaveBeenCalled();
    const read = findByLabel(view.root, "Read");
    expect(read.props.accessibilityRole).toBe("link");
    await press(read);
    expect(Linking.openURL).toHaveBeenCalledExactlyOnceWith("https://example.com/guide");
    const links = view.root.findAll(
      (node) => typeof node.type === "string" && node.props.accessibilityRole === "link",
    );
    expect(links).toHaveLength(1);
    await view.unmount();
  });

  it("suppresses HTML and displays image descriptions without loading untrusted images", async () => {
    const view = await renderNative(
      <ReplyMarkdown
        text={
          "<script>untrusted-script</script>\n\n![A diagram](https://third-party.example/image.png)\n\nSafe text."
        }
      />,
    );
    expect(textContent(view.root)).not.toContain("untrusted-script");
    expect(textContent(view.root)).toContain("A diagram");
    expect(textContent(view.root)).toContain("Safe text.");
    expect(view.root.findAll((node) => String(node.type) === "Image")).toHaveLength(0);
    expect(view.root.findAll((node) => String(node.type) === "SvgFromXml")).toHaveLength(0);
    expect(Image.getSize).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("keeps HTML and links inside fenced code as literal text", async () => {
    const code = "<script>literal()</script>\n[Read](https://example.com)";
    const view = await renderNative(<ReplyMarkdown text={`\`\`\`html\n${code}\n\`\`\``} />);
    const block = view.root.find(
      (node) => String(node.type) === "ScrollView" && node.props.horizontal,
    );
    expect(textContent(block)).toBe(code);
    expect(block.findAll((node) => node.props.accessibilityRole === "link")).toHaveLength(0);
    expect(Linking.openURL).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("reports link-opening failures without exposing the target in the error", async () => {
    vi.mocked(Linking.openURL).mockRejectedValueOnce(new Error("OS could not open"));
    const view = await renderNative(<ReplyMarkdown text="[Read](https://example.com)" />);
    await press(findByLabel(view.root, "Read"));
    expect(textContent(view.root)).toContain("Could not open the link.");
    await view.unmount();
  });
});
