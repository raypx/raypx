import { Children, isValidElement, useMemo, useState, type ReactNode } from "react";
import {
  Linking,
  ScrollView,
  Text,
  View,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useThemeColor } from "heroui-native/hooks";
import { Renderer, useMarkdown, type MarkedStyles } from "react-native-marked";
import { useCopy } from "../locale.js";

/** Links only open an explicit public web URL after a member presses them. */
function webLink(value: string): string | null {
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password)
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function linkText(children: string | ReactNode[]): string {
  if (typeof children === "string") return children;
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      if (isValidElement<{ children?: ReactNode }>(child))
        return linkText(Children.toArray(child.props.children));
      return "";
    })
    .join("");
}

class NativeReplyRenderer extends Renderer {
  constructor(
    private readonly options: { openLabel: string; imageLabel: string; open(href: string): void },
  ) {
    super({ selectable: true });
  }

  // Provider content is never interpreted as HTML or registered React components.
  override html(): ReactNode {
    return null;
  }

  override heading(children: string | ReactNode[], styles?: TextStyle): ReactNode {
    return (
      <Text
        key={this.getKey()}
        selectable
        accessibilityRole="header"
        style={styles}
        className="font-semibold text-foreground"
      >
        {children}
      </Text>
    );
  }

  override link(
    children: string | ReactNode[],
    href: string,
    styles?: TextStyle,
    title?: string,
  ): ReactNode {
    const target = webLink(href);
    if (!target)
      return (
        <Text key={this.getKey()} selectable className="text-base text-foreground">
          {children}
        </Text>
      );
    const label = title?.trim() || linkText(children) || target;
    return (
      <Text
        key={this.getKey()}
        selectable
        accessibilityRole="link"
        accessibilityLabel={label}
        accessibilityHint={this.options.openLabel}
        style={styles}
        className="text-base text-foreground underline"
        onPress={() => this.options.open(target)}
      >
        {children}
      </Text>
    );
  }

  // Loading untrusted image URLs would contact third parties without an action.
  override image(_uri: string, alt?: string, _style?: ImageStyle, title?: string): ReactNode {
    const description = alt?.trim() || title?.trim();
    return (
      <Text key={this.getKey()} selectable className="py-2 text-sm text-muted-foreground">
        {this.options.imageLabel}
        {description ? ` · ${description}` : ""}
      </Text>
    );
  }

  override linkImage(
    href: string,
    _imageUrl: string,
    alt?: string,
    _style?: ImageStyle,
    title?: string,
  ): ReactNode {
    return this.link(alt?.trim() || title?.trim() || this.options.imageLabel, href);
  }

  override code(text: string): ReactNode {
    return (
      <ScrollView
        key={this.getKey()}
        horizontal
        className="my-2 rounded-lg bg-default"
        contentContainerClassName="p-3"
      >
        <View>
          <Text selectable className="font-mono text-sm leading-6 text-foreground">
            {text}
          </Text>
        </View>
      </ScrollView>
    );
  }

  // Horizontal scrolling is confined to tables and code on narrow phones.
  override table(
    header: ReactNode[][],
    rows: ReactNode[][][],
    _tableStyle?: ViewStyle,
    _rowStyle?: ViewStyle,
    _cellStyle?: ViewStyle,
  ): ReactNode {
    return (
      <ScrollView key={this.getKey()} horizontal className="my-2">
        <View className="border border-border">
          {[header, ...rows].map((cells, rowIndex) => (
            <View key={rowIndex} className="flex-row border-b border-border">
              {cells.map((cell, cellIndex) => (
                <View key={cellIndex} className="w-48 gap-1 border-r border-border p-2">
                  {cell}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }
}

/** Parse Markdown to native nodes inside the transcript's one virtualized list. */
export function ReplyMarkdown({ text }: { text: string }) {
  const { t } = useCopy();
  const foreground = useThemeColor("foreground");
  const surface = useThemeColor("surface-secondary");
  const border = useThemeColor("separator");
  const [linkError, setLinkError] = useState(false);
  const renderer = useMemo(
    () =>
      new NativeReplyRenderer({
        openLabel: t("mobile.openLink"),
        imageLabel: t("mobile.image"),
        open(href) {
          setLinkError(false);
          void Linking.openURL(href).catch(() => setLinkError(true));
        },
      }),
    [t],
  );
  // The library requires native style objects for parsed inline text nodes.
  const styles = useMemo<MarkedStyles>(
    () => ({
      text: { color: foreground, fontSize: 16, lineHeight: 24 },
      em: { color: foreground },
      strong: { color: foreground },
      strikethrough: { color: foreground },
      paragraph: { paddingVertical: 4 },
      link: { color: foreground, fontStyle: "normal", textDecorationLine: "underline" },
      codespan: {
        color: foreground,
        backgroundColor: surface,
        fontStyle: "normal",
        fontFamily: "monospace",
      },
      li: { color: foreground },
      blockquote: { borderLeftColor: border, borderLeftWidth: 2, paddingLeft: 12 },
      hr: { borderBottomColor: border },
      h1: { color: foreground, borderBottomColor: border, fontSize: 24, lineHeight: 32 },
      h2: { color: foreground, borderBottomColor: border, fontSize: 22, lineHeight: 30 },
      h3: { color: foreground, fontSize: 20, lineHeight: 28 },
      h4: { color: foreground, fontSize: 18, lineHeight: 26 },
      h5: { color: foreground, fontSize: 16, lineHeight: 24 },
      h6: { color: foreground, fontSize: 16, lineHeight: 24 },
    }),
    [foreground, surface, border],
  );
  const elements = useMarkdown(text, { renderer, styles });
  return (
    <View className="min-w-0 gap-1">
      {elements}
      {linkError ? (
        <Text accessibilityRole="alert" className="text-sm text-foreground">
          {t("mobile.linkError")}
        </Text>
      ) : null}
    </View>
  );
}
