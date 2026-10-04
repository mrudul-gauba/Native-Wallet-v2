import { authenticateBiometric } from "@/lib/services/biometric";
import { useAuth } from "@clerk/expo";
import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AppState,
  AppStateStatus,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export type BiometricLockMode = "immediate" | "1min" | "5min" | "onLaunch";

type BiometricContextType = {
  biometricEnabled: boolean;
  biometricMode: BiometricLockMode;
  isBiometricLoading: boolean;

  enableBiometric: () => Promise<boolean>;
  disableBiometric: () => Promise<void>;

  setBiometricMode: (mode: BiometricLockMode) => Promise<void>;

  unlock: () => Promise<boolean>;
};

const BiometricContext = createContext<BiometricContextType | undefined>(
  undefined,
);

const getModeKey = (userId: string) => `biometric_lock_mode_${userId}`;

const getEnabledKey = (userId: string) => `biometric_lock_${userId}`;

const LOCK_DELAYS: Record<Exclude<BiometricLockMode, "onLaunch">, number> = {
  immediate: 0,
  "1min": 60 * 1000,
  "5min": 5 * 60 * 1000,
};

export function BiometricProvider({ children }: PropsWithChildren) {
  const { isSignedIn, userId } = useAuth();

  const [biometricEnabled, setBiometricEnabled] = useState(false);

  const [biometricMode, setBiometricModeState] =
    useState<BiometricLockMode>("immediate");

  const [isBiometricLoading, setIsBiometricLoading] = useState(true);

  const [isLocked, setIsLocked] = useState(false);

  const appState = useRef<AppStateStatus>(AppState.currentState);

  /*
   * Timestamp of when the app entered the background.
   *
   * This is more reliable than relying only on setTimeout,
   * because Android may suspend JavaScript while the app
   * is in the background.
   */
  const backgroundedAt = useRef<number | null>(null);

  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const authenticationInProgress = useRef(false);

  const hasLoadedInitialState = useRef(false);

  /*
   * Clear any existing timer.
   */
  const clearLockTimer = useCallback(() => {
    if (lockTimer.current) {
      clearTimeout(lockTimer.current);
      lockTimer.current = null;
    }
  }, []);

  /*
   * Authenticate the user.
   */
  const unlock = useCallback(async () => {
    if (authenticationInProgress.current) {
      return false;
    }

    authenticationInProgress.current = true;

    try {
      const result = await authenticateBiometric();

      if (result.success) {
        setIsLocked(false);
        return true;
      }

      return false;
    } finally {
      authenticationInProgress.current = false;
    }
  }, []);

  /*
   * Load biometric settings for the current Clerk user.
   */
  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      setIsBiometricLoading(true);
      hasLoadedInitialState.current = false;

      if (!isSignedIn || !userId) {
        setBiometricEnabled(false);
        setBiometricModeState("immediate");
        setIsLocked(false);
        setIsBiometricLoading(false);
        return;
      }

      try {
        const enabledValue = await SecureStore.getItemAsync(
          getEnabledKey(userId),
        );

        const modeValue = await SecureStore.getItemAsync(getModeKey(userId));

        if (cancelled) return;

        const enabled = enabledValue === "true";

        const validModes: BiometricLockMode[] = [
          "immediate",
          "1min",
          "5min",
          "onLaunch",
        ];

        const mode = validModes.includes(modeValue as BiometricLockMode)
          ? (modeValue as BiometricLockMode)
          : "immediate";

        setBiometricEnabled(enabled);
        setBiometricModeState(mode);

        /*
         * If biometric lock is enabled, the app starts locked.
         */
        if (enabled) {
          setIsLocked(true);
        } else {
          setIsLocked(false);
        }

        hasLoadedInitialState.current = true;
      } catch (error) {
        console.error("Failed to load biometric settings:", error);

        if (!cancelled) {
          setBiometricEnabled(false);
          setBiometricModeState("immediate");
          setIsLocked(false);
        }
      } finally {
        if (!cancelled) {
          setIsBiometricLoading(false);
        }
      }
    };

    loadSettings();

    return () => {
      cancelled = true;
      clearLockTimer();
    };
  }, [isSignedIn, userId, clearLockTimer]);

  /*
   * Authenticate when the app initially loads
   * and biometric lock is enabled.
   */
  useEffect(() => {
    if (
      !hasLoadedInitialState.current ||
      isBiometricLoading ||
      !isSignedIn ||
      !biometricEnabled ||
      !isLocked
    ) {
      return;
    }

    unlock();
  }, [isBiometricLoading, isSignedIn, biometricEnabled, isLocked, unlock]);

  /*
   * Handle background / foreground transitions.
   */
  useEffect(() => {
    if (!isSignedIn || !biometricEnabled || isBiometricLoading) {
      return;
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appState.current;

      const wentToBackground =
        previousState === "active" &&
        (nextState === "inactive" || nextState === "background");

      const cameToForeground =
        (previousState === "inactive" || previousState === "background") &&
        nextState === "active";

      /*
       * APP LEFT FOREGROUND
       */
      if (wentToBackground) {
        clearLockTimer();

        /*
         * Record the exact time we went into the background.
         *
         * This timestamp is the source of truth.
         */
        backgroundedAt.current = Date.now();

        /*
         * "Only when app opens"
         *
         * Don't lock when simply backgrounding.
         */
        if (biometricMode === "onLaunch") {
          appState.current = nextState;
          return;
        }

        /*
         * Immediate
         */
        if (biometricMode === "immediate") {
          setIsLocked(true);
        }

        /*
         * 1 minute / 5 minutes
         *
         * The timer is only an optimization.
         * The timestamp check below is the actual
         * source of truth.
         */
        if (biometricMode === "1min" || biometricMode === "5min") {
          const delay = LOCK_DELAYS[biometricMode];

          lockTimer.current = setTimeout(() => {
            setIsLocked(true);
            lockTimer.current = null;
          }, delay);
        }
      }

      /*
       * APP RETURNS TO FOREGROUND
       */
      if (cameToForeground) {
        clearLockTimer();

        const backgroundTime = backgroundedAt.current;

        backgroundedAt.current = null;

        /*
         * "Only when app opens"
         *
         * Returning from Home does NOT require
         * authentication.
         */
        if (biometricMode === "onLaunch") {
          appState.current = nextState;
          return;
        }

        /*
         * Immediate
         */
        if (biometricMode === "immediate") {
          setIsLocked(true);
          unlock();
        }

        /*
         * 1 minute / 5 minutes
         */
        if (
          (biometricMode === "1min" || biometricMode === "5min") &&
          backgroundTime !== null
        ) {
          const elapsed = Date.now() - backgroundTime;

          const requiredDelay = LOCK_DELAYS[biometricMode];

          /*
           * The app was backgrounded longer than
           * the selected timeout.
           */
          if (elapsed >= requiredDelay) {
            setIsLocked(true);
            unlock();
          } else {
            /*
             * App came back before the timeout.
             *
             * Do not lock it.
             */
            setIsLocked(false);
          }
        }
      }

      appState.current = nextState;
    });

    return () => {
      subscription.remove();
      clearLockTimer();
    };
  }, [
    isSignedIn,
    biometricEnabled,
    biometricMode,
    isBiometricLoading,
    unlock,
    clearLockTimer,
  ]);

  /*
   * Enable biometric lock.
   */
  const enableBiometric = useCallback(async () => {
    if (!userId) {
      return false;
    }

    /*
     * Authenticate first.
     */
    const result = await authenticateBiometric();

    if (!result.success) {
      return false;
    }

    try {
      await SecureStore.setItemAsync(getEnabledKey(userId), "true");

      await SecureStore.setItemAsync(getModeKey(userId), biometricMode);

      setBiometricEnabled(true);
      setIsLocked(false);

      return true;
    } catch (error) {
      console.error("Failed to enable biometric lock:", error);

      return false;
    }
  }, [userId, biometricMode]);

  /*
   * Disable biometric lock.
   */
  const disableBiometric = useCallback(async () => {
    if (userId) {
      await SecureStore.deleteItemAsync(getEnabledKey(userId));

      await SecureStore.deleteItemAsync(getModeKey(userId));
    }

    clearLockTimer();
    backgroundedAt.current = null;

    setBiometricEnabled(false);
    setBiometricModeState("immediate");
    setIsLocked(false);
  }, [userId, clearLockTimer]);

  /*
   * Change lock mode.
   */
  const setBiometricMode = useCallback(
    async (mode: BiometricLockMode) => {
      if (!userId) return;

      await SecureStore.setItemAsync(getModeKey(userId), mode);

      setBiometricModeState(mode);

      /*
       * If the user switches to immediate,
       * clear any existing timer.
       */
      if (mode === "immediate") {
        clearLockTimer();
      }
    },
    [userId, clearLockTimer],
  );

  /*
   * Locked screen.
   */
  if (isSignedIn && !isBiometricLoading && biometricEnabled && isLocked) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#17191F",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
        }}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: "#252832",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}>
          <Text style={{ fontSize: 36 }}>🔐</Text>
        </View>

        <Text
          style={{
            color: "#FFFFFF",
            fontSize: 26,
            fontWeight: "700",
            marginBottom: 8,
          }}>
          App Locked
        </Text>

        <Text
          style={{
            color: "#8A8D96",
            fontSize: 14,
            textAlign: "center",
            marginBottom: 32,
          }}>
          Authenticate to access Native Wallet
        </Text>

        <TouchableOpacity
          onPress={unlock}
          style={{
            backgroundColor: "#FFFFFF",
            paddingHorizontal: 28,
            paddingVertical: 14,
            borderRadius: 14,
          }}>
          <Text
            style={{
              color: "#17191F",
              fontSize: 15,
              fontWeight: "600",
            }}>
            Unlock
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <BiometricContext.Provider
      value={{
        biometricEnabled,
        biometricMode,
        isBiometricLoading,
        enableBiometric,
        disableBiometric,
        setBiometricMode,
        unlock,
      }}>
      {children}
    </BiometricContext.Provider>
  );
}

export function useBiometric() {
  const context = useContext(BiometricContext);

  if (!context) {
    throw new Error("useBiometric must be used inside BiometricProvider");
  }

  return context;
}
