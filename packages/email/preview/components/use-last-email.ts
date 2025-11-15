import { useState } from "react";

const LAST_EMAIL_STORAGE_KEY = "raypx-email-preview-last-email";

/**
 * Hook to manage the last email address used in the preview app
 * Stores the email in localStorage so it persists across page refreshes
 * @returns The last email address and a function to save it
 */
export function useLastEmail() {
  const [lastEmail, setLastEmailState] = useState<string | null>(() => {
    // Initialize from localStorage
    if (typeof window !== "undefined") {
      return localStorage.getItem(LAST_EMAIL_STORAGE_KEY);
    }
    return null;
  });

  // Function to save email to localStorage
  const saveLastEmail = (email: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(LAST_EMAIL_STORAGE_KEY, email);
    }
    setLastEmailState(email);
  };

  return { lastEmail, saveLastEmail };
}
