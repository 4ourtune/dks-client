import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Button, Input, Header } from "@/components/common";
import { Colors, Fonts, Dimensions } from "@/styles";
import { usePairingStore, useVehicleStore } from "@/stores";

const PIN_LENGTH = 6;

export const AddVehicleScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { fetchVehicles, selectVehicle } = useVehicleStore();
  const {
    status,
    pendingSession,
    pairingResult,
    attemptsRemaining,
    error,
    checkPendingSession,
    confirmPin,
    reset,
  } = usePairingStore();

  const [vehicleIdInput, setVehicleIdInput] = useState("");
  const [pinInput, setPinInput] = useState("");

  const isChecking = status === "checking";
  const isConfirming = status === "confirming";

  useEffect(() => () => reset(), [reset]);

  const expiresAtLabel = useMemo(() => {
    if (!pendingSession) {
      return null;
    }
    try {
      return new Date(pendingSession.expiresAt).toLocaleString();
    } catch {
      return pendingSession.expiresAt;
    }
  }, [pendingSession]);

  const parsedVehicleId = useMemo(() => {
    const trimmed = vehicleIdInput.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [vehicleIdInput]);

  const handleCheckSession = async () => {
    if (!parsedVehicleId) {
      Alert.alert("Invalid Vehicle", "Please enter a valid vehicle ID.");
      return;
    }
    try {
      await checkPendingSession(parsedVehicleId);
    } catch (checkError) {
      const message =
        checkError instanceof Error ? checkError.message : "Unable to check pairing status.";
      Alert.alert("Pairing Status", message);
    }
  };

  const handleConfirmPin = async () => {
    if (!parsedVehicleId) {
      Alert.alert("Invalid Vehicle", "Please enter a valid vehicle ID.");
      return;
    }
    if (pinInput.length !== PIN_LENGTH) {
      Alert.alert("Invalid PIN", `Enter the ${PIN_LENGTH}-character PIN displayed in the vehicle.`);
      return;
    }

    try {
      await confirmPin(parsedVehicleId, pinInput.trim().toUpperCase());
      setPinInput("");
      const updatedVehicles = await fetchVehicles();
      const matchedVehicle =
        updatedVehicles.find((vehicle) => vehicle.id === String(parsedVehicleId)) || null;

      Alert.alert("Vehicle Paired", "Vehicle registration completed successfully.", [
        {
          text: "OK",
          onPress: () => {
            reset();
            if (matchedVehicle) {
              selectVehicle(matchedVehicle).catch((selectionError) => {
                console.warn("Vehicle selection after pairing failed:", selectionError);
              });
              navigation.navigate("VehicleDetail", {
                vehicleId: matchedVehicle.id,
              });
            } else if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate("Home");
            }
          },
        },
      ]);
    } catch (confirmError) {
      const message =
        confirmError instanceof Error ? confirmError.message : "Unable to confirm pairing PIN.";
      Alert.alert("Verification Failed", message);
    }
  };

  const handleBackPress = () => {
    reset();
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Register Vehicle" showBackButton onLeftPress={handleBackPress} />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.description}>
            Enter the vehicle ID and the pairing PIN shown on the vehicle display. PIN codes are
            valid for 10 minutes.
          </Text>

          <Input
            label="Vehicle ID"
            value={vehicleIdInput}
            onChangeText={setVehicleIdInput}
            keyboardType="numeric"
            placeholder="e.g. 1024"
            autoCorrect={false}
          />

          <View style={styles.actionRow}>
            <Button
              title={isChecking ? "Checking..." : "Check Status"}
              onPress={handleCheckSession}
              loading={isChecking}
              disabled={!parsedVehicleId || isChecking || isConfirming}
              variant="secondary"
              size="small"
            />
          </View>

          {pendingSession && (
            <View style={styles.sessionCard}>
              <Text style={styles.sessionTitle}>Active pairing session</Text>
              <Text style={styles.sessionMeta}>Expires at: {expiresAtLabel}</Text>
              <Text style={styles.sessionMeta}>
                Attempts remaining: {pendingSession.attemptsRemaining}
              </Text>
            </View>
          )}

          <Input
            label="PIN"
            value={pinInput}
            onChangeText={(value) => setPinInput(value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
            autoCapitalize="characters"
            maxLength={PIN_LENGTH}
            placeholder="Enter vehicle PIN"
          />

          {attemptsRemaining !== null && status === "error" && (
            <Text style={styles.attemptsLabel}>Attempts remaining: {attemptsRemaining}</Text>
          )}

          {error && status === "error" && <Text style={styles.errorText}>{error}</Text>}

          <Button
            title={isConfirming ? "Verifying..." : "Complete Pairing"}
            onPress={handleConfirmPin}
            loading={isConfirming}
            disabled={!parsedVehicleId || pinInput.length !== PIN_LENGTH || isConfirming}
            style={styles.primaryButton}
          />

          {pairingResult && (
            <View style={styles.successCard}>
              <Text style={styles.successTitle}>Vehicle paired successfully</Text>
              <Text style={styles.successMessage}>
                Vehicle #{pairingResult.vehicleId} is now linked to your account.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Dimensions.spacing.lg,
    paddingVertical: Dimensions.spacing.lg,
  },
  description: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
    lineHeight: Fonts.lineHeight.base,
    marginBottom: Dimensions.spacing.lg,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: Dimensions.spacing.lg,
  },
  sessionCard: {
    marginBottom: Dimensions.spacing.lg,
    padding: Dimensions.spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Dimensions.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sessionTitle: {
    fontSize: Fonts.size.base,
    fontFamily: Fonts.family.semibold,
    color: Colors.text,
    marginBottom: Dimensions.spacing.xs,
  },
  sessionMeta: {
    fontSize: Fonts.size.xs,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
    marginBottom: Dimensions.spacing.xs,
  },
  attemptsLabel: {
    fontSize: Fonts.size.xs,
    fontFamily: Fonts.family.medium,
    color: Colors.textSecondary,
    marginBottom: Dimensions.spacing.xs,
  },
  errorText: {
    fontSize: Fonts.size.xs,
    fontFamily: Fonts.family.regular,
    color: Colors.error,
    marginBottom: Dimensions.spacing.sm,
  },
  primaryButton: {
    marginTop: Dimensions.spacing.sm,
  },
  successCard: {
    marginTop: Dimensions.spacing.lg,
    padding: Dimensions.spacing.lg,
    backgroundColor: Colors.successLight,
    borderRadius: Dimensions.borderRadius.md,
  },
  successTitle: {
    fontSize: Fonts.size.base,
    fontFamily: Fonts.family.semibold,
    color: Colors.success,
    marginBottom: Dimensions.spacing.xs,
  },
  successMessage: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.text,
    lineHeight: Fonts.lineHeight.sm,
  },
});
