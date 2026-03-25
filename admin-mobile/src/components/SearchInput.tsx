import { StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radii, typography } from "../theme/tokens";

type SearchInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
};

export const SearchInput = ({ value, onChangeText, placeholder }: SearchInputProps) => (
  <View style={styles.wrapper}>
    <Ionicons name="search" size={18} color={colors.textMuted} />
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      style={styles.input}
    />
  </View>
);

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    backgroundColor: colors.fieldStrong,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 15,
    paddingVertical: 0,
  },
});
