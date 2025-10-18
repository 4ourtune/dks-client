import React, { useState, forwardRef } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TouchableOpacity,
  TextStyle,
  StyleProp,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { Colors, Fonts, Dimensions } from "@/styles";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: string;
  rightIcon?: string;
  secureTextEntry?: boolean;
  disabled?: boolean;
  required?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  onRightIconPress?: () => void;
}

export const Input = forwardRef<TextInput, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      secureTextEntry = false,
      disabled = false,
      required = false,
      containerStyle,
      inputStyle,
      onRightIconPress,
      ...props
    },
    ref,
  ) => {
    const [isSecure, setIsSecure] = useState(secureTextEntry);
    const [isFocused, setIsFocused] = useState(false);

    const handleToggleSecure = () => {
      setIsSecure(!isSecure);
    };

    const inputContainerStyle = [
      styles.inputContainer,
      isFocused && styles.inputContainerFocused,
      error && styles.inputContainerError,
      disabled && styles.inputContainerDisabled,
    ];

    const inputTextStyle = [
      styles.input,
      leftIcon && styles.inputWithLeftIcon,
      (rightIcon || secureTextEntry) && styles.inputWithRightIcon,
      disabled && styles.inputDisabled,
      inputStyle,
    ];

    return (
      <View style={[styles.container, containerStyle]}>
        {label && (
          <View style={styles.labelContainer}>
            <Text style={styles.label}>
              {label}
              {required && <Text style={styles.required}> *</Text>}
            </Text>
          </View>
        )}

        <View style={inputContainerStyle}>
          {leftIcon && (
            <Icon
              name={leftIcon}
              size={Dimensions.icon.md}
              color={error ? Colors.error : Colors.textSecondary}
              style={styles.leftIcon}
            />
          )}

          <TextInput
            ref={ref}
            style={inputTextStyle}
            secureTextEntry={isSecure}
            editable={!disabled}
            placeholderTextColor={Colors.textMuted}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            {...props}
          />

          {secureTextEntry && (
            <TouchableOpacity
              onPress={handleToggleSecure}
              style={styles.rightIcon}
              hitSlop={Dimensions.hitSlop.sm}
            >
              <Icon
                name={isSecure ? "visibility" : "visibility-off"}
                size={Dimensions.icon.md}
                color={Colors.textSecondary}
              />
            </TouchableOpacity>
          )}

          {rightIcon && !secureTextEntry && (
            <TouchableOpacity
              onPress={onRightIconPress}
              style={styles.rightIcon}
              hitSlop={Dimensions.hitSlop.sm}
            >
              <Icon
                name={rightIcon}
                size={Dimensions.icon.md}
                color={error ? Colors.error : Colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>

        {(error || hint) && <Text style={error ? styles.error : styles.hint}>{error || hint}</Text>}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    marginBottom: Dimensions.spacing.md,
  },

  labelContainer: {
    marginBottom: Dimensions.spacing.xs,
  },

  label: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.medium,
    color: Colors.text,
    lineHeight: Fonts.lineHeight.sm,
  },

  required: {
    color: Colors.error,
  },

  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: Dimensions.borderWidth.base,
    borderColor: Colors.border,
    borderRadius: Dimensions.borderRadius.md,
    backgroundColor: Colors.surface,
    minHeight: Dimensions.minTouchTarget,
  },

  inputContainerFocused: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
  },

  inputContainerError: {
    borderColor: Colors.error,
  },

  inputContainerDisabled: {
    backgroundColor: Colors.gray100,
    borderColor: Colors.gray200,
  },

  input: {
    flex: 1,
    paddingHorizontal: Dimensions.spacing.md,
    paddingVertical: Dimensions.spacing.sm,
    fontSize: Fonts.size.base,
    fontFamily: Fonts.family.regular,
    color: Colors.text,
    lineHeight: Fonts.lineHeight.base,
  },

  inputWithLeftIcon: {
    paddingLeft: Dimensions.spacing.xs,
  },

  inputWithRightIcon: {
    paddingRight: Dimensions.spacing.xs,
  },

  inputDisabled: {
    color: Colors.textMuted,
  },

  leftIcon: {
    marginLeft: Dimensions.spacing.md,
  },

  rightIcon: {
    marginRight: Dimensions.spacing.md,
    padding: Dimensions.spacing.xs,
  },

  error: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.error,
    marginTop: Dimensions.spacing.xs,
    lineHeight: Fonts.lineHeight.sm,
  },

  hint: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
    marginTop: Dimensions.spacing.xs,
    lineHeight: Fonts.lineHeight.sm,
  },
});
