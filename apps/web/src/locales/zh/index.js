import "dayjs/locale/zh-cn";
import { setCalendarLocale } from "@raypx/ui/lib/calendar-locale";
import { zhCN } from "date-fns/locale/zh-CN";
import dayjs from "dayjs";

dayjs.locale("zh-cn");
setCalendarLocale(zhCN);
