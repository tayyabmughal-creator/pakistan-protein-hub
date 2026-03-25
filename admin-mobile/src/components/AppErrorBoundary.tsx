import { Component, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { reportAppError, toAppError } from "../lib/errors";
import { colors, gradients, radii, spacing, typography } from "../theme/tokens";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      error: toAppError(error, "The app hit an unexpected problem."),
    };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    reportAppError(error, "render", {
      componentStack: info.componentStack || "",
    });
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <View style={styles.root}>
        <LinearGradient colors={gradients.background} style={StyleSheet.absoluteFillObject} />
        <LinearGradient colors={gradients.hero} style={styles.glow} />
        <View style={styles.panel}>
          <View style={styles.iconWrap}>
            <Ionicons name="warning-outline" size={28} color={colors.background} />
          </View>
          <Text style={styles.title}>Something broke in this view</Text>
          <Text style={styles.description}>{this.state.error.message}</Text>
          <Pressable onPress={this.reset}>
            <LinearGradient colors={gradients.primary} style={styles.button}>
              <Text style={styles.buttonText}>Reload view</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  glow: {
    position: "absolute",
    top: -120,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 260,
  },
  panel: {
    width: "100%",
    maxWidth: 420,
    padding: spacing.xl,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.panelBorderStrong,
    backgroundColor: colors.overlay,
    gap: spacing.md,
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  title: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 28,
    lineHeight: 32,
  },
  description: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: colors.background,
    fontFamily: typography.bodyBold,
    fontSize: 15,
  },
});
