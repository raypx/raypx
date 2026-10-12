import { Toast as ToastPrimitive } from "@base-ui/react/toast";
declare const toast: any;
declare function ToastProvider({ ...props }: ToastPrimitive.Provider.Props): any;
declare function ToastPortal({ ...props }: ToastPrimitive.Portal.Props): any;
declare const ToastViewport: any;
declare const Toast: any;
declare const ToastContent: any;
declare const ToastTitle: any;
declare const ToastDescription: any;
declare function ToastAction({ className, render, ...props }: ToastPrimitive.Action.Props): any;
declare function ToastClose({ className, children, render, ...props }: ToastPrimitive.Close.Props): any;
declare function Toaster({ children, toastManager, ...props }: ToastPrimitive.Provider.Props): any;
declare const createToastManager: any;
declare const useToastManager: any;
export { Toaster, Toast, ToastAction, ToastClose, ToastContent, ToastDescription, ToastPortal, ToastProvider, ToastTitle, ToastViewport, createToastManager, toast, useToastManager, };
//# sourceMappingURL=toast.d.ts.map