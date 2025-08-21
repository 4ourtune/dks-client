import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  TouchableOpacityProps,
} from 'react-native';
import { Colors, Fonts, Dimensions } from '@/styles';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  style,
  textStyle,
  ...props
}) => {
  const buttonStyle = [
    styles.base,
    styles[variant],
    styles[size],
    fullWidth && styles.fullWidth,
    disabled && styles.disabled,
    style,
  ];

  const textColor = getTextColor(variant, disabled);
  
  const buttonTextStyle = [
    styles.text,
    styles[`text${size.charAt(0).toUpperCase() + size.slice(1)}` as keyof typeof styles],
    { color: textColor },
    textStyle,
  ];

  return (
    <TouchableOpacity
      style={buttonStyle}
      disabled={disabled || loading}
      activeOpacity={0.7}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <>{icon}</>
          )}
          <Text style={buttonTextStyle}>{title}</Text>
          {icon && iconPosition === 'right' && (
            <>{icon}</>
          )}
        </>
      )}
    </TouchableOpacity>
  );
};

const getTextColor = (variant: ButtonVariant, disabled: boolean): string => {
  if (disabled) {
    return Colors.textMuted;
  }

  switch (variant) {
    case 'primary':
      return Colors.white;
    case 'secondary':
      return Colors.white;
    case 'outline':
      return Colors.primary;
    case 'ghost':
      return Colors.primary;
    case 'danger':
      return Colors.white;
    default:
      return Colors.white;
  }
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Dimensions.borderRadius.md,
    paddingHorizontal: Dimensions.spacing.md,
    minHeight: Dimensions.minTouchTarget,
    gap: Dimensions.spacing.sm,
  },
  
  primary: {
    backgroundColor: Colors.primary,
    borderWidth: 0,
  },
  
  secondary: {
    backgroundColor: Colors.secondary,
    borderWidth: 0,
  },
  
  outline: {
    backgroundColor: Colors.transparent,
    borderWidth: Dimensions.borderWidth.base,
    borderColor: Colors.primary,
  },
  
  ghost: {
    backgroundColor: Colors.transparent,
    borderWidth: 0,
  },
  
  danger: {
    backgroundColor: Colors.error,
    borderWidth: 0,
  },
  
  small: {
    paddingHorizontal: Dimensions.spacing.sm,
    minHeight: 36,
  },
  
  medium: {
    paddingHorizontal: Dimensions.spacing.md,
    minHeight: Dimensions.minTouchTarget,
  },
  
  large: {
    paddingHorizontal: Dimensions.spacing.lg,
    minHeight: 52,
  },
  
  fullWidth: {
    width: '100%',
  },
  
  disabled: {
    backgroundColor: Colors.gray200,
    borderColor: Colors.gray200,
    opacity: Dimensions.opacity.disabled,
  },
  
  text: {
    fontFamily: Fonts.family.medium,
    textAlign: 'center',
  },
  
  textSmall: {
    fontSize: Fonts.size.sm,
    lineHeight: Fonts.lineHeight.sm,
  },
  
  textMedium: {
    fontSize: Fonts.size.base,
    lineHeight: Fonts.lineHeight.base,
  },
  
  textLarge: {
    fontSize: Fonts.size.lg,
    lineHeight: Fonts.lineHeight.lg,
  },
});