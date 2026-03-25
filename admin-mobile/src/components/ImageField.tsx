import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

import { colors, radii, spacing, typography } from "../theme/tokens";
import { PickedImageAsset } from "../types/api";

type ImageFieldProps = {
  label: string;
  imageUri?: string | null;
  onChange: (asset: PickedImageAsset | null) => void;
};

export const ImageField = ({ label, imageUri, onChange }: ImageFieldProps) => {
  const pickImage = async () => {
    const permissions = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissions.granted) {
      Alert.alert("Permission needed", "Allow photo library access to upload an image.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
      aspect: [4, 4],
    });

    if (result.canceled || !result.assets.length) return;
    const asset = result.assets[0];
    if (!asset) return;
    onChange({
      uri: asset.uri,
      name: asset.fileName || `upload-${Date.now()}.jpg`,
      type: asset.mimeType || "image/jpeg",
    });
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.card} onPress={pickImage}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="image-outline" size={24} color={colors.textMuted} />
            <Text style={styles.placeholderText}>Pick an image</Text>
          </View>
        )}
      </Pressable>
      {imageUri ? (
        <Pressable onPress={() => onChange(null)}>
          <Text style={styles.clear}>Remove image</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    gap: 10,
  },
  label: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  card: {
    height: 168,
    borderRadius: radii.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.field,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  placeholderText: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  clear: {
    color: colors.danger,
    fontFamily: typography.bodyBold,
    fontSize: 13,
  },
});
