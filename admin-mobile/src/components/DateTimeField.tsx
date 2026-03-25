import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";

import { colors, radii, typography } from "../theme/tokens";
import { formatDateTime } from "../lib/format";

type DateTimeFieldProps = {
  label: string;
  value: string;
  onChange: (isoValue: string) => void;
};

export const DateTimeField = ({ label, value, onChange }: DateTimeFieldProps) => {
  const [showPicker, setShowPicker] = useState(false);
  const dateValue = useMemo(() => (value ? new Date(value) : new Date()), [value]);

  const handleChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowPicker(false);
    }

    if (event.type === "dismissed" || !selectedDate) return;
    onChange(selectedDate.toISOString());
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => setShowPicker(true)} style={styles.field}>
        <Text style={styles.value}>{formatDateTime(dateValue.toISOString())}</Text>
      </Pressable>
      {showPicker ? (
        <DateTimePicker
          value={dateValue}
          mode="datetime"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={handleChange}
          accentColor={colors.primary}
          themeVariant="dark"
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  label: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  field: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.field,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  value: {
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 15,
  },
});
