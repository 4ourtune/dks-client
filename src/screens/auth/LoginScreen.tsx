import React, { useState } from "react";
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
import { Button, Input } from "@/components/common";
import { useAuthStore } from "@/stores";
import { Colors, Fonts, Dimensions } from "@/styles";
import { VALIDATION_RULES } from "@/utils/constants";

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation();
  const { login, isLoading, error, clearError } = useAuthStore();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState({
    email: "",
    password: "",
  });

  const validateForm = (): boolean => {
    const newErrors = {
      email: "",
      password: "",
    };

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!VALIDATION_RULES.EMAIL.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.password.trim()) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < VALIDATION_RULES.PASSWORD.MIN_LENGTH) {
      newErrors.password = `Password must be at least ${VALIDATION_RULES.PASSWORD.MIN_LENGTH} characters`;
    }

    setErrors(newErrors);
    return !Object.values(newErrors).some((value) => value !== "");
  };

  const handleLogin = async () => {
    clearError();

    if (!validateForm()) {
      return;
    }

    try {
      await login({
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      });
    } catch (err: any) {
      Alert.alert("Login Failed", err.message || "Please try again");
    }
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }

    if (error) {
      clearError();
    }
  };

  const navigateToRegister = () => {
    navigation.navigate("Register" as never);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Sign in to your Digital Key account</Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Email Address"
              value={formData.email}
              onChangeText={(text) => handleInputChange("email", text)}
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
              onChangeText={(text) => handleInputChange("password", text)}
              secureTextEntry
              autoComplete="password"
              leftIcon="lock"
              error={errors.password}
              placeholder="Enter your password"
              required
            />

            {error && <Text style={styles.errorText}>{error}</Text>}

            <Button
              title="Sign In"
              onPress={handleLogin}
              loading={isLoading}
              disabled={isLoading}
              style={styles.loginButton}
            />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Don't have an account?{" "}
              <Text style={styles.linkText} onPress={navigateToRegister}>
                Sign Up
              </Text>
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
    paddingVertical: Dimensions.spacing.xl,
  },

  header: {
    alignItems: "center",
    marginBottom: Dimensions.spacing["3xl"],
    paddingTop: Dimensions.spacing.xl,
  },

  title: {
    fontSize: Fonts.size["3xl"],
    fontFamily: Fonts.family.bold,
    color: Colors.text,
    textAlign: "center",
    marginBottom: Dimensions.spacing.sm,
    lineHeight: Fonts.lineHeight["3xl"],
  },

  subtitle: {
    fontSize: Fonts.size.base,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: Fonts.lineHeight.base,
  },

  form: {
    flex: 1,
    justifyContent: "center",
    marginBottom: Dimensions.spacing.xl,
  },

  loginButton: {
    marginTop: Dimensions.spacing.lg,
  },

  errorText: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.error,
    textAlign: "center",
    marginBottom: Dimensions.spacing.md,
    lineHeight: Fonts.lineHeight.sm,
  },

  footer: {
    alignItems: "center",
    paddingBottom: Dimensions.spacing.lg,
  },

  footerText: {
    fontSize: Fonts.size.base,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: Fonts.lineHeight.base,
  },

  linkText: {
    color: Colors.primary,
    fontFamily: Fonts.family.semibold,
  },
});
