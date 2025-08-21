import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Colors, Fonts, Dimensions } from '@/styles';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  leftIcon?: string;
  rightIcon?: string;
  onLeftPress?: () => void;
  onRightPress?: () => void;
  backgroundColor?: string;
  titleColor?: string;
  iconColor?: string;
  style?: ViewStyle;
  titleStyle?: TextStyle;
  showBackButton?: boolean;
  centerTitle?: boolean;
  elevation?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  leftIcon,
  rightIcon,
  onLeftPress,
  onRightPress,
  backgroundColor = Colors.primary,
  titleColor = Colors.white,
  iconColor = Colors.white,
  style,
  titleStyle,
  showBackButton = false,
  centerTitle = true,
  elevation = true,
}) => {
  const insets = useSafeAreaInsets();
  
  const headerStyle = [
    styles.container,
    { 
      backgroundColor,
      paddingTop: insets.top,
      height: Dimensions.header.height + insets.top,
    },
    elevation && styles.elevation,
    style,
  ];

  const finalTitleStyle = [
    styles.title,
    { color: titleColor },
    centerTitle && styles.centerTitle,
    titleStyle,
  ];

  const displayLeftIcon = showBackButton ? 'arrow-back' : leftIcon;
  const handleLeftPress = showBackButton ? onLeftPress : onLeftPress;

  return (
    <>
      <StatusBar
        barStyle={backgroundColor === Colors.primary ? 'light-content' : 'dark-content'}
        backgroundColor={backgroundColor}
        translucent
      />
      <View style={headerStyle}>
        <View style={styles.content}>
          <View style={styles.leftSection}>
            {displayLeftIcon && (
              <TouchableOpacity
                onPress={handleLeftPress}
                style={styles.iconButton}
                hitSlop={Dimensions.hitSlop.md}
              >
                <Icon
                  name={displayLeftIcon}
                  size={Dimensions.icon.lg}
                  color={iconColor}
                />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.centerSection}>
            {title && (
              <Text style={finalTitleStyle} numberOfLines={1}>
                {title}
              </Text>
            )}
            {subtitle && (
              <Text style={[styles.subtitle, { color: titleColor }]} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>

          <View style={styles.rightSection}>
            {rightIcon && (
              <TouchableOpacity
                onPress={onRightPress}
                style={styles.iconButton}
                hitSlop={Dimensions.hitSlop.md}
              >
                <Icon
                  name={rightIcon}
                  size={Dimensions.icon.lg}
                  color={iconColor}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </>
  );
};

export const SimpleHeader: React.FC<{
  title: string;
  onBackPress?: () => void;
}> = ({ title, onBackPress }) => {
  return (
    <Header
      title={title}
      showBackButton={!!onBackPress}
      onLeftPress={onBackPress}
      centerTitle
    />
  );
};

export const TabHeader: React.FC<{
  title: string;
  rightIcon?: string;
  onRightPress?: () => void;
}> = ({ title, rightIcon, onRightPress }) => {
  return (
    <Header
      title={title}
      rightIcon={rightIcon}
      onRightPress={onRightPress}
      centerTitle
    />
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.primary,
    justifyContent: 'flex-end',
  },
  
  elevation: {
    elevation: Dimensions.elevation.base,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    height: Dimensions.header.height,
    paddingHorizontal: Dimensions.spacing.md,
  },
  
  leftSection: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Dimensions.spacing.sm,
  },
  
  rightSection: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  
  iconButton: {
    padding: Dimensions.spacing.xs,
    borderRadius: Dimensions.borderRadius.full,
  },
  
  title: {
    fontSize: Fonts.size.lg,
    fontFamily: Fonts.family.semibold,
    textAlign: 'center',
    lineHeight: Fonts.lineHeight.lg,
  },
  
  centerTitle: {
    textAlign: 'center',
  },
  
  subtitle: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    textAlign: 'center',
    marginTop: 2,
    opacity: Dimensions.opacity.secondary,
    lineHeight: Fonts.lineHeight.sm,
  },
});