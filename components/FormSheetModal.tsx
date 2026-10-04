import { Modal, Text, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

export function FormSheetModal({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAwareScrollView
        className="flex-1 bg-brand-body"
        enableOnAndroid
        enableAutomaticScroll
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1 }}
        extraScrollHeight={60}>
        <View className="bg-brand-body rounded-t-2xl px-5 pt-5 pb-8">
          <Text className="text-brand-bg text-base font-semibold mb-4">
            {title}
          </Text>

          {children}

          <TouchableOpacity onPress={onClose} className="py-2 items-center">
            <Text className="text-brand-text-secondary text-sm">Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </Modal>
  );
}
