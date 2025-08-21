import React from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Colors, Fonts, Dimensions } from '@/styles';

type SpinnerSize = 'small' | 'medium' | 'large';

interface LoadingSpinnerProps {
  size?: SpinnerSize;
  color?: string;
  text?: string;
  overlay?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  color = Colors.primary,
  text,
  overlay = false,
  style,
  textStyle,
}) => {
  const spinnerSize = getSpinnerSize(size);
  
  const containerStyle = [
    styles.container,
    overlay && styles.overlay,
    style,
  ];

  const spinnerTextStyle = [
    styles.text,
    textStyle,
  ];

  if (overlay) {
    return (
      <View style={containerStyle}>
        <View style={styles.overlayContent}>
          <ActivityIndicator size={spinnerSize} color={color} />
          {text && <Text style={spinnerTextStyle}>{text}</Text>}
        </View>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <ActivityIndicator size={spinnerSize} color={color} />
      {text && <Text style={spinnerTextStyle}>{text}</Text>}
    </View>
  );
};

const getSpinnerSize = (size: SpinnerSize): 'small' | 'large' => {
  switch (size) {
    case 'small':
      return 'small';
    case 'medium':
      return 'small';
    case 'large':
      return 'large';
    default:
      return 'small';
  }
};

export const FullScreenLoader: React.FC<{
  text?: string;
  color?: string;
}> = ({ text = 'Loading...', color = Colors.primary }) => {
  return (
    <LoadingSpinner
      size="large"
      color={color}
      text={text}
      overlay
      style={styles.fullScreen}
    />
  );
};

export const InlineLoader: React.FC<{
  size?: SpinnerSize;
  color?: string;
}> = ({ size = 'small', color = Colors.primary }) => {
  return (
    <LoadingSpinner
      size={size}
      color={color}
      style={styles.inline}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: Dimensions.spacing.md,
  },
  
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  
  overlayContent: {
    backgroundColor: Colors.surface,
    padding: Dimensions.spacing.xl,
    borderRadius: Dimensions.borderRadius.lg,
    alignItems: 'center',
    minWidth: 120,
    elevation: Dimensions.elevation.lg,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  
  text: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
    marginTop: Dimensions.spacing.sm,
    textAlign: 'center',
    lineHeight: Fonts.lineHeight.sm,
  },
  
  fullScreen: {
    flex: 1,
  },
  
  inline: {
    padding: Dimensions.spacing.sm,
  },
});