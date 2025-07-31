import { type ToasterProps, toast, useSonner } from "sonner"

export * from "./sonner"

const closeAllToasts = () => {
  return toast.getToasts().forEach((t) => toast.dismiss(t.id))
}

export {
  toast,
  useSonner,
  useSonner as useToast,
  closeAllToasts,
  type ToasterProps,
}
