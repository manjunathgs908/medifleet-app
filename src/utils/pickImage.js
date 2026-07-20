import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

const PICK_OPTIONS = { mediaTypes: 'images', base64: true, quality: 0.6 };

function extractBase64(result) {
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.base64) return null;
  const mime = asset.mimeType || 'image/jpeg';
  return `data:${mime};base64,${asset.base64}`;
}

async function captureFromCamera() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', 'Camera access is required to take a photo.');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync(PICK_OPTIONS);
  return extractBase64(result);
}

async function captureFromLibrary() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', 'Photo library access is required.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS);
  return extractBase64(result);
}

// Shared by Add Ambulance's photo + all 5 document capture buttons — one
// prompt, camera or library, returns a data-URI base64 string ready to
// send straight to the backend's uploadToCloudinary(base64, folder).
export function pickImageBase64() {
  return new Promise((resolve) => {
    Alert.alert('Add Photo', 'Choose a source', [
      { text: 'Take Photo', onPress: async () => resolve(await captureFromCamera()) },
      { text: 'Choose from Library', onPress: async () => resolve(await captureFromLibrary()) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}
