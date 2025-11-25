import { useCallback, useState } from "react";
import { useTemplatePreview } from "./use-preview";

type SendDialogState = {
  open: boolean;
  testEmail: string;
  subject: string;
};

export function useSendDialog(templateName: string) {
  const { defaultSubject } = useTemplatePreview(templateName);
  const [state, setState] = useState<SendDialogState>({
    open: false,
    testEmail: "",
    subject: "",
  });

  const openDialog = useCallback(() => {
    setState({
      open: true,
      testEmail: "",
      subject: defaultSubject,
    });
  }, [defaultSubject]);

  const closeDialog = useCallback(() => {
    setState({
      open: false,
      testEmail: "",
      subject: "",
    });
  }, []);

  const setTestEmail = useCallback((email: string) => {
    setState((prev) => ({ ...prev, testEmail: email }));
  }, []);

  const setSubject = useCallback((subject: string) => {
    setState((prev) => ({ ...prev, subject }));
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        openDialog();
      } else {
        closeDialog();
      }
    },
    [openDialog, closeDialog],
  );

  return {
    open: state.open,
    testEmail: state.testEmail,
    subject: state.subject,
    openDialog,
    closeDialog,
    setTestEmail,
    setSubject,
    handleOpenChange,
  };
}
