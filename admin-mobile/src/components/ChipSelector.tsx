import { ScrollView, Pressable, StyleSheet, Text } from "react-native";

import { colors, typography } from "../theme/tokens";

type Option = {
  label: string;
  value: string;
};

type ChipSelectorProps = {
  options: Option[];
  selectedValue: string;
  onChange: (value: string) => void;
};

export const ChipSelector = ({ options, selectedValue, onChange }: ChipSelectorProps) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
    {options.map((option) => {
      const active = option.value === selectedValue;
      return (
        <Pressable
          key={option.value}
          onPress={() => onChange(option.value)}
          style={[styles.chip, active ? styles.chipActive : null]}
        >
          <Text style={[styles.text, active ? styles.textActive : null]}>{option.label}</Text>
        </Pressable>
      );
    })}
  </ScrollView>
);

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    backgroundColor: colors.field,
  },
  chipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.panelBorderStrong,
  },
  text: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  textActive: {
    color: colors.primary,
  },
});
