import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationProp, useFocusEffect, useNavigation } from "@react-navigation/native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { Button, Header, LoadingSpinner } from "@/components/common";
import { useVehicleStore } from "@/stores";
import { Colors, Dimensions, Fonts } from "@/styles";
import type { Vehicle, NavigationParams } from "@/types";

export const VehicleListScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<NavigationParams>>();
  const { vehicles, fetchVehicles, isLoading, selectVehicle, vehicleStatuses } = useVehicleStore();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchVehicles().catch(() => undefined);
    }, [fetchVehicles]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchVehicles();
    } finally {
      setRefreshing(false);
    }
  }, [fetchVehicles]);

  const handleSelectVehicle = useCallback(
    async (vehicle: Vehicle) => {
      await selectVehicle(vehicle);
      navigation.navigate("VehicleDetail", { vehicleId: String(vehicle.id) });
    },
    [navigation, selectVehicle],
  );

  const renderVehicle = ({ item }: { item: Vehicle }) => {
    const status = vehicleStatuses[String(item.id)];
    const statusLabel = !status
      ? "Unknown"
      : status.connected
        ? status.engineRunning
          ? "Connected - Engine On"
          : "Connected"
        : "Disconnected";

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        style={styles.vehicleCard}
        onPress={() => handleSelectVehicle(item)}
      >
        <View style={styles.vehicleIconWrapper}>
          <Icon name="directions-car" size={32} color={Colors.primary} />
        </View>
        <View style={styles.vehicleInfo}>
          <Text style={styles.vehicleName}>{item.name || item.model}</Text>
          <Text style={styles.vehicleMeta}>VIN: {item.vin}</Text>
          {item.device_id ? (
            <Text style={styles.vehicleMeta}>Device ID: {item.device_id}</Text>
          ) : null}
          <Text style={styles.vehicleStatusLabel}>Status: {statusLabel}</Text>
        </View>
        <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="directions-car" size={64} color={Colors.textMuted} />
      <Text style={styles.emptyTitle}>No Vehicles Yet</Text>
      <Text style={styles.emptyMessage}>
        Add your first vehicle to start using your digital key.
      </Text>
      <Button
        title="Add Vehicle"
        onPress={() => navigation.navigate("AddVehicle")}
        style={styles.primaryAction}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Header title="My Vehicles" />

      <View style={styles.actionsRow}>
        <Button
          title="Add Vehicle"
          size="small"
          onPress={() => navigation.navigate("AddVehicle")}
        />
      </View>

      {isLoading && vehicles.length === 0 ? (
        <View style={styles.loaderWrapper}>
          <LoadingSpinner />
        </View>
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderVehicle}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={renderEmptyState}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  actionsRow: {
    paddingHorizontal: Dimensions.spacing.lg,
    paddingVertical: Dimensions.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  listContent: {
    paddingHorizontal: Dimensions.spacing.lg,
    paddingVertical: Dimensions.spacing.lg,
    gap: Dimensions.spacing.md,
  },
  vehicleCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Dimensions.spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Dimensions.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: Dimensions.elevation.sm,
  },
  vehicleIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Dimensions.spacing.md,
  },
  vehicleInfo: {
    flex: 1,
    gap: Dimensions.spacing.xs / 2,
  },
  vehicleName: {
    fontSize: Fonts.size.base,
    fontFamily: Fonts.family.semibold,
    color: Colors.text,
  },
  vehicleMeta: {
    fontSize: Fonts.size.xs,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
  },
  vehicleStatusLabel: {
    fontSize: Fonts.size.xs,
    fontFamily: Fonts.family.medium,
    color: Colors.primary,
  },
  loaderWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: {
    marginTop: Dimensions.spacing.xl,
    alignItems: "center",
    paddingHorizontal: Dimensions.spacing.lg,
  },
  emptyTitle: {
    fontSize: Fonts.size.lg,
    fontFamily: Fonts.family.semibold,
    color: Colors.text,
    marginTop: Dimensions.spacing.md,
  },
  emptyMessage: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: Dimensions.spacing.sm,
    marginBottom: Dimensions.spacing.lg,
  },
  primaryAction: {
    minWidth: 180,
  },
});
