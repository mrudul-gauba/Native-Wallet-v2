import * as LocalAuthentication from "expo-local-authentication";

export type BiometricResult =
  | { success: true }
  | {
      success: false;
      reason: "NO_HARDWARE" | "NOT_ENROLLED" | "CANCELLED" | "FAILED" | "ERROR";
    };

export async function authenticateBiometric(): Promise<BiometricResult> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();

    if (!hasHardware) {
      return { success: false, reason: "NO_HARDWARE" };
    }

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!isEnrolled) {
      return { success: false, reason: "NOT_ENROLLED" };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock Native Wallet",
      cancelLabel: "Cancel",
      fallbackLabel: "Use device passcode",
    });

    if (result.success) {
      return { success: true };
    }

    if (result.error === "user_cancel" || result.error === "system_cancel") {
      return { success: false, reason: "CANCELLED" };
    }

    return { success: false, reason: "FAILED" };
  } catch (error) {
    console.error("Biometric authentication error:", error);

    return { success: false, reason: "ERROR" };
  }
}
