import React, { useEffect } from 'react';
import { StatusBar, LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from '@/navigation/AppNavigator';
import { Colors } from '@/styles';
import { backgroundOptimizer } from '@/services/optimization/BackgroundOptimizer';

// Ignore specific warnings for development
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'VirtualizedLists should never be nested',
]);

const App: React.FC = () => {
  useEffect(() => {
    // Initialize background optimizations when app starts
    const initializeOptimizations = async () => {
      try {
        console.log('Initializing PKI optimizations...');
        await backgroundOptimizer.initialize();
        console.log('PKI optimizations initialized successfully');
      } catch (error) {
        console.error('PKI optimization initialization failed:', error);
        // Continue app startup even if optimization fails
      }
    };

    initializeOptimizations();

    // Cleanup on app unmount
    return () => {
      backgroundOptimizer.dispose();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="light-content"
        backgroundColor={Colors.primary}
        translucent
      />
      <AppNavigator />
    </SafeAreaProvider>
  );
};

export default App;