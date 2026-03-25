import { StyleProp, StyleSheet, Text, TextProps, TextStyle } from "react-native";

import { formatCurrency } from "../lib/format";

type MoneyTextProps = Omit<TextProps, "children"> & {
  value: string | number | null | undefined;
  prefix?: string;
  suffix?: string;
  style?: StyleProp<TextStyle>;
};

export const MoneyText = ({
  value,
  prefix = "",
  suffix = "",
  style,
  numberOfLines = 1,
  minimumFontScale = 0.82,
  adjustsFontSizeToFit = true,
  ellipsizeMode = "tail",
  ...props
}: MoneyTextProps) => (
  <Text
    {...props}
    adjustsFontSizeToFit={adjustsFontSizeToFit}
    ellipsizeMode={ellipsizeMode}
    minimumFontScale={minimumFontScale}
    numberOfLines={numberOfLines}
    style={[styles.text, style]}
  >
    {`${prefix}${formatCurrency(value)}${suffix}`}
  </Text>
);

const styles = StyleSheet.create({
  text: {
    includeFontPadding: false,
    flexShrink: 1,
  },
});
