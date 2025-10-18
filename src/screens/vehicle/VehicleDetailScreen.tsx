import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NavigationProp,
  RouteProp,
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { Button, Header, LoadingSpinner } from "@/components/common";
import { useVehicleStore, useKeyStore } from "@/stores";
import { Colors, Dimensions, Fonts } from "@/styles";
import type { VehicleStatus, NavigationParams } from "@/types";

type VehicleDetailRouteProp = RouteProp<NavigationParams, "VehicleDetail">;

export const VehicleDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<NavigationParams>>();
  const route = useRoute<VehicleDetailRouteProp>();
  const vehicleId = route.params?.vehicleId;

  const {
    vehicles,
    fetchVehicles,
    fetchVehicleStatus,
    selectVehicle,
    vehicleStatuses,
    deleteVehicle,
  } = useVehicleStore();
  const { fetchKeys } = useKeyStore();

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const vehicle = useMemo(
    () => vehicles.find((item) => String(item.id) === vehicleId),
    [vehicles, vehicleId],
  );

  const defaultStatus = useMemo(
    () => ({
      doorsLocked: false,
      engineRunning: false,
      connected: false,
    }),
    [],
  );

  const status: VehicleStatus | undefined = useMemo(() => {
    if (!vehicle) {
      return undefined;
    }

    return vehicleStatuses[String(vehicle.id)] ?? defaultStatus;
  }, [vehicle, vehicleStatuses, defaultStatus]);

  const connectionStatusLabel = useMemo(() => {
    if (!status) {
      return "Unknown";
    }

    if (status.connected) {
      return status.engineRunning ? "Connected - Engine On" : "Connected";
    }

    return "Disconnected";
  }, [status]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const load = async () => {
        try {
          const list = await fetchVehicles();
          const currentVehicle = list.find((item) => String(item.id) === vehicleId);
          if (currentVehicle) {
            await selectVehicle(currentVehicle);
            await Promise.all([
              fetchVehicleStatus(String(currentVehicle.id)),
              fetchKeys(String(currentVehicle.id)),
            ]);
          }
        } finally {
          if (isActive) {
            setLoading(false);
          }
        }
      };

      load().catch(() => setLoading(false));

      return () => {
        isActive = false;
      };
    }, [fetchVehicles, fetchKeys, fetchVehicleStatus, selectVehicle, vehicleId]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const list = await fetchVehicles();
      const currentVehicle = list.find((item) => String(item.id) === vehicleId);
      if (currentVehicle) {
        await Promise.all([
          fetchVehicleStatus(String(currentVehicle.id)),
          fetchKeys(String(currentVehicle.id)),
        ]);
      }
    } finally {
      setRefreshing(false);
    }
  }, [fetchVehicles, fetchKeys, fetchVehicleStatus, vehicleId]);

  const handleAddAnotherVehicle = useCallback(() => {
    navigation.navigate("AddVehicle");
  }, [navigation]);

  const handleRemoveVehicle = useCallback(async () => {
    if (!vehicle) {
      return;
    }
    await deleteVehicle(String(vehicle.id));
    navigation.goBack();
  }, [deleteVehicle, navigation, vehicle]);

  if (loading && !vehicle) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Vehicle" />
        <View style={styles.loaderWrapper}>
          <LoadingSpinner />
        </View>
      </SafeAreaView>
    );
  }

  if (!vehicle) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Vehicle" onLeftPress={() => navigation.goBack()} showBackButton />
        <View style={styles.emptyState}>
          <Icon name="directions-car" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Vehicle Not Found</Text>
          <Text style={styles.emptyMessage}>
            This vehicle is no longer available. Please refresh your list.
          </Text>
          <Button title="Back to Vehicles" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={vehicle.name || vehicle.model}
        showBackButton
        onLeftPress={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View style={styles.summaryCard}>
          <Icon name="directions-car" size={48} color={Colors.primary} />
          <Text style={styles.summaryName}>{vehicle.model}</Text>
          <Text style={styles.summaryMeta}>VIN: {vehicle.vin}</Text>
          {vehicle.device_id && (
            <Text style={styles.summaryMeta}>Device ID: {vehicle.device_id}</Text>
          )}
          <Text style={styles.statusBadge}>{connectionStatusLabel}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle Status</Text>
          {status ? (
            <View style={styles.statusGrid}>
              {Object.entries(status).map(([key, value]) => (
                <View key={key} style={styles.statusRow}>
                  <Text style={styles.statusLabel}>{key}</Text>
                  <Text style={styles.statusValue}>{String(value)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.statusPlaceholder}>No live status available yet.</Text>
          )}
          <Button
            title="Refresh Status"
            size="small"
            variant="secondary"
            onPress={() => fetchVehicleStatus(String(vehicle.id))}
            style={styles.statusAction}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.actionsColumn}>
            <Button title="Add Another Vehicle" onPress={handleAddAnotherVehicle} />
            <Button title="Remove Vehicle" variant="secondary" onPress={handleRemoveVehicle} />
          </View>
        </View>
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
    paddingHorizontal: Dimensions.spacing.lg,
    paddingVertical: Dimensions.spacing.lg,
    gap: Dimensions.spacing.lg,
  },
  loaderWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Dimensions.spacing.lg,
    gap: Dimensions.spacing.md,
  },
  emptyTitle: {
    fontSize: Fonts.size.lg,
    fontFamily: Fonts.family.semibold,
    color: Colors.text,
  },
  emptyMessage: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  summaryCard: {
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Dimensions.borderRadius.lg,
    padding: Dimensions.spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Dimensions.spacing.sm,
  },
  summaryName: {
    fontSize: Fonts.size.lg,
    fontFamily: Fonts.family.semibold,
    color: Colors.text,
  },
  summaryMeta: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
  },
  statusBadge: {
    marginTop: Dimensions.spacing.sm,
    fontSize: Fonts.size.xs,
    fontFamily: Fonts.family.medium,
    color: Colors.white,
    backgroundColor: Colors.primary,
    paddingHorizontal: Dimensions.spacing.md,
    paddingVertical: Dimensions.spacing.xs,
    borderRadius: Dimensions.borderRadius.full,
    overflow: "hidden",
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Dimensions.borderRadius.lg,
    padding: Dimensions.spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Dimensions.spacing.md,
  },
  sectionTitle: {
    fontSize: Fonts.size.base,
    fontFamily: Fonts.family.semibold,
    color: Colors.text,
  },
  statusGrid: {
    gap: Dimensions.spacing.sm,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: Dimensions.spacing.xs,
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
  statusAction: {
    alignSelf: "flex-start",
  },
  actionsColumn: {
    gap: Dimensions.spacing.sm,
  },
});
