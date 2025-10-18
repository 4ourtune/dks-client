import React from "react";
import {
  createBottomTabNavigator,
  type BottomTabNavigationOptions,
} from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import Icon from "react-native-vector-icons/MaterialIcons";
import { Colors, Fonts, Dimensions } from "@/styles";
import { HomeScreen } from "@/screens/other/HomeScreen";
import { ProfileScreen } from "@/screens/auth";
import { AddVehicleScreen, VehicleDetailScreen, VehicleListScreen } from "@/screens/vehicle";
import type { RouteProp } from "@react-navigation/native";

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

type TabRoute = RouteProp<Record<string, object | undefined>, string>;
type TabBarIconProps = { color: string; size: number };

const getTabIconName = (routeName: string): string => {
  switch (routeName) {
    case "Home":
      return "home";
    case "Profile":
      return "person";
    default:
      return "home";
  }
};

const createTabBarIcon = (routeName: string) => {
  return ({ color, size }: TabBarIconProps) => (
    <Icon name={getTabIconName(routeName)} size={size} color={color} />
  );
};

const buildScreenOptions = ({ route }: { route: TabRoute }): BottomTabNavigationOptions => ({
  tabBarIcon: createTabBarIcon(route.name),
  tabBarActiveTintColor: Colors.primary,
  tabBarInactiveTintColor: Colors.textSecondary,
  tabBarStyle: {
    height: Dimensions.tabBar.height,
    paddingBottom: 8,
    paddingTop: 8,
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
  },
  tabBarLabelStyle: {
    fontSize: Fonts.size.xs,
    fontFamily: Fonts.family.medium,
  },
  headerShown: false,
});

const HomeStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="HomeMain" component={HomeScreen} />
    <Stack.Screen name="VehicleList" component={VehicleListScreen} />
    <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} />
    <Stack.Screen name="AddVehicle" component={AddVehicleScreen} />
  </Stack.Navigator>
);

const ProfileStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ProfileMain" component={ProfileScreen} />
  </Stack.Navigator>
);

export const MainNavigator: React.FC = () => {
  return (
    <Tab.Navigator screenOptions={buildScreenOptions}>
      <Tab.Screen name="Home" component={HomeStack} options={{ title: "Home" }} />
      <Tab.Screen name="Profile" component={ProfileStack} options={{ title: "Profile" }} />
    </Tab.Navigator>
  );
};
