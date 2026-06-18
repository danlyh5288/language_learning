import { StyleSheet } from "react-native";

export const colors = {
  bg: "#f5f7f6",
  surface: "#ffffff",
  surfaceMuted: "#eef4f1",
  surfaceSelected: "#eaf6f0",
  text: "#18211f",
  muted: "#66736f",
  faint: "#8a9692",
  border: "#dbe4e0",
  borderStrong: "#c8d5cf",
  primary: "#0f7b5f",
  primaryStrong: "#095f49",
  primarySoft: "#dff3eb",
  danger: "#c24132",
  dangerSoft: "#fce8e5",
  warning: "#b45309",
  warningSoft: "#fff7ed"
};

export const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: colors.bg
  },
  cloudBar: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface
  },
  cloudStatusText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  cloudRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  cloudEmail: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 13,
    fontWeight: "700"
  },
  cloudAuthRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8
  },
  cloudInput: {
    minWidth: 128,
    flexGrow: 1,
    minHeight: 38,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    backgroundColor: "#f7faf8"
  },
  cloudButton: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.primarySoft
  },
  cloudButtonDisabled: {
    backgroundColor: "#e8efec"
  },
  cloudButtonText: {
    color: colors.primaryStrong,
    fontSize: 13,
    fontWeight: "800"
  },
  cloudErrorText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "700"
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg
  },
  safeArea: {
    flex: 1
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14
  },
  brandCluster: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: 10
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 8
  },
  appTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800"
  },
  appSubtitle: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600"
  },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted
  },
  dangerIconButton: {
    backgroundColor: colors.dangerSoft
  },
  primaryButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.primary
  },
  primaryButtonDisabled: {
    backgroundColor: "#96b0a8"
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  },
  secondaryButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 13,
    borderRadius: 8,
    backgroundColor: colors.primarySoft
  },
  secondaryButtonText: {
    color: colors.primaryStrong,
    fontSize: 14,
    fontWeight: "800"
  },
  searchBox: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: "#f7faf8"
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 9
  },
  filterRail: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8
  },
  chip: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginRight: 8,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  chipActive: {
    backgroundColor: colors.surfaceSelected,
    borderColor: "#b9ddcf"
  },
  chipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800"
  },
  chipTextActive: {
    color: colors.primaryStrong
  },
  countPill: {
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
    color: colors.muted,
    backgroundColor: "#edf2f0",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center"
  },
  listMeta: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  wordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  playButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#edf7f3"
  },
  playButtonDisabled: {
    backgroundColor: "#eef2f0"
  },
  wordMain: {
    flex: 1,
    minWidth: 0
  },
  wordTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8
  },
  wordTitle: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: "800"
  },
  duration: {
    color: colors.faint,
    fontSize: 12,
    fontWeight: "700"
  },
  notePreview: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  miniTag: {
    alignSelf: "flex-start",
    maxWidth: 96,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#f1f5f9",
    fontSize: 12,
    fontWeight: "800"
  },
  centeredState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center"
  },
  mutedText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  detailScroll: {
    flex: 1
  },
  detailCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface
  },
  detailTitle: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800"
  },
  field: {
    gap: 7,
    marginBottom: 15
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800"
  },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    backgroundColor: "#fbfdfc",
    fontSize: 15
  },
  textArea: {
    minHeight: 118,
    textAlignVertical: "top",
    lineHeight: 21
  },
  inlineCreate: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  inlineCreateInput: {
    flex: 1
  },
  inlineWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#fed7aa",
    borderRadius: 8,
    backgroundColor: colors.warningSoft
  },
  inlineWarningText: {
    flex: 1,
    color: colors.warning,
    fontSize: 13,
    fontWeight: "700"
  },
  audioSurface: {
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: "#f7faf8"
  },
  audioHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  audioLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800"
  },
  audioValue: {
    marginTop: 3,
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  pendingPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
    color: colors.primaryStrong,
    backgroundColor: colors.primarySoft,
    fontSize: 12,
    fontWeight: "800"
  },
  audioPlaceholder: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    borderRadius: 8,
    backgroundColor: colors.surface
  },
  recorderControls: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 9
  },
  timer: {
    marginLeft: "auto",
    color: colors.muted,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "800"
  },
  meter: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    height: 30
  },
  meterBar: {
    flex: 1,
    minWidth: 3,
    borderRadius: 4,
    backgroundColor: "#dde6e2"
  },
  meterBarActive: {
    backgroundColor: colors.danger
  },
  detailActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  statusOk: {
    color: colors.primaryStrong,
    fontSize: 13,
    fontWeight: "800"
  },
  statusError: {
    flex: 1,
    color: colors.danger,
    fontSize: 13,
    fontWeight: "800"
  }
});
