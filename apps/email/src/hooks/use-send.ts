import { useState } from "react";

export function useSend() {
  const [sending, setSending] = useState(false);

  const send = async (templateName: string, to: string, subject?: string) => {
    setSending(true);

    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateName,
          to,
          subject,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to send email");
      }

      return { success: true };
    } catch (error) {
      console.error("Failed to send test email:", error);
      throw error;
    } finally {
      setSending(false);
    }
  };

  return { send, sending };
}
