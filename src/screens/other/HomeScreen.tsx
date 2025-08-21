import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Button, Header, LoadingSpinner } from '@/components/common';
import { useVehicleStore, useBLEStore, useKeyStore } from '@/stores';
import { Colors, Fonts, Dimensions } from '@/styles';
import { VEHICLE_COMMANDS, API_BASE_URL } from '@/utils/constants';
import { ProtocolHandler } from '@/services/ble';
import axios from 'axios';

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation();
  const { 
    selectedVehicle, 
    vehicleStatuses, 
    fetchVehicles, 
    controlVehicle, 
    isLoading,
    loadSelectedVehicle 
  } = useVehicleStore();
  
  const { 
    connection, 
    sendCommand, 
    connectToDevice, 
    startScan,
    initialize: initializeBLE 
  } = useBLEStore();
  
  const { keys, fetchKeys } = useKeyStore();
  
  const [refreshing, setRefreshing] = useState(false);
  const [commandLoading, setCommandLoading] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const currentStatus = selectedVehicle ? vehicleStatuses[selectedVehicle.id] : null;
  const activeKey = keys.find(key => key.vehicleId === selectedVehicle?.id && key.isActive);

  useEffect(() => {
    loadData();
    initializeBLE();
  }, []);

  const loadData = async () => {
    try {
      await Promise.all([
        fetchVehicles(),
        loadSelectedVehicle(),
      ]);
      
      if (selectedVehicle) {
        await fetchKeys(selectedVehicle.id);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleVehicleCommand = async (command: keyof typeof VEHICLE_COMMANDS) => {
    if (!selectedVehicle || !activeKey) {
      Alert.alert('Error', 'No vehicle or key selected');
      return;
    }

    setCommandLoading(command);

    try {
      if (connection.isConnected) {
        const commandPacket = ProtocolHandler.createCommandPacket(command, activeKey.id);
        await sendCommand(commandPacket);
      } else {
        await controlVehicle(selectedVehicle.id, {
          command,
          keyId: activeKey.id,
        });
      }
      
      Alert.alert('Success', `${command.toLowerCase()} command sent successfully`);
    } catch (error: any) {
      Alert.alert('Error', error.message || `Failed to send ${command.toLowerCase()} command`);
    } finally {
      setCommandLoading(null);
    }
  };

  const handleBLEConnection = async () => {
    try {
      if (connection.isConnected) {
        // Already connected, show status
        return;
      }
      
      await startScan();
      // For demo purposes, auto-connect to first discovered device
      if (connection.discoveredDevices.length > 0) {
        await connectToDevice(connection.discoveredDevices[0].id);
      }
    } catch (error: any) {
      Alert.alert('BLE Error', error.message || 'Failed to connect to vehicle');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return { name: 'bluetooth-connected', color: Colors.success };
      case 'connecting':
        return { name: 'bluetooth-searching', color: Colors.warning };
      case 'disconnected':
        return { name: 'bluetooth-disabled', color: Colors.error };
      default:
        return { name: 'bluetooth', color: Colors.textSecondary };
    }
  };

  const getConnectionStatus = () => {
    if (connection.isConnected) return 'connected';
    if (connection.isScanning) return 'connecting';
    return 'disconnected';
  };

  const handleTestAPI = async () => {
    setTestLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/test`, {
        testData: 'Hello from mobile app',
        timestamp: new Date().toISOString(),
        deviceInfo: 'React Native App'
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      Alert.alert(
        'API Test Success!', 
        `Response: ${response.data.message}\nServer Status: ${response.data.serverStatus}\nTimestamp: ${response.data.timestamp}`
      );
    } catch (error: any) {
      let errorMsg = 'Unknown error';
      if (error.response) {
        errorMsg = `Server Error: ${error.response.status} - ${error.response.data?.error || error.response.data?.message || 'Unknown'}`;
      } else if (error.request) {
        errorMsg = 'Network Error: No response from server';
      } else {
        errorMsg = `Request Error: ${error.message}`;
      }
      
      Alert.alert('API Test Failed', errorMsg);
    } finally {
      setTestLoading(false);
    }
  };

  if (!selectedVehicle && !isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Digital Key" />
        <View style={styles.emptyState}>
          <Icon name="directions-car" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No Vehicle Selected</Text>
          <Text style={styles.emptyText}>
            Please select a vehicle from your vehicle list to get started.
          </Text>
          <Button
            title="Add Vehicle"
            onPress={() => navigation.navigate('AddVehicle' as never)}
            style={styles.emptyButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Digital Key" rightIcon="settings" onRightPress={() => {}} />
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {selectedVehicle && (
          <>
            {/* Vehicle Info */}
            <View style={styles.vehicleCard}>
              <View style={styles.vehicleHeader}>
                <Icon name="directions-car" size={32} color={Colors.primary} />
                <View style={styles.vehicleInfo}>
                  <Text style={styles.vehicleName}>
                    {selectedVehicle.name || selectedVehicle.model}
                  </Text>
                  <Text style={styles.vehicleModel}>{selectedVehicle.model}</Text>
                </View>
              </View>
            </View>

            {/* BLE Connection Status */}
            <TouchableOpacity 
              style={styles.connectionCard}
              onPress={handleBLEConnection}
              activeOpacity={0.7}
            >
              <View style={styles.connectionHeader}>
                <Icon 
                  name={getStatusIcon(getConnectionStatus()).name} 
                  size={24} 
                  color={getStatusIcon(getConnectionStatus()).color} 
                />
                <Text style={styles.connectionTitle}>
                  {connection.isConnected ? 'Connected' : connection.isScanning ? 'Connecting...' : 'Disconnected'}
                </Text>
              </View>
              {connection.isConnected && (
                <Text style={styles.connectionSubtitle}>
                  Device: {connection.connectedDevice?.name}
                </Text>
              )}
            </TouchableOpacity>

            {/* Test API Button */}
            <View style={styles.testSection}>
              <Button
                title={testLoading ? "Testing..." : "Test API Connection"}
                onPress={handleTestAPI}
                loading={testLoading}
                style={[styles.testButton, testLoading && styles.testButtonLoading]}
                textStyle={styles.testButtonText}
              />
            </View>

            {/* Control Buttons */}
            <View style={styles.controlSection}>
              <Text style={styles.sectionTitle}>Vehicle Control</Text>
              
              <View style={styles.controlGrid}>
                <TouchableOpacity
                  style={[
                    styles.controlButton,
                    currentStatus?.doorsLocked ? styles.controlButtonActive : null
                  ]}
                  onPress={() => handleVehicleCommand('UNLOCK')}
                  disabled={commandLoading === 'UNLOCK'}
                >
                  {commandLoading === 'UNLOCK' ? (
                    <LoadingSpinner size="small" color={Colors.white} />
                  ) : (
                    <>
                      <Icon 
                        name="lock-open" 
                        size={28} 
                        color={currentStatus?.doorsLocked ? Colors.white : Colors.primary} 
                      />
                      <Text style={[
                        styles.controlButtonText,
                        currentStatus?.doorsLocked ? styles.controlButtonTextActive : null
                      ]}>
                        Unlock
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.controlButton,
                    !currentStatus?.doorsLocked ? styles.controlButtonActive : null
                  ]}
                  onPress={() => handleVehicleCommand('LOCK')}
                  disabled={commandLoading === 'LOCK'}
                >
                  {commandLoading === 'LOCK' ? (
                    <LoadingSpinner size="small" color={Colors.white} />
                  ) : (
                    <>
                      <Icon 
                        name="lock" 
                        size={28} 
                        color={!currentStatus?.doorsLocked ? Colors.white : Colors.primary} 
                      />
                      <Text style={[
                        styles.controlButtonText,
                        !currentStatus?.doorsLocked ? styles.controlButtonTextActive : null
                      ]}>
                        Lock
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.controlButton,
                    currentStatus?.engineRunning ? styles.controlButtonActive : null
                  ]}
                  onPress={() => handleVehicleCommand('START')}
                  disabled={commandLoading === 'START'}
                >
                  {commandLoading === 'START' ? (
                    <LoadingSpinner size="small" color={Colors.white} />
                  ) : (
                    <>
                      <Icon 
                        name="power-settings-new" 
                        size={28} 
                        color={currentStatus?.engineRunning ? Colors.white : Colors.primary} 
                      />
                      <Text style={[
                        styles.controlButtonText,
                        currentStatus?.engineRunning ? styles.controlButtonTextActive : null
                      ]}>
                        Start
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.controlButton}
                  onPress={() => handleVehicleCommand('TRUNK')}
                  disabled={commandLoading === 'TRUNK'}
                >
                  {commandLoading === 'TRUNK' ? (
                    <LoadingSpinner size="small" color={Colors.white} />
                  ) : (
                    <>
                      <Icon name="inventory" size={28} color={Colors.primary} />
                      <Text style={styles.controlButtonText}>Trunk</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Vehicle Status */}
            {currentStatus && (
              <View style={styles.statusSection}>
                <Text style={styles.sectionTitle}>Vehicle Status</Text>
                
                <View style={styles.statusGrid}>
                  <View style={styles.statusItem}>
                    <Icon name="battery-charging-full" size={24} color={Colors.success} />
                    <Text style={styles.statusLabel}>Battery</Text>
                    <Text style={styles.statusValue}>{currentStatus.battery}%</Text>
                  </View>
                  
                  <View style={styles.statusItem}>
                    <Icon 
                      name={currentStatus.doorsLocked ? "lock" : "lock-open"} 
                      size={24} 
                      color={currentStatus.doorsLocked ? Colors.error : Colors.success} 
                    />
                    <Text style={styles.statusLabel}>Doors</Text>
                    <Text style={styles.statusValue}>
                      {currentStatus.doorsLocked ? 'Locked' : 'Unlocked'}
                    </Text>
                  </View>
                  
                  <View style={styles.statusItem}>
                    <Icon 
                      name="power-settings-new" 
                      size={24} 
                      color={currentStatus.engineRunning ? Colors.success : Colors.textSecondary} 
                    />
                    <Text style={styles.statusLabel}>Engine</Text>
                    <Text style={styles.statusValue}>
                      {currentStatus.engineRunning ? 'Running' : 'Off'}
                    </Text>
                  </View>
                </View>
              </View>
            )}
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
    paddingHorizontal: Dimensions.spacing.lg,
    paddingBottom: Dimensions.spacing.xl,
  },
  
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Dimensions.spacing.xl,
  },
  
  emptyTitle: {
    fontSize: Fonts.size['2xl'],
    fontFamily: Fonts.family.semibold,
    color: Colors.text,
    textAlign: 'center',
    marginTop: Dimensions.spacing.lg,
    marginBottom: Dimensions.spacing.sm,
  },
  
  emptyText: {
    fontSize: Fonts.size.base,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: Fonts.lineHeight.base,
    marginBottom: Dimensions.spacing.xl,
  },
  
  emptyButton: {
    minWidth: 150,
  },
  
  vehicleCard: {
    backgroundColor: Colors.surface,
    borderRadius: Dimensions.borderRadius.lg,
    padding: Dimensions.spacing.lg,
    marginBottom: Dimensions.spacing.lg,
    elevation: Dimensions.elevation.sm,
  },
  
  vehicleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  vehicleInfo: {
    marginLeft: Dimensions.spacing.md,
    flex: 1,
  },
  
  vehicleName: {
    fontSize: Fonts.size.xl,
    fontFamily: Fonts.family.semibold,
    color: Colors.text,
    marginBottom: 2,
  },
  
  vehicleModel: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
  },
  
  connectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Dimensions.borderRadius.lg,
    padding: Dimensions.spacing.lg,
    marginBottom: Dimensions.spacing.lg,
    elevation: Dimensions.elevation.sm,
  },
  
  connectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  connectionTitle: {
    fontSize: Fonts.size.base,
    fontFamily: Fonts.family.medium,
    color: Colors.text,
    marginLeft: Dimensions.spacing.sm,
  },
  
  connectionSubtitle: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
    marginTop: Dimensions.spacing.xs,
  },
  
  controlSection: {
    marginBottom: Dimensions.spacing.lg,
  },
  
  sectionTitle: {
    fontSize: Fonts.size.lg,
    fontFamily: Fonts.family.semibold,
    color: Colors.text,
    marginBottom: Dimensions.spacing.md,
  },
  
  controlGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  
  controlButton: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: Dimensions.borderRadius.lg,
    padding: Dimensions.spacing.lg,
    alignItems: 'center',
    marginBottom: Dimensions.spacing.md,
    elevation: Dimensions.elevation.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  
  controlButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  
  controlButtonText: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.medium,
    color: Colors.primary,
    marginTop: Dimensions.spacing.xs,
  },
  
  controlButtonTextActive: {
    color: Colors.white,
  },
  
  statusSection: {
    marginBottom: Dimensions.spacing.lg,
  },
  
  statusGrid: {
    backgroundColor: Colors.surface,
    borderRadius: Dimensions.borderRadius.lg,
    padding: Dimensions.spacing.lg,
    elevation: Dimensions.elevation.sm,
  },
  
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Dimensions.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  
  statusLabel: {
    fontSize: Fonts.size.base,
    fontFamily: Fonts.family.regular,
    color: Colors.text,
    marginLeft: Dimensions.spacing.md,
    flex: 1,
  },
  
  statusValue: {
    fontSize: Fonts.size.base,
    fontFamily: Fonts.family.medium,
    color: Colors.textSecondary,
  },
  
  testSection: {
    marginBottom: Dimensions.spacing.lg,
  },
  
  testButton: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  
  testButtonLoading: {
    opacity: 0.7,
  },
  
  testButtonText: {
    color: Colors.white,
    fontFamily: Fonts.family.medium,
  },
});