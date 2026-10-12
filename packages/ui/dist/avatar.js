import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Avatar as BaseAvatar, AvatarFallback, AvatarImage } from "#components/ui/avatar";
export function Avatar({ name, imageUrl, size = "medium", className, ...props }) {
    const { style, ...restProps } = props;
    const baseSize = {
        small: "sm",
        medium: "default",
        large: "lg",
    }[size];
    const initials = name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0))
        .join("")
        .toUpperCase();
    return (_jsxs(BaseAvatar, { "aria-label": name, className: className, role: "img", size: baseSize, ...restProps, ...(style === undefined ? {} : { style }), children: [imageUrl ? _jsx(AvatarImage, { alt: "", src: imageUrl }) : null, _jsx(AvatarFallback, { children: initials })] }));
}
//# sourceMappingURL=avatar.js.map