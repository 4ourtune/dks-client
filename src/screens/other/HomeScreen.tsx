import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { Button, Header, LoadingSpinner } from "@/components/common";
import { useVehicleStore, useBLEStore, useKeyStore } from "@/stores";
import { ProtocolHandler } from "@/services/ble";
import { CertificateService } from "@/services/crypto/CertificateService";
import { Colors, Fonts, Dimensions } from "@/styles";
import { PairingStep, VehicleControlRequest, Vehicle } from "@/types";

const PAIRING_STATUS_MESSAGES: Record<PairingStep, string> = {
  idle: "",
  scanning: "Scanning for nearby vehicles...",
  deviceSelected: "Device selected. Waiting to connect...",
  connecting: "Connecting to the vehicle...",
  challenge: "Challenge received from the vehicle.",
  registering: "Creating a pairing session with the server...",
  completing: "Finalizing pairing with the vehicle...",
  completed: "Pairing completed successfully.",
  error: "Pairing failed. Please try again.",
};

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const {
    vehicles,
    selectedVehicle,
    vehicleStatuses,
    fetchVehicles,
    selectVehicle,
    controlVehicle,
    fetchVehicleStatus,
    applyStatusFromBle,
    isLoading,
    loadSelectedVehicle,
  } = useVehicleStore();

  const {
    connection,
    pairing,
    sendCommand,
    initialize: initializeBLE,
    startPairing,
    selectPairingDevice,
    cancelPairing,
    resetPairing,
  } = useBLEStore();

  const { keys, selectedKey, fetchKeys } = useKeyStore();

  const [refreshing, setRefreshing] = useState(false);
  const [commandLoading, setCommandLoading] = useState<string | null>(null);

  const selectedVehicleId = selectedVehicle ? String(selectedVehicle.id) : null;
  const defaultVehicleStatus = useMemo(
    () => ({
      doorsLocked: false,
      engineRunning: false,
    }),
    [],
  );
  const currentStatus =
    selectedVehicleId && vehicleStatuses[selectedVehicleId]
      ? vehicleStatuses[selectedVehicleId]
      : defaultVehicleStatus;
  const activeKey = useMemo(() => {
    if (!selectedVehicleId) {
      return undefined;
    }

    const primary = keys.find((key) => key.vehicleId === selectedVehicleId && key.isActive);
    if (primary) {
      return primary;
    }

    if (selectedKey && selectedKey.vehicleId === selectedVehicleId) {
      return selectedKey;
    }

    return keys.find((key) => key.vehicleId === selectedVehicleId);
  }, [keys, selectedKey, selectedVehicleId]);

  const pairingStep = pairing.step;
  const pairingMessage = PAIRING_STATUS_MESSAGES[pairingStep];
  const pairingContext = pairing.context;

  const loadData = useCallback(async () => {
    try {
      const vehiclesList = await fetchVehicles();
      const loadedVehicle = await loadSelectedVehicle();
      const vehicleIdForKeys = loadedVehicle?.id;

      if (vehicleIdForKeys) {
        await fetchKeys(String(vehicleIdForKeys));
      } else if (vehiclesList.length === 0) {
        await fetchKeys();
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    }
  }, [fetchVehicles, loadSelectedVehicle, fetchKeys]);

  useEffect(() => {
    loadData();
    initializeBLE();
  }, [initializeBLE, loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleVehicleCommand = async (command: VehicleControlRequest["command"]) => {
    if (!selectedVehicle || !activeKey) {
      Alert.alert("Error", "No vehicle or key selected");
      return;
    }

    setCommandLoading(command);

    try {
      if (connection.isConnected) {
        try {
          await CertificateService.ensureUserCertificate(
            Number(selectedVehicleId),
            activeKey.permissions,
          );
        } catch (certError) {
          console.warn("Failed to ensure user certificate:", certError);
        }
        const commandPacket = ProtocolHandler.createCommandPacket(command, activeKey.id);
        const response = await sendCommand(commandPacket);
        if (response?.success) {
          const raw = response.data;
          const statusPayload =
            raw && typeof raw === "object"
              ? raw.status && typeof raw.status === "object"
                ? raw.status
                : raw
              : undefined;
          await applyStatusFromBle(
            String(selectedVehicle.id),
            command,
            statusPayload,
            response.timestamp,
          );
          await fetchVehicleStatus(String(selectedVehicle.id));
        }
      } else {
        await controlVehicle(selectedVehicle.id, {
          command,
          keyId: activeKey.id,
        });
        await fetchVehicleStatus(String(selectedVehicle.id));
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || `Failed to send ${command.toLowerCase()} command`);
    } finally {
      setCommandLoading(null);
    }
  };

  const handleVehicleQuickSelect = async (vehicle: Vehicle) => {
    try {
      await selectVehicle(vehicle);
    } catch (error) {
      console.error("Failed to select vehicle:", error);
    }
  };

  const handleStartPairing = async () => {
    if (!selectedVehicle) {
      Alert.alert("Pairing", "Select a vehicle before starting pairing.");
      return;
    }

    try {
      const expectedDeviceId = selectedVehicle.device_id;
      await startPairing(selectedVehicle.id, {
        expectedDeviceIds: expectedDeviceId ? [expectedDeviceId] : undefined,
      });
    } catch (error: any) {
      Alert.alert("Pairing Error", error.message || "Failed to start pairing");
    }
  };

  const handleSelectPairingDevice = async (deviceId: string) => {
    try {
      await selectPairingDevice(deviceId);
    } catch (error: any) {
      Alert.alert("Pairing Error", error.message || "Failed to connect to device");
    }
  };

  const handleCancelPairing = async () => {
    try {
      await cancelPairing();
    } catch (error: any) {
      Alert.alert("Pairing Error", error.message || "Failed to cancel pairing");
    }
  };

  const handleResetPairing = async () => {
    try {
      await resetPairing();
    } catch (error) {
      console.error("Failed to reset pairing:", error);
    }
  };

  const handleRetryPairing = async () => {
    if (!selectedVehicle) {
      Alert.alert("Pairing", "Select a vehicle before starting pairing.");
      return;
    }

    await handleResetPairing();
    await handleStartPairing();
  };

  const getConnectionStatus = (): "connected" | "connecting" | "disconnected" => {
    if (connection.isConnected) {
      return "connected";
    }

    if (
      [
        "scanning",
        "deviceSelected",
        "connecting",
        "challenge",
        "registering",
        "completing",
      ].includes(pairingStep)
    ) {
      return "connecting";
    }

    return "disconnected";
  };

  const getStatusIcon = (status: "connected" | "connecting" | "disconnected") => {
    switch (status) {
      case "connected":
        return { name: "bluetooth-connected", color: Colors.success };
      case "connecting":
        return { name: "bluetooth-searching", color: Colors.warning };
      default:
        return { name: "bluetooth-disabled", color: Colors.error };
    }
  };

  const connectionStatus = getConnectionStatus();
  const statusIcon = getStatusIcon(connectionStatus);

  const connectionTitle = (() => {
    if (connection.isConnected) {
      return connection.connectedDevice?.name
        ? `Connected to ${connection.connectedDevice.name}`
        : "Connected";
    }

    if (connectionStatus === "connecting") {
      return "Connecting...";
    }

    return "Not connected";
  })();

  const connectionSubtitle = (() => {
    if (pairingMessage) {
      return pairingMessage;
    }

    if (connectionStatus === "connected") {
      return "Secure session ready. You can control the vehicle immediately.";
    }

    if (connectionStatus === "connecting") {
      return "Finishing secure handshake with the vehicle...";
    }

    return "Scan for the registered vehicle to start a secure session.";
  })();

  const hasSelectedVehicle = Boolean(selectedVehicle);
  const hasRegisteredVehicles = vehicles.length > 0;

  const renderDiscoveredDevices = () => {
    if (connection.discoveredDevices.length === 0) {
      return (
        <View style={styles.devicePlaceholder}>
          <LoadingSpinner size="small" color={Colors.primary} />
          <Text style={styles.devicePlaceholderText}>Searching for devices...</Text>
        </View>
      );
    }

    return connection.discoveredDevices.map((device) => (
      <TouchableOpacity
        key={device.id}
        style={styles.deviceItem}
        onPress={() => handleSelectPairingDevice(device.id)}
      >
        <Text style={styles.deviceName}>{device.name || "Unknown device"}</Text>
        {device.rssi !== undefined ? (
          <Text style={styles.deviceMeta}>RSSI {device.rssi}</Text>
        ) : null}
      </TouchableOpacity>
    ));
  };

  const renderPairingCard = () => (
    <View style={styles.connectionCard}>
      <View style={styles.connectionHeader}>
        <Icon name={statusIcon.name} size={24} color={statusIcon.color} />
        <View style={styles.connectionHeaderText}>
          <Text style={styles.connectionTitle}>{connectionTitle}</Text>
          {connectionSubtitle ? (
            <Text style={styles.connectionSubtitle}>{connectionSubtitle}</Text>
          ) : null}
        </View>
      </View>

      {pairingStep === "scanning" ? (
        <View style={styles.deviceList}>{renderDiscoveredDevices()}</View>
      ) : null}

      {pairingStep === "error" && pairingContext.error ? (
        <Text style={styles.pairingError}>{pairingContext.error}</Text>
      ) : null}

      {pairingStep === "completed" && pairingContext.result?.message ? (
        <Text style={styles.pairingSuccess}>{pairingContext.result.message}</Text>
      ) : null}

      <View style={styles.connectionActions}>
        {pairingStep === "idle" && (
          <Button
            title={connection.isConnected ? "Rescan Devices" : "Scan & Pair"}
            size="small"
            onPress={handleStartPairing}
          />
        )}

        {pairingStep === "scanning" && (
          <Button title="Cancel" size="small" variant="secondary" onPress={handleCancelPairing} />
        )}

        {pairingStep === "error" && (
          <>
            <Button title="Retry" size="small" onPress={handleRetryPairing} />
            <Button title="Cancel" size="small" variant="secondary" onPress={handleCancelPairing} />
          </>
        )}

        {pairingStep === "completed" && (
          <Button title="Done" size="small" onPress={handleResetPairing} />
        )}

        {["deviceSelected", "connecting", "challenge", "registering", "completing"].includes(
          pairingStep,
        ) && (
          <Button title="Cancel" size="small" variant="secondary" onPress={handleCancelPairing} />
        )}
      </View>
    </View>
  );

  const renderVehicleSummary = () => {
    if (!selectedVehicle) {
      return null;
    }

    return (
      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <Icon name="directions-car" size={32} color={Colors.primary} />
          <View style={styles.summaryInfo}>
            <Text style={styles.vehicleName}>{selectedVehicle.name || selectedVehicle.model}</Text>
            <Text style={styles.vehicleModel}>{selectedVehicle.model}</Text>
          </View>
        </View>
        <View style={styles.summaryActions}>
          <Button
            title="Change Vehicle"
            size="small"
            variant="secondary"
            onPress={() => navigation.navigate("VehicleList")}
          />
        </View>
      </View>
    );
  };

  const renderControlButtons = () => (
    <View style={styles.controlSection}>
      <Text style={styles.sectionTitle}>Vehicle Control</Text>
      <View style={styles.controlGrid}>
        <TouchableOpacity
          style={[
            styles.controlButton,
            currentStatus?.doorsLocked ? styles.controlButtonActive : null,
          ]}
          onPress={() => handleVehicleCommand("UNLOCK")}
          disabled={commandLoading === "UNLOCK"}
        >
          {commandLoading === "UNLOCK" ? (
            <LoadingSpinner size="small" color={Colors.white} />
          ) : (
            <>
              <Icon
                name="lock-open"
                size={28}
                color={currentStatus?.doorsLocked ? Colors.white : Colors.primary}
              />
              <Text
                style={[
                  styles.controlButtonText,
                  currentStatus?.doorsLocked ? styles.controlButtonTextActive : null,
                ]}
              >
                Unlock
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.controlButton,
            !currentStatus?.doorsLocked ? styles.controlButtonActive : null,
          ]}
          onPress={() => handleVehicleCommand("LOCK")}
          disabled={commandLoading === "LOCK"}
        >
          {commandLoading === "LOCK" ? (
            <LoadingSpinner size="small" color={Colors.white} />
          ) : (
            <>
              <Icon
                name="lock"
                size={28}
                color={!currentStatus?.doorsLocked ? Colors.white : Colors.primary}
              />
              <Text
                style={[
                  styles.controlButtonText,
                  !currentStatus?.doorsLocked ? styles.controlButtonTextActive : null,
                ]}
              >
                Lock
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.controlButton,
            currentStatus?.engineRunning ? styles.controlButtonActive : null,
          ]}
          onPress={() => handleVehicleCommand("START")}
          disabled={commandLoading === "START"}
        >
          {commandLoading === "START" ? (
            <LoadingSpinner size="small" color={Colors.white} />
          ) : (
            <>
              <Icon
                name="power-settings-new"
                size={28}
                color={currentStatus?.engineRunning ? Colors.white : Colors.primary}
              />
              <Text
                style={[
                  styles.controlButtonText,
                  currentStatus?.engineRunning ? styles.controlButtonTextActive : null,
                ]}
              >
                Start
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStatusSection = () => (
    <View style={styles.statusSection}>
      <Text style={styles.sectionTitle}>Vehicle Status</Text>
      <View style={styles.statusGrid}>
        <View style={styles.statusItem}>
          <View style={styles.statusIcon}>
            <Icon
              name={currentStatus.doorsLocked ? "lock" : "lock-open"}
              size={24}
              color={currentStatus.doorsLocked ? Colors.error : Colors.success}
            />
          </View>
          <View style={styles.statusTextBlock}>
            <Text style={styles.statusLabel}>Doors</Text>
            <Text style={styles.statusValue}>
              {currentStatus.doorsLocked ? "Locked" : "Unlocked"}
            </Text>
          </View>
        </View>

        <View style={styles.statusItem}>
          <View style={styles.statusIcon}>
            <Icon
              name="power-settings-new"
              size={24}
              color={currentStatus.engineRunning ? Colors.success : Colors.textSecondary}
            />
          </View>
          <View style={styles.statusTextBlock}>
            <Text style={styles.statusLabel}>Engine</Text>
            <Text style={styles.statusValue}>
              {currentStatus.engineRunning ? "Running" : "Off"}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderRegistrationContent = () => (
    <View style={styles.registrationCard}>
      <Icon name="directions-car" size={48} color={Colors.primary} />
      <Text style={styles.sectionTitle}>Register Your Vehicle</Text>
      <Text style={styles.bodyText}>
        Select or add a vehicle, then start Bluetooth pairing to complete onboarding.
      </Text>

      {hasRegisteredVehicles ? (
        <>
          <View style={styles.vehicleQuickList}>
            {vehicles.slice(0, 3).map((vehicle) => (
              <TouchableOpacity
                key={vehicle.id}
                style={[
                  styles.vehicleQuickItem,
                  selectedVehicle?.id === vehicle.id ? styles.vehicleQuickItemActive : null,
                ]}
                onPress={() => handleVehicleQuickSelect(vehicle)}
              >
                <Text
                  style={[
                    styles.vehicleQuickName,
                    selectedVehicle?.id === vehicle.id ? styles.vehicleQuickNameActive : null,
                  ]}
                >
                  {vehicle.name || vehicle.model}
                </Text>
                <Text style={styles.vehicleQuickMeta}>{vehicle.model}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Button
            title="Manage Vehicles"
            variant="secondary"
            onPress={() => navigation.navigate("VehicleList")}
            style={styles.registrationButton}
          />
        </>
      ) : (
        <Button
          title="Add Vehicle"
          onPress={() => navigation.navigate("AddVehicle")}
          style={styles.registrationButton}
        />
      )}

      <Text style={styles.helperText}>
        {hasRegisteredVehicles
          ? "Select a vehicle to bring it into Home, then start BLE pairing."
          : "Add a vehicle to your account before starting BLE pairing."}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Digital Key" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!hasSelectedVehicle && !isLoading ? (
          renderRegistrationContent()
        ) : (
          <>
            {renderVehicleSummary()}
            {renderPairingCard()}
            {renderControlButtons()}
            {renderStatusSection()}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Dimensions.spacing.md,
    paddingTop: Dimensions.spacing.md,
    paddingBottom: Dimensions.spacing.lg,
    gap: Dimensions.spacing.md,
  },
  registrationCard: {
    backgroundColor: Colors.surface,
    borderRadius: Dimensions.borderRadius.lg,
    padding: Dimensions.spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Dimensions.spacing.sm,
  },
  bodyText: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: Fonts.lineHeight.base,
  },
  helperText: {
    fontSize: Fonts.size.xs,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: Fonts.lineHeight.sm,
  },
  registrationButton: {
    alignSelf: "stretch",
  },
  vehicleQuickList: {
    alignSelf: "stretch",
    gap: Dimensions.spacing.sm,
  },
  vehicleQuickItem: {
    padding: Dimensions.spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Dimensions.borderRadius.md,
    backgroundColor: Colors.surfaceSecondary,
  },
  vehicleQuickItemActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  vehicleQuickName: {
    fontSize: Fonts.size.base,
    fontFamily: Fonts.family.medium,
    color: Colors.text,
  },
  vehicleQuickNameActive: {
    color: Colors.white,
  },
  vehicleQuickMeta: {
    fontSize: Fonts.size.xs,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
    marginTop: Dimensions.spacing.xs / 2,
  },
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: Dimensions.borderRadius.lg,
    padding: Dimensions.spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Dimensions.spacing.sm,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Dimensions.spacing.md,
  },
  summaryInfo: {
    flex: 1,
  },
  summaryActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  vehicleName: {
    fontSize: Fonts.size.xl,
    fontFamily: Fonts.family.semibold,
    color: Colors.text,
  },
  vehicleModel: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  connectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Dimensions.borderRadius.lg,
    padding: Dimensions.spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Dimensions.spacing.sm,
  },
  connectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Dimensions.spacing.sm,
  },
  connectionHeaderText: {
    flex: 1,
  },
  connectionTitle: {
    fontSize: Fonts.size.base,
    fontFamily: Fonts.family.medium,
    color: Colors.text,
  },
  connectionSubtitle: {
    fontSize: Fonts.size.xs,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
    marginTop: Dimensions.spacing.xs / 2,
  },
  pairingError: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.medium,
    color: Colors.error,
  },
  pairingSuccess: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.medium,
    color: Colors.success,
  },
  deviceList: {
    gap: Dimensions.spacing.sm,
  },
  devicePlaceholder: {
    flexDirection: "row",
    alignItems: "center",
    gap: Dimensions.spacing.sm,
  },
  devicePlaceholderText: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
  },
  deviceItem: {
    padding: Dimensions.spacing.sm,
    borderRadius: Dimensions.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSecondary,
  },
  deviceName: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.medium,
    color: Colors.text,
  },
  deviceMeta: {
    marginTop: Dimensions.spacing.xs / 2,
    fontSize: Fonts.size.xs,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
  },
  connectionActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Dimensions.spacing.sm,
  },
  controlSection: {
    backgroundColor: Colors.surface,
    borderRadius: Dimensions.borderRadius.lg,
    padding: Dimensions.spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Dimensions.spacing.sm,
  },
  sectionTitle: {
    fontSize: Fonts.size.lg,
    fontFamily: Fonts.family.semibold,
    color: Colors.text,
  },
  controlGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "stretch",
    gap: Dimensions.spacing.sm,
  },
  controlButton: {
    flexBasis: "31%",
    maxWidth: "31%",
    flexGrow: 0,
    backgroundColor: Colors.surface,
    borderRadius: Dimensions.borderRadius.lg,
    paddingVertical: Dimensions.spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Dimensions.spacing.xs,
  },
  controlButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  controlButtonText: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.medium,
    color: Colors.primary,
  },
  controlButtonTextActive: {
    color: Colors.white,
  },
  statusSection: {
    backgroundColor: Colors.surface,
    borderRadius: Dimensions.borderRadius.lg,
    padding: Dimensions.spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Dimensions.spacing.sm,
  },
  statusGrid: {
    flexDirection: "row",
    gap: Dimensions.spacing.sm,
  },
  statusItem: {
    flex: 1,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Dimensions.borderRadius.md,
    padding: Dimensions.spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Dimensions.spacing.sm,
  },
  statusIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  statusTextBlock: {
    flex: 1,
    gap: 2,
  },
  statusLabel: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
  },
  statusValue: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.medium,
    color: Colors.text,
  },
  statusPlaceholder: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
  },
});
