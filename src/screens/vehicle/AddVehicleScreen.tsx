import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Button, Input, Header } from '@/components/common';
import { useVehicleStore } from '@/stores';
import { Colors, Fonts, Dimensions } from '@/styles';
import { VALIDATION_RULES } from '@/utils/constants';

export const AddVehicleScreen: React.FC = () => {
  const navigation = useNavigation();
  const { createVehicle, isLoading, error, clearError } = useVehicleStore();
  
  const [formData, setFormData] = useState({
    name: '',
    model: '',
    year: '',
    licensePlate: '',
    vin: '',
  });
  
  const [errors, setErrors] = useState({
    name: '',
    model: '',
    year: '',
    licensePlate: '',
    vin: '',
  });

  const validateForm = (): boolean => {
    const newErrors = {
      name: '',
      model: '',
      year: '',
      licensePlate: '',
      vin: '',
    };

    if (!formData.name.trim()) {
      newErrors.name = 'Vehicle name is required';
    }

    if (!formData.model.trim()) {
      newErrors.model = 'Vehicle model is required';
    }

    if (!formData.year.trim()) {
      newErrors.year = 'Vehicle year is required';
    } else {
      const year = parseInt(formData.year);
      const currentYear = new Date().getFullYear();
      if (isNaN(year) || year < 1900 || year > currentYear + 1) {
        newErrors.year = 'Please enter a valid year';
      }
    }

    if (!formData.licensePlate.trim()) {
      newErrors.licensePlate = 'License plate is required';
    }

    if (!formData.vin.trim()) {
      newErrors.vin = 'VIN is required';
    } else if (formData.vin.length !== 17) {
      newErrors.vin = 'VIN must be exactly 17 characters';
    }

    setErrors(newErrors);
    return !Object.values(newErrors).some(error => error !== '');
  };

  const handleAddVehicle = async () => {
    clearError();
    
    if (!validateForm()) {
      return;
    }

    try {
      await createVehicle({
        name: formData.name.trim(),
        model: formData.model.trim(),
        year: parseInt(formData.year),
        licensePlate: formData.licensePlate.trim().toUpperCase(),
        vin: formData.vin.trim().toUpperCase(),
      });
      
      Alert.alert('Success', 'Vehicle added successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add vehicle');
    }
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    
    if (error) {
      clearError();
    }
  };

  const handleBackPress = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Add Vehicle"
        showBackButton
        onLeftPress={handleBackPress}
      />
      
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.form}>
            <Input
              label="Vehicle Name"
              value={formData.name}
              onChangeText={(text) => handleInputChange('name', text)}
              autoCapitalize="words"
              leftIcon="directions-car"
              error={errors.name}
              placeholder="e.g., My Tesla Model 3"
              required
            />

            <Input
              label="Model"
              value={formData.model}
              onChangeText={(text) => handleInputChange('model', text)}
              autoCapitalize="words"
              leftIcon="category"
              error={errors.model}
              placeholder="e.g., Tesla Model 3"
              required
            />

            <Input
              label="Year"
              value={formData.year}
              onChangeText={(text) => handleInputChange('year', text)}
              keyboardType="numeric"
              leftIcon="event"
              error={errors.year}
              placeholder="e.g., 2023"
              maxLength={4}
              required
            />

            <Input
              label="License Plate"
              value={formData.licensePlate}
              onChangeText={(text) => handleInputChange('licensePlate', text)}
              autoCapitalize="characters"
              leftIcon="local-parking"
              error={errors.licensePlate}
              placeholder="e.g., ABC123"
              required
            />

            <Input
              label="VIN"
              value={formData.vin}
              onChangeText={(text) => handleInputChange('vin', text)}
              autoCapitalize="characters"
              leftIcon="fingerprint"
              error={errors.vin}
              placeholder="17-character VIN"
              maxLength={17}
              required
            />

            {error && (
              <Text style={styles.errorText}>{error}</Text>
            )}

            <Button
              title="Add Vehicle"
              onPress={handleAddVehicle}
              loading={isLoading}
              disabled={isLoading}
              style={styles.addButton}
            />
          </View>
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
  
  form: {
    flex: 1,
  },
  
  addButton: {
    marginTop: Dimensions.spacing.lg,
  },
  
  errorText: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.error,
    textAlign: 'center',
    marginBottom: Dimensions.spacing.md,
    lineHeight: Fonts.lineHeight.sm,
  },
});