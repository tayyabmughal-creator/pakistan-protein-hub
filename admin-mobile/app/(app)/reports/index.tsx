import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { GlassPanel } from "../../../src/components/GlassPanel";
import { ScreenShell } from "../../../src/components/ScreenShell";
import { downloadAdminReport } from "../../../src/lib/api";
import { colors, radii, spacing, typography } from "../../../src/theme/tokens";

const reportCards = [
  {
    key: "orders" as const,
    title: "Orders report",
    description: "Order status, customer type, payment mode, and timestamps.",
    icon: "receipt-outline" as const,
  },
  {
    key: "customers" as const,
    title: "Customers report",
    description: "Customer accounts, join dates, phones, and order counts.",
    icon: "people-outline" as const,
  },
  {
    key: "inventory" as const,
    title: "Inventory report",
    description: "Product stock, category, price, and active storefront state.",
    icon: "cube-outline" as const,
  },
];

export default function ReportsScreen() {
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const shareReport = async (reportKey: "orders" | "customers" | "inventory") => {
    try {
      setBusyKey(reportKey);
      const { data, fileName } = await downloadAdminReport(reportKey);
      const cacheDirectory = FileSystem.cacheDirectory;

      if (!cacheDirectory) {
        throw new Error("The device cache directory is unavailable.");
      }

      const fileUri = `${cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, data, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "text/csv",
          dialogTitle: "Share admin report",
        });
      } else {
        Alert.alert("Saved", `Report written to ${fileUri}`);
      }
    } catch (error) {
      Alert.alert("Report failed", error instanceof Error ? error.message : "Could not export the report.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <ScreenShell title="Reports" subtitle="Export live admin CSV reports and share them from mobile." showBackButton>
      <View style={styles.stack}>
        {reportCards.map((report) => (
          <GlassPanel key={report.key} style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name={report.icon} size={24} color={colors.primary} />
            </View>
            <Text style={styles.title}>{report.title}</Text>
            <Text style={styles.description}>{report.description}</Text>
            <Pressable onPress={() => shareReport(report.key)} style={styles.button}>
              {busyKey === report.key ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Text style={styles.buttonText}>Download & share</Text>
                  <Ionicons name="share-outline" size={18} color={colors.background} />
                </>
              )}
            </Pressable>
          </GlassPanel>
        ))}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.panelBorderStrong,
  },
  title: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 18,
  },
  description: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonText: {
    color: colors.background,
    fontFamily: typography.bodyBold,
    fontSize: 14,
  },
});
