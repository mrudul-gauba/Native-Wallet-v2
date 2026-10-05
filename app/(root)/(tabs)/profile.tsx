import { AccountModal } from "@/components/AccountModal";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { useDefaultAccount } from "@/hooks/mutations/useAccountMutations";

import { useAccountsQuery } from "@/hooks/queries/useAccountsQuery";
import { useSupabase } from "@/hooks/useSupabase";
import type { Accounts, AccountType } from "@/lib/services/accounts";

import { formatPrice } from "@/lib/utils";
import { useBiometric } from "@/providers/BiometricProvider";
import { useUserStore } from "@/store/userStore";
import { useAuth, useReverification, useUser } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ACCOUNT_ICON: Record<AccountType, keyof typeof Feather.glyphMap> = {
  CASH: "dollar-sign",
  BANK: "home",
  CREDIT_CARD: "credit-card",
  SAVINGS: "shield",
};

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-brand-text-muted text-[11px] uppercase tracking-wide mb-2 mt-6 mx-5">
      {children}
    </Text>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  showChevron = true,
  danger = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center bg-white px-4 py-3.5 border-b border-[#F0EEE7] last:border-b-0">
      <View className="w-8 h-8 rounded-full bg-[#F5F4F0] items-center justify-center mr-3">
        <Feather name={icon} size={15} color={danger ? "#FF6B4A" : "#5C5F68"} />
      </View>
      <Text
        className={`flex-1 text-sm ${
          danger ? "text-brand-coral" : "text-brand-bg"
        }`}>
        {label}
      </Text>
      {value && (
        <Text className="text-brand-text-secondary text-xs mr-2">{value}</Text>
      )}
      {showChevron && onPress && (
        <Feather name="chevron-right" size={16} color="#BDC3C7" />
      )}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("dark");
    }, []),
  );
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();
  const supabase = useSupabase();
  const currency = useUserStore((state) => state.currency);
  const setCurrency = useUserStore((state) => state.setCurrency);

  // BIOMETRIC LOGICS
  const {
    biometricEnabled,
    biometricMode,
    isBiometricLoading,
    enableBiometric,
    disableBiometric,
    setBiometricMode,
  } = useBiometric();

  const handleBiometricToggle = async (enabled: boolean) => {
    if (enabled) {
      const success = await enableBiometric();

      if (!success) {
        Alert.alert(
          "Biometric setup failed",
          "Please make sure fingerprint or another biometric method is configured on your device.",
        );
      }

      return;
    }

    await disableBiometric();
  };

  const handleBiometricModePress = () => {
    if (!biometricEnabled) return;

    Alert.alert(
      "Lock app",
      "When should Native Wallet require biometric authentication?",
      [
        {
          text: "Immediately",
          onPress: () => setBiometricMode("immediate"),
        },
        {
          text: "After 1 minute",
          onPress: () => setBiometricMode("1min"),
        },
        {
          text: "After 5 minutes",
          onPress: () => setBiometricMode("5min"),
        },
        {
          text: "Only when app opens",
          onPress: () => setBiometricMode("onLaunch"),
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ],
    );
  };
  // END OF BIOMETRIC LOGICS

  // USER DELETION CONTENT
  const deleteUser = useReverification(async () => {
    if (!user) return;

    await user.delete();
  });
  const [deleteAccountVisible, setDeleteAccountVisible] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const openDeleteAccountModal = () => {
    setDeleteAccountVisible(true);
  };

  const handleDeleteAccount = async () => {
    if (!user || deletingAccount) return;

    setDeletingAccount(true);

    try {
      await deleteUser();

      setDeleteAccountVisible(false);

      await signOut();

      router.replace("/sign-in");
    } catch (error) {
      console.error("Account deletion failed:", error);

      setDeletingAccount(false);

      Alert.alert(
        "Couldn't delete account",
        "Your account wasn't deleted. Please try again.",
      );
    }
  };
  // END OF USER DELETION CONTENT

  const [modalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Accounts | null>(null);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const {
    data: accounts = [],
    isLoading: loadingAccounts,
    isError: accountsError,
  } = useAccountsQuery();
  const { mutateAsync: setDefaultAccount } = useDefaultAccount();

  const handlePickAvatar = async () => {
    if (!user) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "Allow photo library access to set a profile picture.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled) return;

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const filename = asset.uri.split("/").pop() || "avatar.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const mimeType = match ? `image/${match[1]}` : "image/jpeg";
      const dataUrl = `data:${mimeType};base64,${asset.base64}`;

      await user.setProfileImage({ file: dataUrl });
    } catch (err) {
      console.error("Avatar upload failed:", err);
      Alert.alert("Error", "Couldn't upload your photo. Please try again.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/sign-in");
        },
      },
    ]);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingAccount(null);
  };

  const handleMadeDefault = async () => {
    if (!editingAccount) return;
    try {
      await setDefaultAccount(editingAccount.id);
      closeModal();
    } catch {
      Alert.alert("Error", "Couldn't set this as the default account.");
    }
  };

  const handleCurrencySelect = async (selected: { code: string }) => {
    setCurrencyPickerOpen(false);
    if (!user) return;
    try {
      const { error } = await supabase
        .from("users")
        .update({ currency: selected.code })
        .eq("clerk_id", user.id);
      if (error) throw error;
      setCurrency(selected.code);
    } catch {
      Alert.alert("Error", "Couldn't update your currency.");
    }
  };

  // FOR DELETING USER PROFILE IMAGE
  const [avatarMenuVisible, setAvatarMenuVisible] = useState(false);

  const handleRemoveAvatar = async () => {
    if (!user?.hasImage) return;

    setAvatarMenuVisible(false);
    setUploadingAvatar(true);

    try {
      await user.setProfileImage({ file: null });
    } catch (err) {
      console.error("Avatar removal failed:", err);

      Alert.alert(
        "Error",
        "Couldn't remove your profile photo. Please try again.",
      );
    } finally {
      setUploadingAvatar(false);
    }
  };
  // END OF DELETING USER PROFILE IMAGE

  return (
    <SafeAreaView className="flex-1 bg-brand-body" edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}>
        <View className="px-5 pt-3 pb-2">
          <Text className="text-brand-bg text-xl font-semibold">Profile</Text>
        </View>

        {/* User card */}
        <View className="mx-5 mt-2 bg-brand-bg rounded-2xl px-5 py-6 items-center">
          <TouchableOpacity
            onPress={() => {
              if (user?.hasImage) {
                setAvatarMenuVisible(true);
              } else {
                handlePickAvatar();
              }
            }}
            disabled={uploadingAvatar}
            activeOpacity={0.8}
            className="w-20 h-20 rounded-full bg-[#1A1D26] items-center justify-center overflow-hidden border-2 border-[#2A2E3A]">
            {uploadingAvatar ? (
              <ActivityIndicator color="#8A8D96" />
            ) : user?.imageUrl && user.hasImage ? (
              <Image
                source={{ uri: user.imageUrl }}
                style={{ width: 80, height: 80 }}
                contentFit="cover"
              />
            ) : (
              <Feather name="user" size={30} color="#8A8D96" />
            )}
            <View className="absolute bottom-0 inset-x-0 h-6 bg-black/50 items-center justify-center">
              <Feather name="camera" size={13} color="#F2EFE9" />
            </View>
          </TouchableOpacity>

          <Text className="text-white text-2xl font-bold mt-3.5">
            {user?.firstName} {user?.lastName}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-1">
            <Feather name="mail" size={11} color="#8A8D96" />
            <Text
              className="text-brand-text-secondary text-xs"
              numberOfLines={1}>
              {user?.emailAddresses?.[0]?.emailAddress}
            </Text>
          </View>
        </View>

        {/* Accounts */}
        <SectionLabel>Accounts</SectionLabel>
        <View className="mx-5 rounded-2xl overflow-hidden border border-[#E8E6DF]">
          {loadingAccounts ? (
            <View className="bg-white px-4 py-5 items-center">
              <ActivityIndicator color="#5C5F68" />
            </View>
          ) : accountsError ? (
            <View className="bg-white px-4 py-5 items-center">
              <Text className="text-brand-text-muted text-xs">
                Couldn&apos;t load your accounts.
              </Text>
            </View>
          ) : (
            accounts.map((account) => (
              <Row
                key={account.id}
                icon={ACCOUNT_ICON[account.type]}
                label={account.name + (account.is_default ? " (default)" : "")}
                value={formatPrice(account.balance, currency)}
                onPress={() => {
                  setEditingAccount(account);
                  setModalVisible(true);
                }}
              />
            ))
          )}
          <Row
            icon="plus"
            label="Add account"
            onPress={() => {
              setEditingAccount(null);
              setModalVisible(true);
            }}
          />
        </View>

        {/* Preferences */}
        <SectionLabel>Preferences</SectionLabel>
        <View className="mx-5 rounded-2xl overflow-hidden border border-[#E8E6DF]">
          <Row
            icon="dollar-sign"
            label="Currency"
            value={currency}
            onPress={() => setCurrencyPickerOpen(true)}
          />

          <View className="flex-row items-center bg-white px-4 py-3.5">
            <View className="w-8 h-8 rounded-full bg-[#F5F4F0] items-center justify-center mr-3">
              <Feather name="lock" size={15} color="#5C5F68" />
            </View>

            <Text className="flex-1 text-sm text-brand-bg">Biometric lock</Text>

            <Switch
              value={biometricEnabled}
              onValueChange={handleBiometricToggle}
              disabled={isBiometricLoading}
            />
          </View>

          <TouchableOpacity
            onPress={handleBiometricModePress}
            disabled={!biometricEnabled}
            className={`flex-row items-center bg-white px-4 py-3.5 border-t border-[#F0EEE7] ${
              !biometricEnabled ? "opacity-40" : ""
            }`}>
            <View className="w-8 h-8 rounded-full bg-[#F5F4F0] items-center justify-center mr-3">
              <Feather name="clock" size={15} color="#5C5F68" />
            </View>

            <Text className="flex-1 text-sm text-brand-bg">Lock after</Text>

            <Text className="text-brand-text-secondary text-xs mr-2">
              {biometricMode === "immediate"
                ? "Immediately"
                : biometricMode === "1min"
                  ? "1 minute"
                  : biometricMode === "5min"
                    ? "5 minutes"
                    : "App opens"}
            </Text>

            <Feather name="chevron-right" size={16} color="#BDC3C7" />
          </TouchableOpacity>
        </View>

        {/* Account actions */}
        <SectionLabel>Account</SectionLabel>
        <View className="mx-5 rounded-2xl overflow-hidden border border-[#E8E6DF]">
          <Row
            icon="log-out"
            label="Sign out"
            onPress={handleSignOut}
            showChevron={false}
            danger
          />
          <Row
            icon="trash-2"
            label="Delete account"
            onPress={openDeleteAccountModal}
            showChevron={false}
            danger
          />
        </View>
      </ScrollView>

      {user && (
        <AccountModal
          visible={modalVisible}
          account={editingAccount}
          onClose={closeModal}
          onSaved={closeModal}
          onDeleted={closeModal}
          onMadeDefault={handleMadeDefault}
        />
      )}
      {/* UI FOR AVTAR DELETION */}
      <Modal
        visible={avatarMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarMenuVisible(false)}>
        <Pressable
          className="flex-1 bg-black/50 justify-end"
          onPress={() => setAvatarMenuVisible(false)}>
          <Pressable
            className="bg-brand-bg rounded-t-[28px] px-5 pt-3 pb-8"
            onPress={(event) => event.stopPropagation()}>
            {/* Handle */}
            <View className="w-10 h-1 rounded-full bg-[#3A3E49] self-center mb-6" />

            {/* Title */}
            <Text className="text-white text-lg font-semibold mb-3">
              Profile picture
            </Text>

            {/* Change photo */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                setAvatarMenuVisible(false);
                handlePickAvatar();
              }}
              className="flex-row items-center py-4">
              <View className="w-11 h-11 rounded-full bg-[#2A2E3A] items-center justify-center mr-4">
                <Feather name="camera" size={18} color="#F2EFE9" />
              </View>

              <View className="flex-1">
                <Text className="text-white text-[15px] font-medium">
                  Change photo
                </Text>

                <Text className="text-[#8A8D96] text-xs mt-1">
                  Choose a new profile picture
                </Text>
              </View>

              <Feather name="chevron-right" size={17} color="#5C5F68" />
            </TouchableOpacity>

            {/* Remove photo */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleRemoveAvatar}
              className="flex-row items-center py-4 border-t border-[#2A2E3A]">
              <View className="w-11 h-11 rounded-full bg-[#332522] items-center justify-center mr-4">
                <Feather name="trash-2" size={18} color="#FF6B4A" />
              </View>

              <View className="flex-1">
                <Text className="text-brand-coral text-[15px] font-medium">
                  Remove photo
                </Text>

                <Text className="text-[#8A8D96] text-xs mt-1">
                  Remove your current profile picture
                </Text>
              </View>

              <Feather name="chevron-right" size={17} color="#5C5F68" />
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setAvatarMenuVisible(false)}
              className="mt-3 bg-[#1A1D26] rounded-2xl py-4 items-center">
              <Text className="text-white text-[15px] font-medium">Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      {/* END OF UI FOR AVATAR DELETION */}

      {/* DELETE ACCOUNT MODAL */}
      <Modal
        visible={deleteAccountVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deletingAccount) {
            setDeleteAccountVisible(false);
          }
        }}>
        <Pressable
          className="flex-1 bg-black/50 justify-end"
          onPress={() => {
            if (!deletingAccount) {
              setDeleteAccountVisible(false);
            }
          }}>
          <Pressable
            className="bg-brand-bg rounded-t-[28px] px-5 pt-3 pb-8"
            onPress={(event) => event.stopPropagation()}>
            {/* Handle */}
            <View className="w-10 h-1 rounded-full bg-[#3A3E49] self-center mb-6" />

            {/* Icon */}
            <View className="w-14 h-14 rounded-full bg-[#332522] items-center justify-center mb-4">
              <Feather name="trash-2" size={24} color="#FF6B4A" />
            </View>

            {/* Title */}
            <Text className="text-white text-xl font-semibold">
              Delete your account?
            </Text>

            {/* Description */}
            <Text className="text-[#8A8D96] text-sm leading-5 mt-2">
              This permanently deletes your wallet data, accounts, transactions,
              budgets, and profile. This action cannot be undone.
            </Text>

            {/* Delete */}
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={deletingAccount}
              onPress={handleDeleteAccount}
              className="bg-brand-coral rounded-2xl py-4 items-center mt-6">
              {deletingAccount ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-white text-[15px] font-semibold">
                  Delete account
                </Text>
              )}
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity
              activeOpacity={0.7}
              disabled={deletingAccount}
              onPress={() => setDeleteAccountVisible(false)}
              className="mt-3 bg-[#1A1D26] rounded-2xl py-4 items-center">
              <Text className="text-white text-[15px] font-medium">Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      {/* END DELETE ACCOUNT MODAL */}

      <CurrencyPicker
        visible={currencyPickerOpen}
        selectedCode={currency}
        onSelect={handleCurrencySelect}
        onClose={() => setCurrencyPickerOpen(false)}
      />
    </SafeAreaView>
  );
}
