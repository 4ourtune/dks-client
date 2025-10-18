declare module "react-native-vector-icons/MaterialIcons" {
  import type { ComponentType } from "react";
  import type { TextProps } from "react-native";

  export interface MaterialIconProps extends TextProps {
    name: string;
    size?: number;
    color?: string;
  }

  const MaterialIcons: ComponentType<MaterialIconProps>;
  export default MaterialIcons;
}
