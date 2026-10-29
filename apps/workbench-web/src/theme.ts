import type { ThemeConfig } from "antd";

/**
 * Palette. Two colors carry meaning everywhere: amber = the ball is with you (a Human must act),
 * teal = the Agent is working. Indigo is only for ordinary interaction.
 */
export const palette = {
  ink: "#161A33",
  ink2: "#2B3156",
  porcelain: "#F1F2F5",
  surface: "#FFFFFF",
  line: "#E3E5EC",
  muted: "#6A7090",
  indigo: "#3A4BD8",
  amber: "#D48A1E",
  amberSoft: "#FBF1E1",
  teal: "#0E8F86",
  tealSoft: "#E2F4F2",
  success: "#2E8A57",
  danger: "#C2433B"
};

export const fontSans = `"IBM Plex Sans", "PingFang SC", "HarmonyOS Sans SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif`;
export const fontMono = `"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;

export const theme: ThemeConfig = {
  token: {
    colorPrimary: palette.indigo,
    colorInfo: palette.indigo,
    colorSuccess: palette.success,
    colorWarning: palette.amber,
    colorError: palette.danger,
    colorTextBase: palette.ink,
    colorBgLayout: palette.porcelain,
    colorBorderSecondary: palette.line,
    fontFamily: fontSans,
    fontFamilyCode: fontMono,
    fontSize: 14,
    borderRadius: 8,
    borderRadiusLG: 12,
    controlHeight: 34,
    wireframe: false
  },
  components: {
    Layout: { siderBg: palette.ink, headerBg: "transparent", bodyBg: palette.porcelain },
    Menu: {
      darkItemBg: palette.ink, darkItemSelectedBg: "rgba(255,255,255,0.08)", darkItemSelectedColor: "#FFFFFF",
      darkItemColor: "rgba(255,255,255,0.62)", darkItemHoverColor: "#FFFFFF", itemBorderRadius: 8, itemHeight: 40
    },
    Card: { headerFontSize: 15, paddingLG: 20 },
    Tabs: { titleFontSize: 14, horizontalItemGutter: 28 },
    Table: { headerBg: "transparent", headerColor: palette.muted, headerSplitColor: "transparent", rowHoverBg: "#F7F8FB" },
    Button: { primaryShadow: "none", defaultShadow: "none" },
    Tag: { defaultBg: "#F4F5F8" },
    Descriptions: { labelBg: "transparent" }
  }
};
