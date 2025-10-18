import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/MaterialIcons";
import { Button, Input, Header } from "@/components/common";
import { useAuthStore } from "@/stores";
import { Colors, Fonts, Dimensions } from "@/styles";

export const ProfileScreen: React.FC = () => {
  const { user, logout, updateUser, isLoading } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
  });

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert("Error", "Name is required");
      return;
    }

    try {
      const updatedUser = { ...user!, name: formData.name.trim() };
      updateUser(updatedUser);
      setIsEditing(false);
      Alert.alert("Success", "Profile updated successfully");
    } catch (error) {
      Alert.alert("Error", "Failed to update profile");
    }
  };

  const handleCancel = () => {
    setFormData({
      name: user?.name || "",
      email: user?.email || "",
    });
    setIsEditing(false);
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
          } catch (error) {
            Alert.alert("Error", "Failed to sign out");
          }
        },
      },
    ]);
  };

  const profileItems = [
    {
      id: "vehicles",
      title: "My Vehicles",
      subtitle: "Manage registered vehicles",
      icon: "directions-car",
      onPress: () => {}, // TODO: Navigate to vehicles
    },
    {
      id: "keys",
      title: "Digital Keys",
      subtitle: "Manage your digital keys",
      icon: "vpn-key",
      onPress: () => {}, // TODO: Navigate to keys
    },
    {
      id: "settings",
      title: "App Settings",
      subtitle: "Preferences and notifications",
      icon: "settings",
      onPress: () => {}, // TODO: Navigate to settings
    },
    {
      id: "support",
      title: "Help & Support",
      subtitle: "Get help and contact support",
      icon: "help",
      onPress: () => {},
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Profile"
        rightIcon={isEditing ? "close" : "edit"}
        onRightPress={isEditing ? handleCancel : () => setIsEditing(true)}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Icon name="person" size={40} color={Colors.white} />
          </View>

          <View style={styles.profileInfo}>
            {isEditing ? (
              <>
                <Input
                  label="Full Name"
                  value={formData.name}
                  onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
                  containerStyle={styles.editInput}
                />

                <Input
                  label="Email Address"
                  value={formData.email}
                  editable={false}
                  containerStyle={styles.editInput}
                  inputStyle={styles.disabledInput}
                />

                <View style={styles.editActions}>
                  <Button
                    title="Cancel"
                    variant="outline"
                    size="small"
                    onPress={handleCancel}
                    style={styles.editButton}
                  />
                  <Button
                    title="Save"
                    size="small"
                    onPress={handleSave}
                    loading={isLoading}
                    style={styles.editButton}
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.userName}>{user?.name}</Text>
                <Text style={styles.userEmail}>{user?.email}</Text>
                <Text style={styles.memberSince}>
                  Member since {new Date(user?.createdAt || "").toLocaleDateString()}
                </Text>
              </>
            )}
          </View>
        </View>

        {!isEditing && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Account</Text>

              {profileItems.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.menuItem}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  <View style={styles.menuItemLeft}>
                    <View style={styles.menuIcon}>
                      <Icon name={item.icon} size={24} color={Colors.primary} />
                    </View>
                    <View style={styles.menuText}>
                      <Text style={styles.menuTitle}>{item.title}</Text>
                      <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                    </View>
                  </View>
                  <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.section}>
              <Button
                title="Sign Out"
                variant="danger"
                onPress={handleLogout}
                style={styles.logoutButton}
              />
            </View>
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
    paddingBottom: Dimensions.spacing.xl,
  },

  profileHeader: {
    alignItems: "center",
    paddingHorizontal: Dimensions.spacing.lg,
    paddingVertical: Dimensions.spacing.xl,
    backgroundColor: Colors.surface,
  },

  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Dimensions.spacing.md,
  },

  profileInfo: {
    alignItems: "center",
    width: "100%",
  },

  userName: {
    fontSize: Fonts.size["2xl"],
    fontFamily: Fonts.family.semibold,
    color: Colors.text,
    textAlign: "center",
    marginBottom: Dimensions.spacing.xs,
    lineHeight: Fonts.lineHeight["2xl"],
  },

  userEmail: {
    fontSize: Fonts.size.base,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Dimensions.spacing.xs,
    lineHeight: Fonts.lineHeight.base,
  },

  memberSince: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: Fonts.lineHeight.sm,
  },

  editInput: {
    width: "100%",
    marginBottom: Dimensions.spacing.sm,
  },

  disabledInput: {
    opacity: 0.6,
  },

  editActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Dimensions.spacing.md,
    marginTop: Dimensions.spacing.md,
  },

  editButton: {
    minWidth: 80,
  },

  section: {
    marginTop: Dimensions.spacing.lg,
    paddingHorizontal: Dimensions.spacing.lg,
  },

  sectionTitle: {
    fontSize: Fonts.size.lg,
    fontFamily: Fonts.family.semibold,
    color: Colors.text,
    marginBottom: Dimensions.spacing.md,
    lineHeight: Fonts.lineHeight.lg,
  },

  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Dimensions.spacing.md,
    paddingHorizontal: Dimensions.spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Dimensions.borderRadius.md,
    marginBottom: Dimensions.spacing.sm,
  },

  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight + "20",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Dimensions.spacing.md,
  },

  menuText: {
    flex: 1,
  },

  menuTitle: {
    fontSize: Fonts.size.base,
    fontFamily: Fonts.family.medium,
    color: Colors.text,
    marginBottom: 2,
    lineHeight: Fonts.lineHeight.base,
  },

  menuSubtitle: {
    fontSize: Fonts.size.sm,
    fontFamily: Fonts.family.regular,
    color: Colors.textSecondary,
    lineHeight: Fonts.lineHeight.sm,
  },

  logoutButton: {
    marginTop: Dimensions.spacing.lg,
  },
});
