// src/hooks/useLocalAuth.ts
import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useState } from "react";

export function useLocalAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const authenticate = useCallback(async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !isEnrolled) {
      setIsAuthenticated(true);
      return true;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Authenticate to view account totals",
      fallbackLabel: "Use Passcode",
    });

    setIsAuthenticated(result.success);
    return result.success;
  }, []);

  return { isAuthenticated, authenticate, setIsAuthenticated };
}
