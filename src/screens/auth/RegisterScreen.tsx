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
import { useAuthStore } from '@/stores';
import { Colors, Fonts, Dimensions } from '@/styles';
import { VALIDATION_RULES } from '@/utils/constants';

export const RegisterScreen: React.FC = () => {
  const navigation = useNavigation();
  const { register, isLoading, error, clearError } = useAuthStore();
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  
  const [errors, setErrors] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const validateForm = (): boolean => {
    const newErrors = {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    };

    const nameValue = formData.name.trim();
    if (!nameValue) {
      newErrors.name = 'Name is required';
    } else if (nameValue.length < VALIDATION_RULES.NAME.MIN_LENGTH) {
      newErrors.name = 'Name is required';
    } else if (nameValue.length > VALIDATION_RULES.NAME.MAX_LENGTH) {
      newErrors.name = 'Name too long';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!VALIDATION_RULES.EMAIL.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (!formData.password.trim()) {
      newErrors.password = 'Password is required';
    } else {
      const password = formData.password;
      const rules = VALIDATION_RULES.PASSWORD;
      
      if (password.length < rules.MIN_LENGTH) {
        newErrors.password = `Password must be at least ${rules.MIN_LENGTH} characters`;
      } else if (!rules.PATTERN.test(password)) {
        newErrors.password = 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character';
      }
    }

    if (!formData.confirmPassword.trim()) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return !Object.values(newErrors).some(error => error !== '');
  };

  const handleRegister = async () => {
    clearError();
    
    if (!validateForm()) {
      return;
    }

    try {
      await register({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      });
      
    } catch (err: any) {
      Alert.alert('Registration Failed', err.message || 'Please try again');
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
        title="Create Account"
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
          <View style={styles.header}>
            <Text style={styles.subtitle}>Join the Digital Key community</Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Full Name"
              value={formData.name}
              onChangeText={(text) => handleInputChange('name', text)}
              autoCapitalize="words"
              autoComplete="name"
              leftIcon="person"
              error={errors.name}
              placeholder="Enter your full name"
              required
            />

            <Input
              label="Email Address"
              value={formData.email}
              onChangeText={(text) => handleInputChange('email', text)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              leftIcon="email"
              error={errors.email}
              placeholder="Enter your email"
              required
            />

            <Input
              label="Password"
              value={formData.password}
              onChangeText={(text) => handleInputChange('password', text)}
              secureTextEntry
              autoComplete="new-password"
              leftIcon="lock"
              error={errors.password}
              placeholder="Create a password"
              hint="Password must be at least 8 characters with one uppercase, lowercase, number, and special character"
              required
            />

            <Input
              label="Confirm Password"
              value={formData.confirmPassword}
              onChangeText={(text) => handleInputChange('confirmPassword', text)}
              secureTextEntry
              autoComplete="new-password"
              leftIcon="lock"
              error={errors.confirmPassword}
              placeholder="Confirm your password"
              required
            />

            {error && (
              <Text style={styles.errorText}>{error}</Text>
            )}

            <Button
              title="Create Account"
              onPress={handleRegister}
              loading={isLoading}
              disabled={isLoading}
              style={styles.registerButton}
            />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              By creating an account, you agree to our Terms of Service and Privacy Policy
            </Text>
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
  
  header: {
    alignItems: 'center',
    marginBottom: Dimensions.spacing.xl,
  },
  
  subtitle: {
    fontSize: Fonts.size.base,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: Fonts.lineHeight.base,
  },
  
  form: {
    flex: 1,
    marginBottom: Dimensions.spacing.lg,
  },
  
  registerButton: {
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
  
  footer: {
    alignItems: 'center',
    paddingBottom: Dimensions.spacing.lg,
  },
  
  footerText: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: Fonts.lineHeight.sm,
  },
});