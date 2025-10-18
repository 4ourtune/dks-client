/**
 * @format
 */

import { AppRegistry } from "react-native";
import App from "./src/App";
import { name as appName } from "./package.json";

if (typeof global.crypto !== "object") {
  global.crypto = {};
}

if (typeof global.crypto.getRandomValues !== "function") {
  global.crypto.getRandomValues = (typedArray) => {
    if (!typedArray || typeof typedArray.length !== "number") {
      throw new TypeError("Expected typed array for getRandomValues");
    }

    const byteView = new Uint8Array(
      typedArray.buffer,
      typedArray.byteOffset || 0,
      typedArray.byteLength || typedArray.length,
    );

    for (let i = 0; i < byteView.length; i += 1) {
      byteView[i] = Math.floor(Math.random() * 256);
    }

    return typedArray;
  };
}

AppRegistry.registerComponent(appName, () => App);
