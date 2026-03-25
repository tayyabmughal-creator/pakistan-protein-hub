import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

import { colors, radii, spacing, typography } from "../theme/tokens";

type FormFieldProps = TextInputProps & {
  label: string;
  helper?: string;
};

export const FormField = ({ label, helper, multiline, style, ...props }: FormFieldProps) => (
  <View style={styles.wrapper}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      {...props}
      placeholderTextColor={colors.textMuted}
      multiline={multiline}
      style={[styles.input, multiline ? styles.multiline : null, style]}
    />
    {helper ? <Text style={styles.helper}>{helper}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  label: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    backgroundColor: colors.fieldStrong,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 15,
  },
  multiline: {
    minHeight: 112,
    textAlignVertical: "top",
  },
  helper: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
});
